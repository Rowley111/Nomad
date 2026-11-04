"""These tests use the real HTTP handlers, Alembic schema and Node domain worker."""

from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import subprocess
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from server.app import create_app
from server.models import Audit, Operation, SessionToken, User, Workspace, utcnow
from server.security import digest, password_hash


ROOT = Path(__file__).resolve().parents[2]
PASSWORD = "local-test-password-2026"


@pytest.fixture
def base_state():
    process = subprocess.run(["node", "--input-type=module", "-e", "import {emptyState} from './src/domain/storage.js'; console.log(JSON.stringify(emptyState()))"], cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(process.stdout)


@pytest.fixture
def api(tmp_path, monkeypatch):
    url = "sqlite:///" + str(tmp_path / "workspace.db")
    monkeypatch.setenv("NOMAD_ALLOW_SQLITE", "1")
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(ROOT / "server/alembic.ini"))
    command.upgrade(config, "head")
    # Repeating the migration is a no-op, including the singleton workspace.
    command.upgrade(config, "head")
    app = create_app(url, ["https://nomad.example"])
    with app.state.sessions() as db:
        db.add_all([
            User(id="admin", username="owner", role="admin", password_hash=password_hash(PASSWORD)),
            User(id="staff", username="worker", role="staff", password_hash=password_hash(PASSWORD)),
        ])
        db.commit()
    with TestClient(app) as client:
        yield client, app
    app.state.engine.dispose()


def login(client, username="owner"):
    response = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["token"]}


def put(client, headers, state, revision=0, operation=None):
    return client.put("/api/workspace", headers=headers, json={"state": state, "revision": revision, "operationId": operation or str(uuid.uuid4())})


def test_migrations_and_anonymous_protection(api):
    client, app = api
    assert client.get("/api/health").json() == {"status": "ok"}
    for method, path, body in [("GET", "/api/workspace", None), ("PUT", "/api/workspace", {}), ("POST", "/api/import/preview", {}), ("POST", "/api/import/commit", {}), ("GET", "/api/audit", None), ("POST", "/api/evaluate", {})]:
        response = client.request(method, path, json=body)
        assert response.status_code == 401, (path, response.text)
        assert "state" not in response.json()
    assert client.post("/api/auth/register", json={}).status_code == 404
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Workspace)) == 1


def test_login_tokens_are_hashed_revocable_expiring_and_memory_safe(api):
    client, app = api
    headers = login(client)
    token = headers["Authorization"].removeprefix("Bearer ")
    response = client.get("/api/auth/me", headers=headers)
    assert response.json() == {"username": "owner", "role": "admin"}
    assert response.headers["cache-control"] == "no-store"
    with app.state.sessions() as db:
        session = db.get(SessionToken, digest(token))
        assert session is not None
        assert db.get(SessionToken, token) is None
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/workspace", headers=headers).status_code == 401
    headers = login(client)
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/workspace", headers=headers).status_code == 401


def test_login_rate_limit_is_persistent_and_no_password_echo(api):
    client, app = api
    for _ in range(5):
        response = client.post("/api/auth/login", json={"username": "owner", "password": "wrong-private-password"})
        assert response.status_code == 401
        assert "wrong-private-password" not in response.text
    assert client.post("/api/auth/login", json={"username": "owner", "password": PASSWORD}).status_code == 429
    # A new HTTP client observes the same database-backed limit.
    with TestClient(app) as another:
        assert another.post("/api/auth/login", json={"username": "owner", "password": PASSWORD}).status_code == 429
    invalid = client.post("/api/auth/login", json={"username": "x", "password": "secret" * 200})
    assert invalid.status_code == 422 and "secret" not in invalid.text


def test_two_clients_optimistic_concurrency_and_idempotency(api, base_state):
    client, app = api
    headers = login(client)
    assert client.get("/api/workspace", headers=headers).json() == {"state": None, "revision": 0}
    operation = str(uuid.uuid4())
    first = put(client, headers, base_state, operation=operation)
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == 1
    assert put(client, headers, base_state, operation=operation).json() == first.json()
    changed = deepcopy(base_state)
    changed["policy"]["markup"] = 30
    assert put(client, headers, changed, operation=operation).status_code == 409
    with TestClient(app) as second:
        second_headers = login(second)
        shared = second.get("/api/workspace", headers=second_headers).json()
        assert shared == first.json()
        assert put(second, second_headers, changed, revision=1).json()["revision"] == 2
    # First client still holding revision 1 cannot clobber the second client's edit.
    assert put(client, headers, base_state, revision=1).status_code == 409
    assert client.get("/api/workspace", headers=headers).json()["state"]["policy"]["markup"] == 30
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Operation)) == 2
        history = db.scalars(select(Audit).order_by(Audit.revision)).all()
        assert len(history) == 2
        assert history[1].before_state["policy"]["markup"] == 25
        assert history[1].after_state["policy"]["markup"] == 30


def test_staff_cannot_initialize_rewrite_settings_or_import(api, base_state):
    client, _ = api
    staff = login(client, "worker")
    assert put(client, staff, base_state).status_code == 403
    admin = login(client)
    assert put(client, admin, base_state).status_code == 200
    changed = deepcopy(base_state)
    changed["policy"]["markup"] = 99
    assert put(client, staff, changed, revision=1).status_code == 403
    assert client.post("/api/import/preview", headers=staff, json={"state": base_state}).status_code == 403
    assert client.get("/api/audit", headers=staff).status_code == 403
    assert client.get("/api/workspace", headers=staff).json()["revision"] == 1


def test_import_preview_commit_repeat_and_stale_preview(api, base_state):
    client, app = api
    headers = login(client)
    incoming = deepcopy(base_state)
    incoming["inventory"] = [{"id": "old-phone", "model": "Samsung Galaxy A35 5G", "buy": 50000, "sell": 89000, "status": "Продан", "legacy": True, "legacySold": True, "sale": None}]
    preview = client.post("/api/import/preview", headers=headers, json={"state": incoming})
    assert preview.status_code == 200, preview.text
    body = {"previewId": preview.json()["previewId"], "operationId": str(uuid.uuid4())}
    assert client.get("/api/workspace", headers=headers).json()["state"] is None
    committed = client.post("/api/import/commit", headers=headers, json=body)
    assert committed.status_code == 200, committed.text
    assert committed.json()["state"]["inventory"][0]["sale"] is None
    assert client.post("/api/import/commit", headers=headers, json=body).json() == committed.json()
    duplicate = client.post("/api/import/preview", headers=headers, json={"state": incoming}).json()
    assert duplicate["report"]["totalAdded"] == 0
    assert duplicate["report"]["duplicates"]["inventory"] == 1
    repeated = client.post("/api/import/commit", headers=headers, json={"previewId": duplicate["previewId"], "operationId": str(uuid.uuid4())})
    assert len(repeated.json()["state"]["inventory"]) == 1
    assert client.post("/api/import/commit", headers=headers, json={"previewId": preview.json()["previewId"], "operationId": str(uuid.uuid4())}).status_code == 409
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Audit)) == 2


def test_import_conflict_keeps_server_record_and_legacy_metadata(api, base_state):
    client, _ = api
    headers = login(client)
    state = deepcopy(base_state)
    state["inventory"] = [{"id": "existing", "model": "Phone", "buy": 0, "sell": 89000, "status": "В наличии", "legacy": True, "sale": None}]
    p = client.post("/api/import/preview", headers=headers, json={"state": state}).json()
    assert client.post("/api/import/commit", headers=headers, json={"previewId": p["previewId"], "operationId": str(uuid.uuid4())}).status_code == 200
    changed = deepcopy(state)
    changed["inventory"][0]["buy"] = 10000
    p = client.post("/api/import/preview", headers=headers, json={"state": changed}).json()
    assert any(conflict["collection"] == "inventory" for conflict in p["report"]["conflicts"])
    result = client.post("/api/import/commit", headers=headers, json={"previewId": p["previewId"], "operationId": str(uuid.uuid4())})
    assert result.json()["state"]["inventory"][0]["buy"] == 0


def test_validation_rejects_tampered_money_and_keeps_database(api, base_state):
    client, _ = api
    headers = login(client)
    assert put(client, headers, base_state).status_code == 200
    bad = deepcopy(base_state)
    bad["policy"]["minProfit"] = -1
    assert put(client, headers, bad, revision=1).status_code == 422
    # Non-standard JSON NaN is rejected without a traceback or DB update.
    raw = json.dumps({"state": base_state, "revision": 1, "operationId": str(uuid.uuid4())}).replace('"markup": 25', '"markup": NaN')
    response = client.put("/api/workspace", headers={**headers, "Content-Type": "application/json"}, content=raw)
    assert response.status_code == 422
    assert client.get("/api/workspace", headers=headers).json()["revision"] == 1


def test_cors_exact_origin_and_body_limit(api):
    client, _ = api
    response = client.options("/api/workspace", headers={"Origin": "https://nomad.example", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "Authorization,Content-Type"})
    assert response.headers["access-control-allow-origin"] == "https://nomad.example"
    forbidden = client.options("/api/workspace", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PUT"})
    assert "access-control-allow-origin" not in forbidden.headers
    response = client.post("/api/import/preview", headers={"Content-Type": "application/json"}, content=" " * (5 * 1024 * 1024 + 1))
    assert response.status_code == 413
