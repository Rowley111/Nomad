import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, validateState } from "../src/domain/storage.js";
import { createRepair, updateRepair, addRepairPayment, repairOrderTotals, validateRepairState } from "../src/domain/repairs.js";

const form = {
  device: "Redmi A5", repairTypeId: "display", description: "Замена экрана",
  receivedOn: "2026-11-04", plannedRevenue: 18000,
};
const details = { masterName: "Мастер Тест", clientName: "Клиент Тест", clientPhone: "+7 (700) 000-00-00", clientNote: "Связаться после диагностики\nСогласовать материал" };
const created = (extras = {}) => createRepair(emptyState(), { ...form, ...extras }, "contact-order");
test("repair contacts are optional and legacy repairs are not rewritten", () => {
  const state = created();
  const order = state.repairOrders[0];
  for (const key of Object.keys(details)) assert.equal(Object.hasOwn(order, key), false);
  assert.equal(validateRepairState(state), state);
  const next = updateRepair(state, order.id, { description: "Диагностика" });
  assert.equal(Object.hasOwn(next.repairOrders[0], "clientPhone"), false);
});
test("repair create/edit preserves international phone strings and audited originals", () => {
  const state = created(details), id = state.repairOrders[0].id;
  assert.equal(state.repairOrders[0].clientPhone, details.clientPhone);
  assert.equal(state.repairEvents[0].after.clientName, details.clientName);
  const next = updateRepair(state, id, { masterName: "Другой мастер", clientPhone: "007 000 0000" });
  assert.equal(next.repairOrders[0].clientPhone, "007 000 0000");
  assert.equal(next.repairOrders[0].clientName, details.clientName);
  assert.equal(next.repairEvents.at(-1).before.clientPhone, details.clientPhone);
  assert.equal(next.repairEvents.at(-1).after.masterName, "Другой мастер");
  assert.equal(state.repairOrders[0].masterName, details.masterName);
});
test("invalid contact values fail atomically without changing orders", () => {
  const state = created(details), raw = JSON.stringify(state), id = state.repairOrders[0].id;
  for (const bad of [
    { clientPhone: 77000000000 }, { clientPhone: "+7 abc" }, { clientPhone: "123" },
    { clientPhone: "+" + "1".repeat(21) }, { clientPhone: "12+3456789" },
    { masterName: "A".repeat(121) }, { clientName: "X\u0000Y" },
    { clientNote: "A".repeat(2001) }, { clientPhone: null },
  ]) {
    assert.throws(() => updateRepair(state, id, bad));
    assert.equal(JSON.stringify(state), raw);
  }
});
test("full backup validates contacts and rejects malformed imported client data", () => {
  const state = created(details), restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.repairOrders[0], state.repairOrders[0]);
  const bad = structuredClone(restored);
  bad.repairOrders[0].clientPhone = 7000000000;
  assert.throws(() => validateState(bad), /телефон клиента/);
});
test("contact edits do not change repair cash accounting or invent payments", () => {
  let state = created(details), id = state.repairOrders[0].id;
  state = addRepairPayment(state, id, { amount: 10000, paidOn: "2026-11-04", method: "cash", kind: "payment", reason: "" }, "contact-payment");
  const before = repairOrderTotals(state.repairOrders[0]);
  const next = updateRepair(state, id, { masterName: "Новый мастер", clientNote: "Новая заметка" });
  assert.deepEqual(repairOrderTotals(next.repairOrders[0]), before);
  assert.equal(before.received, 10000);
});
test("explicit clearing retains history, and repeated create cannot duplicate a contact order", () => {
  const state = created(details), order = state.repairOrders[0];
  const same = createRepair(state, { ...form, clientName: "Другой" }, "contact-order");
  assert.equal(same, state);
  const cleared = updateRepair(state, order.id, { clientName: "", clientPhone: "", clientNote: "", masterName: "" });
  assert.equal(cleared.repairOrders[0].clientPhone, "");
  assert.equal(cleared.repairEvents.at(-1).before.clientPhone, details.clientPhone);
});
