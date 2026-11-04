"""Protected catalogue and owner-price flows through the real shared worker."""

from copy import deepcopy
import json
import subprocess

from fastapi.testclient import TestClient

from server.tests.test_api import ROOT, api, base_state, login, put


def node_state(state, *, with_tablet=True, iphone=False):
    """Use production constructors; stdout is data, never executable input."""
    script = """
import {readFileSync} from 'node:fs';
import {saveCatalogModel} from './src/domain/catalog-management.js';
import {buildOwnerPrice} from './src/domain/price-builder.js';
import {mergePrices} from './src/domain/imports.js';
const request=JSON.parse(readFileSync(0,'utf8'));
let state=request.state;
if(request.withTablet) state=saveCatalogModel(state,null,{
  name:'Nomad API Test Tab Wi-Fi',brand:'Lenovo',deviceType:'tablet',
  connectivity:'wifi',biometric:'none',source:'Подтверждено владельцем в API-тесте',
  configs:[{storage:128,ram:6}]
});
const row=buildOwnerPrice({
  model:request.iphone?'iPhone 13':'Nomad API Test Tab Wi-Fi',storage:128,
  ram:request.iphone?null:6,sim:request.iphone?'physical':'wifi',
  buyMin:40000,saleMin:75000,author:'Проверка API'
},state);
state=mergePrices(state,[row]);
console.log(JSON.stringify(state));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps({"state": state, "withTablet": with_tablet, "iphone": iphone}),
        cwd=ROOT, text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


def checked_input(model, *, iphone=False):
    checks = {"sensor": "ok", "cameras": "ok", "network": "ok", "charging": "ok"}
    if iphone:
        checks["faceid"] = "ok"
    return {
        "model": model, "storage": 128, "ram": None if iphone else 6,
        "sim": "physical" if iphone else "wifi", "screen": "good", "body": "good",
        "box": True, "battery": "", "repairHistory": "none", "locks": "checked",
        "checks": checks, "defects": [], "scenario": "asis", "repair": 0,
        "expenses": 0, "ask": 40000,
    }


def test_admin_tablet_catalogue_and_own_price_are_shared_and_server_evaluated(api, base_state):
    client, app = api
    owner = login(client)
    assert put(client, owner, base_state).status_code == 200
    changed = node_state(base_state)
    saved = put(client, owner, changed, revision=1)
    assert saved.status_code == 200, saved.text
    tablet = next(row for row in saved.json()["state"]["catalog"] if row["name"] == "Nomad API Test Tab Wi-Fi")
    assert tablet["connectivity"] == "wifi"
    assert tablet["configs"] == [{"storage": 128, "ram": 6}]
    price = saved.json()["state"]["prices"][0]
    assert price["source"] == "owner-buy" and price["sim"] == "wifi"
    with TestClient(app) as second:
        staff = login(second, "worker")
        assert second.get("/api/workspace", headers=staff).json() == saved.json()
        estimate = second.post("/api/evaluate", headers=staff, json={
            "input": checked_input(tablet["name"]), "priceId": price["id"],
        })
        assert estimate.status_code == 200, estimate.text
        result = estimate.json()["result"]
        assert result["status"] == "ready"
        assert result["base"] == 75000
        assert result["installment"] == 93750
        assert result["expectedProfit"] == 35000
        assert result["input"]["sim"] == "wifi"


def test_server_own_iphone_price_does_not_apply_document_discount(api, base_state):
    client, _ = api
    owner = login(client)
    assert put(client, owner, base_state).status_code == 200
    changed = node_state(base_state, with_tablet=False, iphone=True)
    saved = put(client, owner, changed, revision=1)
    assert saved.status_code == 200, saved.text
    price = saved.json()["state"]["prices"][0]
    response = client.post("/api/evaluate", headers=owner, json={
        "input": checked_input("iPhone 13", iphone=True), "priceId": price["id"],
    })
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["reduction"] == 0
    assert result["preliminaryMin"] == 40000
    assert result["showcase"] == 75000
    assert result["expectedProfit"] == 35000


def test_staff_cannot_publish_catalogue_or_own_prices(api, base_state):
    client, _ = api
    owner = login(client)
    assert put(client, owner, base_state).status_code == 200
    staff = login(client, "worker")
    attempted = node_state(base_state)
    response = put(client, staff, attempted, revision=1)
    assert response.status_code == 403, response.text
    attempted_version = deepcopy(base_state)
    attempted_version["catalogRevision"] = 99
    assert put(client, staff, attempted_version, revision=1).status_code == 403
    actual = client.get("/api/workspace", headers=owner).json()
    assert actual == {"state": base_state, "revision": 1}
    assert not any(row["name"] == "Nomad API Test Tab Wi-Fi" for row in actual["state"]["catalog"])


def test_rejected_connectivity_or_memory_edit_leaves_shared_catalogue_intact(api, base_state):
    client, _ = api
    owner = login(client)
    current = node_state(base_state)
    saved = put(client, owner, current)
    assert saved.status_code == 200, saved.text
    for change in ("connectivity", "memory"):
        attempted = deepcopy(current)
        tablet = next(row for row in attempted["catalog"] if row["name"] == "Nomad API Test Tab Wi-Fi")
        if change == "connectivity":
            tablet["connectivity"] = "cellular"
            tablet["simModes"] = ["physical"]
        else:
            tablet["configs"] = [{"storage": 256, "ram": 8}]
        response = put(client, owner, attempted, revision=1)
        assert response.status_code == 422, response.text
        assert client.get("/api/workspace", headers=owner).json() == saved.json()
