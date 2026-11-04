"""Cash backups merge without inventing money or replaying an operation twice."""

from copy import deepcopy
import json
import subprocess
import uuid

from server.imports import merge_local_state
from server.tests.test_api import ROOT, api, base_state, login, put


def node_ledger(state):
    script = """
import {readFileSync} from 'node:fs';
import {saveEmployee,addCashTransaction} from './src/domain/cash.js';
let state=JSON.parse(readFileSync(0,'utf8'));
state=saveEmployee(state,{name:'Сотрудник API-теста',jobTitle:'Мастер',phone:'00701123456'});
const employeeId=state.employees.at(-1).id;
const common={happenedOn:'2026-10-28',reason:'Синтетическая операция теста импорта'};
state=addCashTransaction(state,{...common,kind:'income',accountId:'cash',categoryId:'income-sales',amount:20000},'cash-import-receipt');
state=addCashTransaction(state,{...common,kind:'transfer',accountId:'cash',toAccountId:'bank',amount:5000},'cash-import-transfer');
state=addCashTransaction(state,{...common,kind:'expense',accountId:'cash',categoryId:'expense-salary',employeeId,amount:2000},'cash-import-salary');
state=addCashTransaction(state,{...common,kind:'expense',accountId:'bank',categoryId:'expense-water',amount:1200},'cash-import-water');
console.log(JSON.stringify(state));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(state), cwd=ROOT, text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


def node_report(state):
    script = """
import {readFileSync} from 'node:fs';
import {cashReport} from './src/domain/cash.js';
console.log(JSON.stringify(cashReport(JSON.parse(readFileSync(0,'utf8')))));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(state), cwd=ROOT, text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


def test_cash_backup_preview_commit_and_repeat_preserve_money_and_history(api, base_state):
    client, _ = api
    owner = login(client)
    assert put(client, owner, base_state).status_code == 200
    initial = node_report(client.get("/api/workspace", headers=owner).json()["state"])
    assert initial["balance"] == 0
    assert initial["income"] == 0 and initial["expenses"] == 0
    assert all(account["balance"] == 0 for account in initial["accounts"])
    incoming = node_ledger(base_state)

    preview = client.post("/api/import/preview", headers=owner, json={"state": incoming})
    assert preview.status_code == 200, preview.text
    assert preview.json()["report"]["added"]["cashTransactions"] == 4
    assert preview.json()["report"]["added"]["employees"] == 1
    assert client.get("/api/workspace", headers=owner).json()["state"]["cashTransactions"] == []
    operation = str(uuid.uuid4())
    body = {"previewId": preview.json()["previewId"], "operationId": operation}
    committed = client.post("/api/import/commit", headers=owner, json=body)
    assert committed.status_code == 200, committed.text
    assert client.post("/api/import/commit", headers=owner, json=body).json() == committed.json()
    state = committed.json()["state"]
    assert state["cashSchemaVersion"] == incoming["cashSchemaVersion"]
    assert state["cashStartedAt"] == incoming["cashStartedAt"]
    for name in ("cashAccounts", "cashCategories", "employees", "cashTransactions", "cashEvents"):
        assert state[name] == incoming[name]
    report = node_report(state)
    assert {row["id"]: row["balance"] for row in report["accounts"]} == {"cash": 13000, "bank": 3800}
    assert report["balance"] == 16800
    assert report["income"] == 20000 and report["expenses"] == 3200
    assert report["transferIn"] == report["transferOut"] == 5000
    salary = next(row for row in state["cashTransactions"] if row["operationId"] == "cash-import-salary")
    assert salary["employeeName"] == "Сотрудник API-теста" and salary["employeeJobTitle"] == "Мастер"

    repeated = client.post("/api/import/preview", headers=owner, json={"state": incoming})
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["report"]["totalAdded"] == 0
    assert repeated.json()["report"]["duplicates"]["cashTransactions"] == 4
    second = client.post("/api/import/commit", headers=owner, json={
        "previewId": repeated.json()["previewId"], "operationId": str(uuid.uuid4()),
    })
    assert second.status_code == 200, second.text
    assert second.json()["state"] == state
    assert node_report(second.json()["state"])["balance"] == 16800


def test_cash_operation_natural_key_keeps_existing_financials_and_skips_orphan_events(base_state):
    current = node_ledger(base_state)
    original = deepcopy(current)
    incoming = deepcopy(current)
    transaction = next(row for row in incoming["cashTransactions"] if row["operationId"] == "cash-import-salary")
    old_id, new_id = transaction["id"], "duplicate-copy-" + uuid.uuid4().hex
    transaction["id"] = new_id
    for event in incoming["cashEvents"]:
        if event.get("transactionId") == old_id:
            event["transactionId"] = new_id
            event["id"] = "duplicate-event-" + uuid.uuid4().hex
            if event.get("after", {}).get("id") == old_id:
                event["after"]["id"] = new_id
    merged, report = merge_local_state(current, incoming)
    assert current == original
    assert merged["cashTransactions"] == original["cashTransactions"]
    assert merged["cashEvents"] == original["cashEvents"]
    assert report["duplicates"]["cashTransactions"] == 4
    assert any(row["collection"] == "cashEvents" for row in report["conflicts"])

    transaction["amount"] = 500000
    transaction["signedAmount"] = -500000
    for event in incoming["cashEvents"]:
        if event.get("transactionId") == new_id:
            event["after"]["amount"] = 500000
            event["after"]["signedAmount"] = -500000
    merged, report = merge_local_state(current, incoming)
    assert current == original
    assert merged["cashTransactions"] == original["cashTransactions"]
    assert merged["cashEvents"] == original["cashEvents"]
    assert len(merged["cashTransactions"]) == 4
    assert any(row["collection"] == "cashTransactions" and row["id"] == new_id for row in report["conflicts"])
    assert all(row.get("transactionId") != new_id for row in merged["cashEvents"])
    assert node_report(merged)["balance"] == 16800
