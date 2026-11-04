"""Dated business events use real API handlers, migrations and the shared Node worker."""

from copy import deepcopy
import json
import subprocess

from server.tests.test_api import ROOT, api, base_state, login, put


def transform(state, operation):
    script = """
import {readFileSync} from 'node:fs';
import {recordSale,returnSale,confirmLegacySale,purchase} from './src/domain/storage.js';
import {getSalesHistory,salesReport} from './src/domain/sales.js';
import {addCashTransaction,voidCashTransaction,saveEmployee,getAccountBalance} from './src/domain/cash.js';
import {createRepair,updateRepair} from './src/domain/repairs.js';
import {initialInput,changeModel} from './src/domain/catalog.js';
import {evaluate} from './src/domain/valuation.js';
import {findWorkbookPrice} from './src/domain/workbook.js';
const request=JSON.parse(readFileSync(0,'utf8'));
let state=request.state, extra={};
""" + operation + "\nconsole.log(JSON.stringify({state,extra}));"
    result = subprocess.run(["node", "--input-type=module", "-e", script], input=json.dumps({"state": state}), cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def status(response, expected):
    detail = response.json().get("detail", "workspace response")
    assert response.status_code == expected, f"HTTP {response.status_code}: {detail}"


def with_stock(base_state, *, sold=False, buy=0):
    state = deepcopy(base_state)
    state["inventory"] = [{"id": "a35-history", "model": "Samsung Galaxy A35 5G", "storage": 128, "ram": 8, "buy": buy, "sell": 89000, "status": "Продан" if sold else "В наличии", "date": "2026-09-01", "sale": None, "legacy": True}]
    return state


def test_dated_zero_purchase_sale_replays_once_and_return_preserves_history(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    initial = with_stock(base_state)
    status(put(client, owner, initial), 200)
    candidate = transform(initial, "state=recordSale(state,'a35-history',87000,1000,'Перевод','2026-10-02');")
    for field in ("inventory", "events"):
        forged = deepcopy(candidate["state"])
        if field == "inventory":
            forged["inventory"][0]["sale"]["itemSnapshot"]["buy"] = 80000
        else:
            forged["events"][-1]["itemSnapshot"]["buy"] = 80000
        status(put(client, staff, forged, revision=1), 422)
    future = deepcopy(candidate["state"])
    future["inventory"][0]["sale"]["at"] = "2099-01-01"
    future["inventory"][0]["sale"]["soldOn"] = "2099-01-01"
    future["events"][-1]["at"] = "2099-01-01"
    future["events"][-1]["soldOn"] = "2099-01-01"
    status(put(client, staff, future, revision=1), 422)
    response = put(client, staff, candidate["state"], revision=1, operation="business-sale-repeat")
    status(response, 200)
    first = response.json()
    assert first["state"]["inventory"][0]["sale"]["at"] == "2026-10-02"
    assert first["state"]["inventory"][0]["sale"]["itemSnapshot"]["buy"] == 0
    assert first["state"]["events"][-1]["itemSnapshot"]["model"] == "Samsung Galaxy A35 5G"
    assert put(client, staff, candidate["state"], revision=1, operation="business-sale-repeat").json() == first
    returned = transform(first["state"], "state=returnSale(state,'a35-history','Синтетический возврат','2026-10-03');extra.report=salesReport(state);")
    assert returned["extra"]["report"]["count"] == 1
    assert returned["extra"]["report"]["returnCount"] == 1
    assert returned["extra"]["report"]["netRevenue"] == 0
    assert returned["extra"]["report"]["profit"] == -1000
    for invalid_date in ("2099-01-01", "2026-10-01"):
        invalid_return = deepcopy(returned["state"])
        invalid_return["events"][-1]["at"] = invalid_date
        status(put(client, staff, invalid_return, revision=2), 422)
    status(put(client, staff, returned["state"], revision=2), 200)
    tampered = deepcopy(returned["state"])
    tampered["events"][0]["revenue"] = 90000
    status(put(client, staff, tampered, revision=3), 422)
    actual = client.get("/api/workspace", headers=owner).json()
    assert actual == {"state": returned["state"], "revision": 3}


def test_legacy_sold_requires_explicit_confirmation_not_plan_price(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    initial = with_stock(base_state, sold=True, buy=50000)
    status(put(client, owner, initial), 200)
    confirmed = transform(initial, "state=confirmLegacySale(state,'a35-history',85000,0,'Карта','2026-10-01','Синтетический чек');")
    unsafe = deepcopy(confirmed["state"])
    unsafe["inventory"][0]["sale"].pop("historicalConfirmation")
    unsafe["events"][-1].pop("historicalConfirmation")
    status(put(client, staff, unsafe, revision=1), 422)
    status(put(client, staff, confirmed["state"], revision=1), 200)
    actual = client.get("/api/workspace", headers=owner).json()
    sale = actual["state"]["inventory"][0]["sale"]
    assert sale["revenue"] == 85000
    assert sale["revenue"] != actual["state"]["inventory"][0]["sell"]
    assert sale["soldOn"] == "2026-10-01"
    assert sale["confirmationReason"] == "Синтетический чек"
    assert len([event for event in actual["state"]["events"] if event["type"] == "sale"]) == 1


def test_staff_cash_expense_is_append_only_and_void_retains_original_amount(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    status(put(client, owner, base_state), 200)
    spent = transform(base_state, "state=addCashTransaction(state,{kind:'expense',accountId:'cash',categoryId:'expense-water',amount:-5000,happenedOn:'2026-10-02',reason:'Синтетическая вода'},'business-water');extra.balance=getAccountBalance(state,'cash');")
    assert spent["extra"]["balance"] == -5000
    forged_category = deepcopy(spent["state"])
    forged_category["cashTransactions"][0]["categoryName"] = "Подмена категории"
    forged_category["cashEvents"][-1]["after"]["categoryName"] = "Подмена категории"
    status(put(client, staff, forged_category, revision=1), 422)
    response = put(client, staff, spent["state"], revision=1)
    status(response, 200)
    tampered = deepcopy(spent["state"])
    tampered["cashTransactions"][0]["amount"] = 1000
    tampered["cashTransactions"][0]["signedAmount"] = -1000
    status(put(client, staff, tampered, revision=2), 422)
    corrected = transform(spent["state"], "state=voidCashTransaction(state,state.cashTransactions[0].id,'Синтетическое исправление');extra.balance=getAccountBalance(state,'cash');")
    assert corrected["extra"]["balance"] == 0
    assert corrected["state"]["cashTransactions"][0]["amount"] == 5000
    assert corrected["state"]["cashTransactions"][0]["voided"] is True
    status(put(client, staff, corrected["state"], revision=2), 200)
    erased = deepcopy(corrected["state"])
    erased["cashEvents"].pop(0)
    status(put(client, staff, erased, revision=3), 422)


def test_staff_cannot_rewrite_cash_registry_or_started_at(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    initial = transform(base_state, "state=saveEmployee(state,{name:'Синтетический сотрудник',jobTitle:'Мастер',phone:''});")["state"]
    status(put(client, owner, initial), 200)
    for field, operation in [
        ("employees", lambda state: state["employees"][0].update(name="Другой сотрудник")),
        ("cashStartedAt", lambda state: state.update(cashStartedAt="2026-09-01T00:00:00.000Z")),
        ("cashAccounts", lambda state: state["cashAccounts"][0].update(name="Другая касса")),
    ]:
        changed = deepcopy(initial)
        operation(changed)
        response = put(client, staff, changed, revision=1)
        assert response.status_code == 403, f"{field}: HTTP {response.status_code}"
    salary = transform(initial, "state=addCashTransaction(state,{kind:'expense',accountId:'bank',categoryId:'expense-salary',employeeId:state.employees[0].id,amount:10000,happenedOn:'2026-10-02',reason:'Синтетическая зарплата'},'business-salary');")["state"]
    salary["cashTransactions"][0]["employeeName"] = "Подменённый сотрудник"
    salary["cashEvents"][-1]["after"]["employeeName"] = "Подменённый сотрудник"
    status(put(client, staff, salary, revision=1), 422)
    assert client.get("/api/workspace", headers=owner).json() == {"state": initial, "revision": 1}


def test_repair_contacts_persist_privately_and_prior_event_cannot_be_rewritten(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    status(put(client, owner, base_state), 200)
    created = transform(base_state, "state=createRepair(state,{device:'Redmi A5',repairTypeId:'diagnostic',receivedOn:'2026-10-01',masterName:'Синтетический мастер',clientName:'Синтетический клиент',clientPhone:'+77000000000',clientNote:'Синтетическая проверка'},'business-repair');")["state"]
    status(put(client, staff, created, revision=1), 200)
    assert client.get("/api/workspace").status_code == 401
    current = client.get("/api/workspace", headers=owner).json()["state"]
    assert current["repairOrders"][0]["clientPhone"] == "+77000000000"
    assert current["repairOrders"][0]["masterName"] == "Синтетический мастер"
    updated = transform(current, "state=updateRepair(state,state.repairOrders[0].id,{clientPhone:'+77000000001'},'Синтетическое исправление телефона');")["state"]
    status(put(client, staff, updated, revision=2), 200)
    assert updated["repairEvents"][0]["after"]["clientPhone"] == "+77000000000"
    assert updated["repairOrders"][0]["clientPhone"] == "+77000000001"
    malformed = deepcopy(updated)
    malformed["repairOrders"][0]["clientPhone"] = "javascript:alert(1)"
    status(put(client, staff, malformed, revision=3), 422)
    rewritten = deepcopy(updated)
    rewritten["repairEvents"][0]["after"]["clientName"] = "Подменённая история"
    status(put(client, staff, rewritten, revision=3), 422)


def test_workbook_fallback_snapshot_is_recomputed_server_side_without_safe_maximum(api, base_state):
    client, _ = api
    owner, staff = login(client), login(client, "worker")
    status(put(client, owner, base_state), 200)
    result = transform(base_state, """
const input={...initialInput,model:'Samsung Galaxy A35 5G',storage:128,ram:8,sim:'physical',ask:'',locks:'checked',repairHistory:'none',checks:{sensor:'ok',cameras:'ok',network:'ok',charging:'ok'}};
const model=state.catalog.find(row=>row.name===input.model);
const price=findWorkbookPrice(input,model);
if(!price) throw new Error('Expected A35 reference row');
const snapshot={...evaluate(input,price,state.policy,undefined,model),purchaseToken:'business-workbook-purchase'};
extra.snapshot=snapshot;
state=purchase(state,snapshot,0,'Синтетическая ручная диагностика чернового Excel');
state={...state,assessments:[...state.assessments,{id:'business-workbook-assessment',...structuredClone(snapshot)}]};
""")
    snapshot = result["extra"]["snapshot"]
    assert snapshot["price"]["source"] == "workbook-reference"
    assert snapshot["maxBuy"] is None
    assert snapshot["status"] == "diagnosis"
    estimate = client.post("/api/evaluate", headers=staff, json={"input": snapshot["input"], "priceId": snapshot["price"]["id"]})
    status(estimate, 200)
    assert estimate.json()["result"]["base"] == snapshot["base"]
    assert estimate.json()["result"]["maxBuy"] is None
    status(put(client, staff, result["state"], revision=1), 200)
    saved = client.get("/api/workspace", headers=owner).json()["state"]
    assert saved["inventory"][0]["buy"] == 0
    assert saved["inventory"][0]["snapshot"]["price"]["id"] == snapshot["price"]["id"]
