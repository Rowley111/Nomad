"""Optional, isolated real-PostgreSQL test. No production tables are touched."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url

from server.app import create_app
from server.database import make_engine
from server.models import User
from server.security import password_hash


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(not os.environ.get("NOMAD_TEST_POSTGRES_URL"), reason="NOMAD_TEST_POSTGRES_URL not configured")
def test_postgres_migrations_jsonb_import_and_two_clients(monkeypatch):
    address = make_url(os.environ["NOMAD_TEST_POSTGRES_URL"])
    if address.host not in ("127.0.0.1", "localhost") or not (address.database or "").endswith("_test"):
        pytest.fail("PostgreSQL integration requires a local isolated *_test database")
    schema = "nomad_test_" + uuid.uuid4().hex
    base = make_engine(address.render_as_string(hide_password=False))
    app = None
    try:
        with base.begin() as connection:
            connection.execute(text('CREATE SCHEMA "' + schema + '"'))
        scoped = address.update_query_dict({"options": "-csearch_path=" + schema})
        url = scoped.render_as_string(hide_password=False)
        monkeypatch.setenv("DATABASE_URL", url)
        config = Config(str(ROOT / "server/alembic.ini"))
        command.upgrade(config, "head")
        command.upgrade(config, "head")
        app = create_app(url, ["https://nomad.example"])
        password = secrets.token_urlsafe(24)
        with app.state.sessions() as db:
            db.add(User(id="pg-owner", username="owner", role="admin", password_hash=password_hash(password)))
            db.commit()
        script = """
import {emptyState} from './src/domain/storage.js';
import {addRepairLoss} from './src/domain/repairs.js';
const state=emptyState();
state.inventory.push({id:'legacy',model:'Samsung Galaxy A35 5G',buy:50000,sell:89000,status:'В наличии',legacy:true,sale:null});
console.log(JSON.stringify(addRepairLoss(state,{amount:-5000,lostOn:'2026-11-04',reason:'Тестовый убыток'},'pg-loss')));
"""
        state = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True))
        with TestClient(app) as first, TestClient(app) as second:
            assert first.get("/api/workspace").status_code == 401
            def login(client):
                result = client.post("/api/auth/login", json={"username": "owner", "password": password})
                assert result.status_code == 200
                return {"Authorization": "Bearer " + result.json()["token"]}
            h1, h2 = login(first), login(second)
            preview = first.post("/api/import/preview", headers=h1, json={"state": state}).json()
            imported = first.post("/api/import/commit", headers=h1, json={"previewId": preview["previewId"], "operationId": str(uuid.uuid4())})
            assert imported.status_code == 200, imported.text
            current = second.get("/api/workspace", headers=h2).json()
            assert current == {key: imported.json()[key] for key in ("state", "revision")}
            assert current["state"]["repairLosses"][0]["amount"] == -5000
            changed = deepcopy(current["state"])
            changed["policy"]["risk"] += 1
            body = {"state": changed, "revision": current["revision"], "operationId": str(uuid.uuid4())}
            saved = first.put("/api/workspace", headers=h1, json=body)
            assert saved.status_code == 200, saved.text
            assert first.put("/api/workspace", headers=h1, json=body).json() == saved.json()
            body["operationId"] = str(uuid.uuid4())
            assert second.put("/api/workspace", headers=h2, json=body).status_code == 409
            repeated = second.post("/api/import/preview", headers=h2, json={"state": state})
            assert repeated.status_code == 200, repeated.text
            assert repeated.json()["report"]["totalAdded"] == 0
            # True concurrent requests to two independent HTTP clients share one DB revision.
            revision = saved.json()["revision"]
            def write(client, headers, value):
                candidate = deepcopy(saved.json()["state"])
                candidate["policy"]["risk"] = value
                return client.put("/api/workspace", headers=headers, json={"state": candidate, "revision": revision, "operationId": str(uuid.uuid4())}).status_code
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(write, first, h1, 1000), executor.submit(write, second, h2, 2000)]
                assert sorted(future.result(timeout=30) for future in futures) == [200, 409]
            final = first.get("/api/workspace", headers=h1).json()
            assert second.get("/api/workspace", headers=h2).json() == final
            assert len(final["state"]["inventory"]) == 1
            assert final["state"]["inventory"][0]["buy"] == 50000
        with base.connect() as connection:
            assert connection.execute(text("SELECT data_type FROM information_schema.columns WHERE table_schema=:schema AND table_name='nomad_workspace' AND column_name='state'"), {"schema": schema}).scalar_one() == "jsonb"
    finally:
        if app is not None:
            app.state.engine.dispose()
        with base.begin() as connection:
            connection.execute(text('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'))
        base.dispose()
