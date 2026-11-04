"""Authenticated transactional storage. Migrations are never run on startup."""

from datetime import timedelta, timezone
import json
import logging
import os
import secrets
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import make_engine, session_factory
from .imports import merge_local_state
from .models import Audit, ImportPreview, LoginWindow, Operation, SessionToken, User, Workspace, utcnow
from .security import DUMMY_HASH, check_password, digest
from .validation import DomainError, evaluate_state, validate_state

MAX_BODY = 5 * 1024 * 1024
logger = logging.getLogger("nomad.api")


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def payload_hash(value):
    try:
        return digest(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, "Данные содержат недопустимые числа") from exc


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        total = 0
        messages = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > MAX_BODY:
                response = JSONResponse({"detail": "Файл превышает 5 MiB"}, status_code=413)
                return await response(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break

        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()

        await self.app(scope, replay, send)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)


class Save(Input):
    state: dict
    revision: int = Field(ge=0, strict=True)
    operationId: str = Field(pattern=r"^[A-Za-z0-9_.:-]{8,128}$")


class Preview(Input):
    state: dict


class Evaluate(Input):
    input: dict
    priceId: str | None = Field(default=None, max_length=256)


class CommitImport(Input):
    previewId: str = Field(min_length=16, max_length=64)
    operationId: str = Field(pattern=r"^[A-Za-z0-9_.:-]{8,128}$")


def staff_permissions(previous, state):
    if previous is None:
        raise HTTPException(403, "Общую базу сначала заполняет администратор")
    for key in ("catalog", "policy", "prices", "priceHistory", "setupImports"):
        if previous.get(key) != state.get(key):
            raise HTTPException(403, "Изменять прайс, каталог и политику может только администратор")
    for key in ("events", "repairEvents", "assessments"):
        old = previous.get(key, [])
        new = state.get(key, [])
        if new[: len(old)] != old:
            raise HTTPException(403, "Существующая история не может быть переписана")
    for key in ("inventory", "repairOrders", "repairLosses", "repairTypes", "materialCatalog"):
        before = {str(row["id"]) for row in previous.get(key, [])}
        after = {str(row["id"]) for row in state.get(key, [])}
        if not before.issubset(after):
            raise HTTPException(403, "Удаление существующих записей запрещено")


def create_app(database_url=None, frontend_origins=None):
    app = FastAPI(title="Nomad Mobile API", docs_url=None, redoc_url=None, openapi_url=None)
    url = database_url or os.environ.get("DATABASE_URL")
    if url and url.startswith("sqlite:") and os.environ.get("NOMAD_ALLOW_SQLITE") != "1":
        raise RuntimeError("SQLite разрешён только для локальной проверки NOMAD_ALLOW_SQLITE=1")
    app.state.engine = make_engine(url) if url else None
    app.state.sessions = session_factory(app.state.engine) if url else None
    app.state.validate = validate_state
    origins = frontend_origins if frontend_origins is not None else os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    origins = [origin.strip().rstrip("/") for origin in origins if origin.strip()]
    if "*" in origins:
        raise RuntimeError("FRONTEND_ORIGIN должен содержать точные адреса")
    app.add_middleware(BodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT"], allow_headers=["Authorization", "Content-Type"])
    auth = HTTPBearer(auto_error=False)

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    def db_session():
        if app.state.sessions is None:
            raise HTTPException(503, "Серверная база не настроена")
        with app.state.sessions() as db:
            yield db

    def user(credentials: HTTPAuthorizationCredentials | None = Depends(auth), db=Depends(db_session)):
        if credentials is None or credentials.scheme.lower() != "bearer" or len(credentials.credentials) > 1024:
            raise HTTPException(401, "Войдите в систему", headers={"WWW-Authenticate": "Bearer"})
        token = db.get(SessionToken, digest(credentials.credentials))
        if token is None or aware(token.expires_at) <= utcnow():
            raise HTTPException(401, "Сессия истекла. Войдите снова", headers={"WWW-Authenticate": "Bearer"})
        account = db.get(User, token.user_id)
        if account is None or not account.active or account.role not in ("admin", "staff"):
            raise HTTPException(401, "Доступ отключён")
        return account

    def admin(account=Depends(user)):
        if account.role != "admin":
            raise HTTPException(403, "Нужны права администратора")
        return account

    def workspace(db, *, lock=False):
        query = select(Workspace).where(Workspace.id == 1)
        if lock:
            query = query.with_for_update()
        value = db.scalar(query)
        if value is None:
            raise HTTPException(503, "База требует серверной миграции")
        return value

    def validate(value, previous=None, transition=False):
        try:
            return app.state.validate(value, previous, transition=transition)
        except (DomainError, ValueError) as exc:
            raise HTTPException(422, str(exc)[:1000]) from exc
        except RuntimeError as exc:
            raise HTTPException(503, "Проверка серверных правил временно недоступна") from exc

    def replay_operation(db, operation_id, account, hashed):
        operation = db.get(Operation, operation_id)
        if operation is None:
            return None
        if operation.user_id != account.id or operation.payload_hash != hashed:
            raise HTTPException(409, "Идентификатор операции уже использован для других данных")
        return operation.response

    def save(db, account, current, state, expected, operation_id, hashed, action, report=None):
        if current.revision != expected:
            raise HTTPException(409, "Данные изменены другим сотрудником. Обновите страницу перед сохранением")
        before = current.state
        revision = expected + 1
        count = db.execute(update(Workspace).where(Workspace.id == 1, Workspace.revision == expected).values(state=state, revision=revision, updated_at=utcnow())).rowcount
        if count != 1:
            raise HTTPException(409, "Данные изменены другим сотрудником. Повторите после обновления")
        response = {"state": state, "revision": revision}
        if report is not None:
            response["report"] = report
        db.add(Audit(id=uuid.uuid4().hex, user_id=account.id, action=action, revision=revision, before_state=before, after_state=state))
        db.add(Operation(id=operation_id, user_id=account.id, payload_hash=hashed, revision=revision, response=response))
        db.commit()
        return response

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_request, _error):
        # Never log DB exceptions: driver messages can contain connection strings.
        logger.error("Database operation failed; inspect server configuration privately")
        return JSONResponse({"detail": "Серверная база временно недоступна"}, status_code=503)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _error):
        # Pydantic's default error body can echo passwords and complete imported data.
        return JSONResponse({"detail": "Некорректные поля запроса"}, status_code=422)

    @app.get("/api/health")
    def health(db=Depends(db_session)):
        workspace(db)
        return {"status": "ok"}

    @app.post("/api/auth/login")
    def login(body: Login, request: Request, db=Depends(db_session)):
        username = body.username.strip().casefold()
        address = request.client.host if request.client else "unknown"
        buckets = [("ip:" + address, 20), ("user:" + username, 10), ("pair:" + address + ":" + username, 5)]
        windows = []
        for source, limit in buckets:
            key = digest(source)
            window = db.scalar(select(LoginWindow).where(LoginWindow.key == key).with_for_update())
            if window is None:
                window = LoginWindow(key=key, attempts=0, started_at=utcnow())
                db.add(window)
                try:
                    db.flush()
                except IntegrityError:
                    db.rollback()
                    window = db.scalar(select(LoginWindow).where(LoginWindow.key == key).with_for_update())
                    if window is None:
                        raise HTTPException(429, "Повторите вход позже")
            if aware(window.started_at) + timedelta(minutes=15) <= utcnow():
                window.started_at = utcnow()
                window.attempts = 0
            if window.attempts >= limit:
                db.commit()
                raise HTTPException(429, "Слишком много попыток входа. Подождите 15 минут", headers={"Retry-After": "900"})
            window.attempts += 1
            windows.append(window)
        account = db.scalar(select(User).where(User.username == username))
        correct = check_password(body.password, account.password_hash if account else DUMMY_HASH)
        if not account or not correct or not account.active:
            db.commit()
            raise HTTPException(401, "Неверный логин или пароль")
        for window in windows[1:]:
            window.attempts = 0
        token = secrets.token_urlsafe(32)
        hours = min(24, max(1, int(os.environ.get("SESSION_HOURS", "8"))))
        db.add(SessionToken(token_hash=digest(token), user_id=account.id, expires_at=utcnow() + timedelta(hours=hours)))
        db.commit()
        return {"token": token, "user": {"username": account.username, "role": account.role}}

    @app.get("/api/auth/me")
    def me(account=Depends(user)):
        return {"username": account.username, "role": account.role}

    @app.post("/api/auth/logout")
    def logout(credentials: HTTPAuthorizationCredentials = Depends(auth), account=Depends(user), db=Depends(db_session)):
        token = db.get(SessionToken, digest(credentials.credentials))
        db.delete(token)
        db.commit()
        return {"ok": True}

    @app.get("/api/workspace")
    def get_workspace(account=Depends(user), db=Depends(db_session)):
        value = workspace(db)
        return {"state": value.state, "revision": value.revision}

    @app.post("/api/evaluate")
    def evaluate(body: Evaluate, account=Depends(user), db=Depends(db_session)):
        current = workspace(db)
        if current.state is None:
            raise HTTPException(409, "Прайс ещё не перенесён в общую базу")
        try:
            return {"result": evaluate_state(current.state, body.input, body.priceId), "revision": current.revision}
        except DomainError as exc:
            raise HTTPException(422, str(exc)[:1000]) from exc
        except RuntimeError as exc:
            raise HTTPException(503, "Проверка серверных правил временно недоступна") from exc

    @app.put("/api/workspace")
    def put_workspace(body: Save, account=Depends(user), db=Depends(db_session)):
        hashed = payload_hash({"kind": "save", **body.model_dump()})
        replay = replay_operation(db, body.operationId, account, hashed)
        if replay is not None:
            return replay
        value = workspace(db, lock=True)
        replay = replay_operation(db, body.operationId, account, hashed)
        if replay is not None:
            return replay
        if value.revision != body.revision:
            raise HTTPException(409, "Данные изменены другим сотрудником. Обновите страницу")
        state = validate(body.state, value.state, transition=value.state is not None)
        if account.role == "staff":
            staff_permissions(value.state, state)
        return save(db, account, value, state, body.revision, body.operationId, hashed, "workspace-save")

    @app.post("/api/import/preview")
    def import_preview(body: Preview, account=Depends(admin), db=Depends(db_session)):
        incoming = validate(body.state)
        value = workspace(db)
        merged, report = merge_local_state(value.state, incoming)
        merged = validate(merged)
        preview = ImportPreview(id=secrets.token_urlsafe(24), user_id=account.id, revision=value.revision, digest=payload_hash(incoming), state=merged, report=report, expires_at=utcnow() + timedelta(minutes=30))
        db.add(preview)
        db.commit()
        return {"previewId": preview.id, "revision": preview.revision, "report": report}

    @app.post("/api/import/commit")
    def import_commit(body: CommitImport, account=Depends(admin), db=Depends(db_session)):
        hashed = payload_hash({"kind": "import", **body.model_dump()})
        replay = replay_operation(db, body.operationId, account, hashed)
        if replay is not None:
            return replay
        value = workspace(db, lock=True)
        replay = replay_operation(db, body.operationId, account, hashed)
        if replay is not None:
            return replay
        preview = db.get(ImportPreview, body.previewId)
        if preview is None or preview.user_id != account.id or aware(preview.expires_at) <= utcnow():
            raise HTTPException(409, "Предпросмотр истёк. Подготовьте импорт заново")
        if preview.revision != value.revision:
            raise HTTPException(409, "Общая база изменилась. Повторите предпросмотр импорта")
        state = validate(preview.state)
        return save(db, account, value, state, preview.revision, body.operationId, hashed, "local-import", preview.report)

    @app.get("/api/audit")
    def audit(account=Depends(admin), db=Depends(db_session)):
        rows = db.execute(select(Audit, User.username).join(User, Audit.user_id == User.id).order_by(Audit.at.desc()).limit(200)).all()
        return {"events": [{"id": row.id, "action": row.action, "username": username, "at": aware(row.at).isoformat(), "revision": row.revision} for row, username in rows]}

    return app


app = create_app()
