import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { emptyState, purchase, recordSale, returnSale } from "../src/domain/storage.js";
import { initialInput } from "../src/domain/catalog.js";
import { evaluate } from "../src/domain/valuation.js";
import { addRepairLoss, voidRepairLoss } from "../src/domain/repairs.js";
import { validateWorkspace, validateTransition, calculateWorkspace } from "../server/domain-validation.mjs";

const now = "2026-11-04T10:00:00.000Z";
const input = { ...initialInput, ask: 50000, locks: "checked", repairHistory: "none",
  checks: { sensor: "ok", cameras: "ok", network: "ok", charging: "ok" } };
function fixture() {
  const state = emptyState();
  state.prices.push({ id: "owner-a35", model: input.model, storage: 128, ram: 8,
    sim: "physical", market: "Астана", currency: "KZT", channel: "store-cash",
    price: 89000, source: "owner", checkedAt: "2026-11-04", author: "Владелец",
    base: { screen: "good", body: "good", box: true, battery: null } });
  return state;
}
const snapshot = (state) => ({ ...evaluate(input, state.prices[0], state.policy, now), purchaseToken: "one-purchase" });

test("server uses exact shared A35 rules, including zero purchase", () => {
  const state = fixture();
  const result = calculateWorkspace(state, input, "owner-a35", now);
  assert.equal(result.installment, 111250);
  assert.equal(result.expectedProfit, 39000);
  const bought = purchase(state, snapshot(state), 0);
  assert.equal(validateTransition(state, bought, now).inventory[0].buy, 0);
});
test("server rejects changed result, forged basis and stale snapshot", () => {
  const state = fixture();
  const bought = purchase(state, snapshot(state), 50000);
  for (const change of [
    (s) => { s.inventory[0].snapshot.maxBuy += 100000; },
    (s) => { s.inventory[0].snapshot.price.price = 999999; },
    (s) => { s.inventory[0].snapshot.at = "2025-01-01T00:00:00Z"; },
    (s) => { s.inventory[0].ram = 16; },
  ]) {
    const tampered = structuredClone(bought);
    change(tampered);
    assert.throws(() => validateTransition(state, tampered, now));
  }
});
test("legacy marker cannot bypass a new confirmed purchase", () => {
  const state = fixture();
  const fake = structuredClone(state);
  fake.inventory.push({ id: "fake", model: input.model, buy: 0, sell: 89000, legacy: true });
  assert.throws(() => validateTransition(state, fake, now), /снимок/);
  assert.equal(validateWorkspace(fake).inventory.length, 1); // Admin migration preserves history.
  fake.events.push({ type: "legacy-note", note: "Старая запись без ID и даты" });
  assert.deepEqual(validateTransition(fake, structuredClone(fake), now).events, fake.events);
});
test("import validation rejects duplicated purchase tokens before the workspace can freeze", () => {
  const state = fixture();
  state.inventory.push(
    { id: "one", model: input.model, buy: 0, sell: 89000, purchaseToken: "same-token" },
    { id: "two", model: input.model, buy: 0, sell: 89000, purchaseToken: "same-token" },
  );
  assert.throws(() => validateWorkspace(state), /идентификатор закупки/);
});
test("saved assessments and purchase history remain immutable after price changes", () => {
  const state = fixture();
  const bought = purchase(state, snapshot(state), 50000);
  const changedPrice = structuredClone(bought);
  changedPrice.prices[0].price = 95000;
  assert.equal(validateTransition(bought, changedPrice, now).inventory[0].snapshot.base, 89000);
  changedPrice.inventory[0].buy = 0;
  assert.throws(() => validateTransition(bought, changedPrice, now), /переписать/);
  const changedModel = structuredClone(bought);
  changedModel.inventory[0].model = "iPhone 13";
  assert.throws(() => validateTransition(bought, changedModel, now), /переписать/);
});
test("sale and return keep actual amounts and an append-only journal", () => {
  const state = fixture();
  const bought = purchase(state, snapshot(state), 50000);
  const sold = recordSale(bought, bought.inventory[0].id, 87000, 2000, "Наличные");
  assert.equal(validateTransition(bought, sold, now).inventory[0].sale.revenue, 87000);
  const fake = structuredClone(sold);
  fake.inventory[0].sale.revenue = 90000;
  assert.throws(() => validateTransition(sold, fake, now), /возврата/);
  const returned = returnSale(sold, sold.inventory[0].id, "Возврат клиенту");
  assert.equal(validateTransition(sold, returned, now).inventory[0].sale, null);
  returned.events.shift();
  assert.throws(() => validateTransition(sold, returned, now), /Историю/);
});
test("losses can be added and voided but never rewritten or removed", () => {
  const state = fixture();
  const lost = addRepairLoss(state, { amount: -5000, lostOn: "2026-11-04", reason: "Повреждение" }, "loss-1");
  assert.equal(validateTransition(state, lost, now).repairLosses[0].amount, -5000);
  const corrected = voidRepairLoss(lost, lost.repairLosses[0].id, "Ошибочная запись");
  assert.equal(validateTransition(lost, corrected, now).repairLosses[0].voided, true);
  const edited = structuredClone(lost);
  edited.repairLosses[0].amount = -100;
  assert.throws(() => validateTransition(lost, edited, now), /сторнированием/);
});
test("worker process validates serialized state and rejects invalid action", () => {
  const call = (request) => spawnSync(process.execPath, ["server/domain-worker.mjs"], {
    input: JSON.stringify(request), encoding: "utf8" });
  const state = fixture();
  state.events.push({ id: "bulk-legacy-note", note: "Астана · ремонт 📱".repeat(16000) });
  const valid = call({ action: "validate", state });
  assert.equal(valid.status, 0);
  assert.equal(JSON.parse(valid.stdout).ok, true);
  assert.deepEqual(JSON.parse(valid.stdout).state.events, state.events);
  const invalid = call({ action: "arbitrary-command", state: fixture() });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).ok, false);
});
