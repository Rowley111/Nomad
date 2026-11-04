import test from "node:test";
import assert from "node:assert/strict";
import {
  repairDefaults,
  ensureRepairState,
  validateRepairState,
  businessToday,
  createRepair,
  updateRepair,
  setRepairStatus,
  addRepairMaterial,
  addRepairCost,
  addRepairPayment,
  voidRepairExpense,
  saveRepairType,
  saveRepairMaterialTemplate,
  repairOrderTotals,
  repairReport,
  addRepairLoss,
  voidRepairLoss,
} from "../src/domain/repairs.js";

const initial = () =>
  createRepair(
    { inventory: [{ id: "old", buy: 0 }], ...repairDefaults() },
    {
      device: "iPhone 13 128 ГБ",
      repairTypeId: "display",
      description: "Не работает экран",
      receivedOn: "2026-10-28",
      plannedRevenue: 30000,
    },
    "repair-1",
  );
const idOf = (s) => s.repairOrders[0].id;
const pay = (s, amount, paidOn = "2026-11-03", kind = "payment", opId) =>
  addRepairPayment(
    s,
    idOf(s),
    {
      amount,
      paidOn,
      method: "cash",
      kind,
      reason: kind === "refund" ? "Возврат клиенту" : "",
    },
    opId,
  );

test("repair: additive migration keeps stock; fresh defaults; malformed partial schema rejected", () => {
  const legacy = {
    inventory: [{ id: "old", buy: 0 }],
    prices: [{ source: "owner" }],
  };
  const original = structuredClone(legacy);
  assert.equal(validateRepairState(legacy), legacy);
  const current = ensureRepairState(legacy);
  assert.deepEqual(legacy, original);
  assert.equal(current.inventory, legacy.inventory);
  assert.equal(current.repairOrders.length, 0);
  assert.equal(current.repairTypes.length, 6);
  assert.equal(ensureRepairState(current), current);
  current.repairTypes[0].name = "Другой вид";
  assert.equal(repairDefaults().repairTypes[0].name, "Диагностика");
  assert.throws(
    () => validateRepairState({ ...legacy, repairOrders: [] }),
    /схема/,
  );
  assert.throws(
    () => validateRepairState({ ...repairDefaults(), repairSchemaVersion: 2 }),
    /схема/,
  );
  assert.throws(() =>
    validateRepairState({ ...repairDefaults(), repairOrders: [{}] }),
  );
  assert.throws(() =>
    validateRepairState({
      ...repairDefaults(),
      repairEvents: [{ id: "fake" }],
    }),
  );
});

test("repair: quote is no payment; creation snapshots type and preserves unrelated records", () => {
  const s = initial();
  assert.deepEqual(s.inventory, [{ id: "old", buy: 0 }]);
  assert.equal(s.repairOrders[0].status, "accepted");
  assert.equal(s.repairOrders[0].repairTypeName, "Замена дисплея");
  assert.equal(s.repairEvents[0].type, "repair-created");
  assert.equal(s.repairEvents[0].before, null);
  assert.equal(repairOrderTotals(s.repairOrders[0]).received, 0);
  assert.equal(repairOrderTotals(s.repairOrders[0]).balance, 30000);
  assert.equal(repairReport(s).received, 0);
  assert.equal(validateRepairState(s), s);
  const unknown = createRepair(repairDefaults(), {
    device: "Samsung",
    repairTypeId: "diagnostic",
    receivedOn: "2026-11-03",
    plannedRevenue: "",
  });
  assert.equal(repairOrderTotals(unknown.repairOrders[0]).balance, null);
});

test("repair: material quantity × unit cost, rounded sum and catalog snapshots", () => {
  let s = saveRepairMaterialTemplate(initial(), {
    name: "Клей",
    unit: "мл",
    unitCost: 12.35,
  });
  const materialId = s.materialCatalog[0].id;
  const before = structuredClone(s);
  s = addRepairMaterial(
    s,
    idOf(s),
    { materialId, quantity: 2.5, spentOn: "2026-11-01" },
    "glue",
  );
  assert.equal(s.repairOrders[0].materials[0].total, 30.88);
  assert.equal(s.repairOrders[0].materials[0].name, "Клей");
  assert.deepEqual(before.repairOrders[0].materials, []);
  s = saveRepairMaterialTemplate(s, {
    id: materialId,
    name: "Новый клей",
    unit: "г",
    unitCost: 100,
    archived: true,
  });
  const line = s.repairOrders[0].materials[0];
  assert.equal(line.name, "Клей");
  assert.equal(line.unit, "мл");
  assert.equal(line.unitCost, 12.35);
  assert.throws(() =>
    addRepairMaterial(s, idOf(s), {
      materialId,
      quantity: 1,
      spentOn: "2026-11-01",
    }),
  );
  s = addRepairMaterial(s, idOf(s), {
    name: "Флюс",
    unit: "г",
    quantity: 0.001,
    unitCost: 1000,
    spentOn: "2026-11-01",
  });
  assert.equal(s.repairOrders[0].materials[1].total, 1);
  assert.equal(repairOrderTotals(s.repairOrders[0]).materials, 31.88);
  validateRepairState(s);
});

test("repair: advances, partial payments, refund, expense and actual profit", () => {
  let s = pay(initial(), 10000, "2026-10-29", "payment", "advance");
  s = pay(s, 20000, "2026-11-02", "payment", "final");
  s = addRepairCost(
    s,
    idOf(s),
    { name: "Доставка", amount: 1500, spentOn: "2026-11-01" },
    "delivery",
  );
  s = addRepairMaterial(
    s,
    idOf(s),
    {
      name: "Экран",
      quantity: 1,
      unit: "шт",
      unitCost: 9000,
      spentOn: "2026-10-30",
    },
    "screen",
  );
  s = pay(s, 3000, "2026-11-03", "refund", "refund");
  assert.deepEqual(repairOrderTotals(s.repairOrders[0]), {
    received: 27000,
    grossReceived: 30000,
    refunded: 3000,
    materials: 9000,
    costs: 1500,
    losses: 0,
    expenses: 10500,
    profit: 16500,
    plannedRevenue: 30000,
    balance: 3000,
  });
  const report = repairReport(s, {
    from: "2026-11-01",
    to: "2026-11-30",
    groupBy: "month",
  });
  assert.equal(report.received, 17000);
  assert.equal(report.expenses, 1500);
  assert.equal(report.profit, 15500);
  assert.equal(report.orderCount, 0); // Order was accepted in October.
  assert.equal(report.transactionOrderCount, 1);
  assert.equal(report.totalOrderCount, 1);
  assert.throws(() => pay(s, 27001, "2026-11-03", "refund"), /превышает/);
  assert.throws(
    () =>
      addRepairPayment(s, idOf(s), {
        amount: 1,
        paidOn: "2026-11-03",
        method: "cash",
        kind: "refund",
        reason: "",
      }),
    /причина/,
  );
  validateRepairState(s);
});

test("repair: explicit zero accepted, negative/NaN/Infinity and invalid dates rejected atomically", () => {
  let s = initial();
  s = pay(s, 0);
  s = addRepairCost(s, idOf(s), {
    name: "Гарантия",
    amount: 0,
    spentOn: "2026-11-03",
  });
  s = addRepairMaterial(s, idOf(s), {
    name: "Материал владельца",
    quantity: 1,
    unit: "шт",
    unitCost: 0,
    spentOn: "2026-11-03",
  });
  assert.equal(repairOrderTotals(s.repairOrders[0]).received, 0);
  assert.equal(repairOrderTotals(s.repairOrders[0]).expenses, 0);
  const old = JSON.stringify(s);
  for (const value of [-1, NaN, Infinity, "", " ", null, true]) {
    assert.throws(() => pay(s, value));
    assert.throws(() =>
      addRepairCost(s, idOf(s), {
        name: "Ошибка",
        amount: value,
        spentOn: "2026-11-03",
      }),
    );
    assert.throws(() =>
      addRepairMaterial(s, idOf(s), {
        name: "Ошибка",
        quantity: 1,
        unit: "шт",
        unitCost: value,
        spentOn: "2026-11-03",
      }),
    );
  }
  for (const value of [0, -1, NaN, Infinity, "", true])
    assert.throws(() =>
      addRepairMaterial(s, idOf(s), {
        name: "Ошибка",
        quantity: value,
        unit: "шт",
        unitCost: 0,
        spentOn: "2026-11-03",
      }),
    );
  for (const paidOn of [
    "2026-02-29",
    "2026-11-31",
    "03.11.2026",
    "2026-1-01",
    "bad",
  ])
    assert.throws(() => pay(s, 100, paidOn));
  assert.equal(JSON.stringify(s), old);
});

test("repair: duplicate operation IDs cannot double an order, a payment, a cost or material", () => {
  let s = initial();
  assert.equal(createRepair(s, { device: "ignored" }, "repair-1"), s);
  s = pay(s, 1000, "2026-11-03", "payment", "payment-id");
  assert.equal(pay(s, 1000, "2026-11-03", "payment", "payment-id"), s);
  assert.throws(
    () =>
      addRepairCost(
        s,
        idOf(s),
        { name: "Ошибка", amount: 1, spentOn: "2026-11-03" },
        "payment-id",
      ),
    /другой операцией/,
  );
  const material = {
    name: "Дисплей",
    quantity: 1,
    unit: "шт",
    unitCost: 500,
    spentOn: "2026-11-03",
  };
  s = addRepairMaterial(s, idOf(s), material, "material-id");
  assert.equal(addRepairMaterial(s, idOf(s), material, "material-id"), s);
  const cost = { name: "Доставка", amount: 100, spentOn: "2026-11-03" };
  s = addRepairCost(s, idOf(s), cost, "cost-id");
  assert.equal(addRepairCost(s, idOf(s), cost, "cost-id"), s);
  assert.equal(repairOrderTotals(s.repairOrders[0]).profit, 400);
  assert.equal(s.repairOrders.length, 1);
});

test("repair: expense correction keeps original row, before/after snapshots and reason", () => {
  let s = pay(initial(), 20000);
  s = addRepairCost(s, idOf(s), {
    name: "Ошибочный расход",
    amount: 5000,
    spentOn: "2026-11-03",
  });
  const expenseId = s.repairOrders[0].costs[0].id;
  assert.throws(() => voidRepairExpense(s, idOf(s), "cost", expenseId, ""));
  s = voidRepairExpense(
    s,
    idOf(s),
    "cost",
    expenseId,
    "Дважды записали доставку",
  );
  assert.equal(s.repairOrders[0].costs[0].amount, 5000);
  assert.equal(s.repairOrders[0].costs[0].voided, true);
  assert.equal(s.repairEvents.at(-1).before.costs[0].voided, undefined);
  assert.equal(
    s.repairEvents.at(-1).after.costs[0].voidReason,
    "Дважды записали доставку",
  );
  assert.equal(repairReport(s).profit, 20000);
  assert.equal(repairOrderTotals(s.repairOrders[0]).expenses, 0);
  assert.throws(() =>
    voidRepairExpense(s, idOf(s), "cost", expenseId, "Повтор"),
  );
  s = addRepairMaterial(s, idOf(s), {
    name: "Экран",
    quantity: 1,
    unit: "шт",
    unitCost: 5000,
    spentOn: "2026-11-03",
  });
  s = voidRepairExpense(
    s,
    idOf(s),
    "material",
    s.repairOrders[0].materials[0].id,
    "Не использован; запись по ошибке",
  );
  assert.equal(repairReport(s).expenses, 0);
  validateRepairState(s);
});

test("repair: cancellation retains advances and costs; issue is not automatic payment", () => {
  let s = pay(initial(), 5000);
  s = addRepairCost(s, idOf(s), {
    name: "Диагностика",
    amount: 1000,
    spentOn: "2026-11-03",
  });
  s = setRepairStatus(s, idOf(s), "cancelled", "Клиент отказался");
  assert.equal(repairReport(s).profit, 4000);
  assert.equal(repairOrderTotals(s.repairOrders[0]).received, 5000);
  assert.equal(s.repairEvents.at(-1).before.status, "accepted");
  s = setRepairStatus(s, idOf(s), "issued");
  assert.equal(s.repairOrders[0].issuedOn, businessToday());
  assert.equal(repairReport(s).completedCount, 1);
  assert.equal(repairReport(s).received, 5000);
  const events = s.repairEvents.length;
  assert.equal(setRepairStatus(s, idOf(s), "issued"), s);
  assert.equal(s.repairEvents.length, events);
});

test("repair: weekly Monday/ISO year, month boundaries, inclusive date range and empty gaps", () => {
  let s = pay(initial(), 1000, "2025-12-28"); // Sunday, ISO week 52.
  s = pay(s, 2000, "2025-12-29"); // Monday, ISO week 1 of 2026.
  s = pay(s, 3000, "2026-01-01");
  s = pay(s, 4000, "2026-01-05");
  const weeks = repairReport(s, {
    from: "2025-12-28",
    to: "2026-01-18",
    groupBy: "week",
  });
  assert.deepEqual(
    weeks.series.map((row) => row.key),
    ["2025-W52", "2026-W01", "2026-W02", "2026-W03"],
  );
  assert.deepEqual(
    weeks.series.map((row) => row.received),
    [1000, 5000, 4000, 0],
  );
  assert.equal(weeks.series[1].from, "2025-12-29");
  assert.equal(weeks.series[1].to, "2026-01-04");
  const months = repairReport(s, {
    from: "2025-12-29",
    to: "2026-03-31",
    groupBy: "month",
  });
  assert.deepEqual(
    months.series.map((row) => row.key),
    ["2025-12", "2026-01", "2026-02", "2026-03"],
  );
  assert.deepEqual(
    months.series.map((row) => row.received),
    [2000, 7000, 0, 0],
  );
  assert.equal(months.received, 9000);
  assert.throws(() =>
    repairReport(s, { from: "2026-11-30", to: "2026-11-01" }),
  );
  assert.throws(() => repairReport(s, { from: "2026-02-30" }));
  assert.throws(() => repairReport(s, { groupBy: "day" }));
  assert.equal(
    repairReport(repairDefaults(), { from: "2026-01-01", to: "2026-02-28" })
      .series.length,
    2,
  );
});

test("repair: reports use payment/expense dates, including negative cash months and archived/cancelled jobs", () => {
  let s = pay(initial(), 10000, "2026-10-31");
  s = pay(s, 5000, "2026-11-01", "refund");
  s = addRepairCost(s, idOf(s), {
    name: "Доставка",
    amount: 1000,
    spentOn: "2026-12-01",
  });
  s = setRepairStatus(s, idOf(s), "cancelled");
  const report = repairReport(s, { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(
    report.series.map((row) => row.profit),
    [10000, -5000, -1000],
  );
  assert.equal(report.profit, 4000);
});

test("repair: Asia/Almaty date crosses UTC midnight at +05:00, independent of machine timezone", () => {
  assert.equal(businessToday("2026-11-03T18:59:59Z"), "2026-11-03");
  assert.equal(businessToday("2026-11-03T19:00:00Z"), "2026-11-04");
  assert.equal(businessToday("2026-12-31T23:59:59Z"), "2027-01-01");
  assert.throws(() => businessToday("bad"));
});

test("repair: renaming/archiving types keeps historic labels, material prices and journal snapshots", () => {
  let s = initial();
  const creation = structuredClone(s.repairEvents[0]);
  s = saveRepairType(s, {
    id: "display",
    name: "Экран и сенсор",
    archived: true,
  });
  assert.equal(s.repairOrders[0].repairTypeName, "Замена дисплея");
  assert.deepEqual(s.repairEvents[0], creation);
  assert.throws(() =>
    createRepair(s, {
      device: "Телефон",
      repairTypeId: "display",
      receivedOn: "2026-11-03",
    }),
  );
  s = saveRepairType(s, { name: "Пайка платы" });
  assert.throws(() => saveRepairType(s, { name: " пайка ПЛАТЫ " }), /уже есть/);
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(validateRepairState(restored), s);
  assert.deepEqual(repairReport(restored), repairReport(s));
  assert.equal(restored.repairEvents.at(-1).before, null);
});

test("repair: corruption is rejected rather than silently repaired or reset", () => {
  let s = initial();
  s = addRepairMaterial(s, idOf(s), {
    name: "Экран",
    quantity: 1,
    unit: "шт",
    unitCost: 9000,
    spentOn: "2026-11-03",
  });
  s = pay(s, 10000, "2026-11-03", "payment", "paid");
  const corruptions = [
    (x) => {
      x.repairOrders[0].materials[0].total = 1000;
    },
    (x) => {
      x.repairOrders[0].materials[0].quantity = 0;
    },
    (x) => {
      x.repairOrders[0].payments[0].amount = NaN;
    },
    (x) => {
      x.repairOrders[0].receivedOn = "2026-02-30";
    },
    (x) => {
      x.repairOrders[0].status = "issued";
    },
    (x) => {
      x.repairOrders[0].repairTypeId = "unknown";
    },
    (x) => {
      x.repairOrders.push(structuredClone(x.repairOrders[0]));
    },
    (x) => {
      x.repairEvents.push({ ...x.repairEvents.at(-1), id: "different-event" });
    },
    (x) => {
      x.repairOrders[0].payments[0].kind = "refund";
      x.repairOrders[0].payments[0].reason = "Возврат";
    },
    (x) => {
      x.repairTypes[0].archived = "false";
    },
    (x) => {
      delete x.repairSchemaVersion;
    },
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(s);
    corrupt(copy);
    assert.throws(() => validateRepairState(copy));
  }
  validateRepairState(s);
});

test("repair: order edits journal the quote and heading without rewriting cash or snapshots", () => {
  let s = pay(initial(), 5000);
  const old = structuredClone(s);
  s = updateRepair(
    s,
    idOf(s),
    {
      device: "iPhone 13 256 ГБ",
      repairTypeId: "battery",
      description: "Уточнено после диагностики",
      receivedOn: "2026-10-29",
      plannedRevenue: 15000,
    },
    "Уточнение заявки",
  );
  assert.equal(s.repairOrders[0].repairTypeName, "Замена аккумулятора");
  assert.equal(s.repairOrders[0].device, "iPhone 13 256 ГБ");
  assert.equal(s.repairOrders[0].plannedRevenue, 15000);
  assert.equal(s.repairEvents.at(-1).before.plannedRevenue, 30000);
  assert.equal(s.repairEvents.at(-1).after.plannedRevenue, 15000);
  assert.deepEqual(s.repairOrders[0].payments, old.repairOrders[0].payments);
  assert.deepEqual(s.repairEvents[0], old.repairEvents[0]);
  assert.equal(repairReport(s).received, 5000);
  assert.equal(repairOrderTotals(s.repairOrders[0]).balance, 10000);
  s = updateRepair(s, idOf(s), { plannedRevenue: 0 });
  assert.equal(repairOrderTotals(s.repairOrders[0]).plannedRevenue, 0);
  assert.equal(repairReport(s).received, 5000);
  assert.throws(() => updateRepair(s, idOf(s), { plannedRevenue: -1 }));
  validateRepairState(s);
});

test("loss: signed and unsigned inputs become one negative dated loss without changing old records", () => {
  const old = initial();
  const serialized = JSON.stringify(old);
  for (const amount of [-5000, 5000, "-5000", "5000", "−5000"]) {
    const s = addRepairLoss(
      old,
      { amount, lostOn: "2026-11-04", reason: "Повреждена запчасть" },
      "loss-1",
    );
    assert.equal(s.repairLosses[0].amount, -5000);
    assert.equal(s.repairEvents.at(-1).type, "repair-loss");
    assert.equal(s.repairEvents.at(-1).before, null);
    assert.equal(s.repairEvents.at(-1).after.reason, "Повреждена запчасть");
    assert.equal(repairReport(s).losses, 5000);
    assert.equal(repairReport(s).profit, -5000);
    assert.equal(JSON.stringify(old), serialized);
    assert.equal(validateRepairState(s), s);
  }
  assert.equal(Object.hasOwn(repairDefaults(), "repairLosses"), false);
  assert.equal(ensureRepairState(old), old);
});

test("loss: invalid amounts/dates/reasons/orders rejected atomically; payment/cost rules stay nonnegative", () => {
  const s = initial();
  const before = JSON.stringify(s);
  const valid = { amount: -5000, lostOn: "2026-11-04", reason: "Убыток" };
  for (const amount of [
    0,
    -0,
    "0",
    NaN,
    Infinity,
    -Infinity,
    "",
    " ",
    null,
    true,
    {},
    "-NaN",
    "-Infinity",
    "1e3",
    "-0.001",
  ])
    assert.throws(() => addRepairLoss(s, { ...valid, amount }));
  for (const loss of [
    { ...valid, lostOn: "2026-02-30" },
    { ...valid, reason: " " },
    { ...valid, orderId: "unknown" },
  ])
    assert.throws(() => addRepairLoss(s, loss));
  assert.throws(() =>
    addRepairCost(s, idOf(s), {
      name: "Отрицательный расход",
      amount: -5000,
      spentOn: "2026-11-04",
    }),
  );
  assert.throws(() => pay(s, -5000));
  assert.equal(JSON.stringify(s), before);
});

test("loss: report counts standalone losses without orders, by actual month/week and inclusive dates", () => {
  let s = addRepairLoss(
    repairDefaults(),
    { amount: -5000, lostOn: "2026-10-31", reason: "Потеря" },
    "first-loss",
  );
  s = addRepairLoss(
    s,
    { amount: 2000, lostOn: "2026-11-02", reason: "Повреждение" },
    "second-loss",
  );
  const all = repairReport(s, {
    from: "2026-10-01",
    to: "2026-11-30",
    groupBy: "month",
  });
  assert.equal(all.losses, 7000);
  assert.equal(all.expenses, 7000);
  assert.equal(all.profit, -7000);
  assert.equal(all.received, 0);
  assert.equal(all.orderCount, 0);
  assert.equal(all.transactionOrderCount, 0);
  assert.deepEqual(
    all.series.map((row) => row.losses),
    [5000, 2000],
  );
  assert.deepEqual(
    all.series.map((row) => row.profit),
    [-5000, -2000],
  );
  const oneDay = repairReport(s, {
    from: "2026-11-02",
    to: "2026-11-02",
    groupBy: "week",
  });
  assert.equal(oneDay.losses, 2000);
  assert.equal(oneDay.series[0].from, "2026-11-02");
  assert.equal(oneDay.series[0].profit, -2000);
});

test("loss: linked loss reduces order and period once, global loss only period; quote/balance unchanged", () => {
  let s = pay(initial(), 18000, "2026-11-04");
  s = addRepairMaterial(s, idOf(s), {
    name: "Материал",
    quantity: 2,
    unit: "шт.",
    unitCost: 3000,
    spentOn: "2026-11-04",
  });
  s = addRepairCost(s, idOf(s), {
    name: "Доставка",
    amount: 1000,
    spentOn: "2026-11-04",
  });
  assert.equal(repairReport(s).profit, 11000);
  s = addRepairLoss(
    s,
    {
      amount: -5000,
      lostOn: "2026-11-04",
      reason: "Повреждение детали",
      orderId: idOf(s),
    },
    "linked-loss",
  );
  const linked = repairOrderTotals(s.repairOrders[0], s.repairLosses);
  assert.equal(linked.losses, 5000);
  assert.equal(linked.expenses, 12000);
  assert.equal(linked.profit, 6000);
  assert.equal(linked.received, 18000);
  assert.equal(linked.balance, 12000);
  assert.equal(repairReport(s).profit, 6000);
  assert.equal(repairReport(s).losses, 5000);
  s = addRepairLoss(
    s,
    { amount: -1000, lostOn: "2026-11-04", reason: "Общий убыток" },
    "global-loss",
  );
  assert.equal(
    repairOrderTotals(s.repairOrders[0], s.repairLosses).profit,
    6000,
  );
  assert.equal(repairReport(s).profit, 5000);
  assert.equal(repairReport(s).transactionOrderCount, 1);
});

test("loss: duplicate operation IDs cannot double loss or collide with another operation/order", () => {
  let s = initial();
  const loss = {
    amount: -5000,
    lostOn: "2026-11-04",
    reason: "Ошибка",
    orderId: idOf(s),
  };
  s = addRepairLoss(s, loss, "loss-op");
  assert.equal(addRepairLoss(s, loss, "loss-op"), s);
  assert.equal(s.repairLosses.length, 1);
  assert.equal(repairReport(s).losses, 5000);
  assert.throws(() =>
    addRepairCost(
      s,
      idOf(s),
      { name: "Доставка", amount: 5000, spentOn: "2026-11-04" },
      "loss-op",
    ),
  );
  assert.throws(() =>
    addRepairLoss(s, { ...loss, orderId: undefined }, "loss-op"),
  );
});

test("loss: correcting an entry keeps original amount/snapshots/reason and JSON remains valid", () => {
  let s = addRepairLoss(
    initial(),
    { amount: -5000, lostOn: "2026-11-04", reason: "Ошибочно записали" },
    "loss-op",
  );
  const loss = s.repairLosses[0],
    before = JSON.stringify(s);
  assert.throws(() => voidRepairLoss(s, loss.id, " "));
  assert.equal(JSON.stringify(s), before);
  s = voidRepairLoss(s, loss.id, "Убыток уже учтён в материалах");
  assert.equal(s.repairLosses[0].amount, -5000);
  assert.equal(s.repairLosses[0].voided, true);
  assert.equal(s.repairEvents.at(-1).type, "repair-loss-voided");
  assert.equal(s.repairEvents.at(-1).before.voided, undefined);
  assert.equal(
    s.repairEvents.at(-1).after.voidReason,
    "Убыток уже учтён в материалах",
  );
  assert.equal(repairReport(s).losses, 0);
  assert.equal(repairReport(s).profit, 0);
  assert.throws(() => voidRepairLoss(s, loss.id, "Повтор"));
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(validateRepairState(restored), s);
  assert.deepEqual(repairReport(restored), repairReport(s));
});

test("loss: malformed optional loss data is rejected; existing schema without losses remains unchanged", () => {
  const s = addRepairLoss(initial(), {
    amount: -5000,
    lostOn: "2026-11-04",
    reason: "Потеря",
  });
  assert.throws(() => validateRepairState({ repairLosses: [] }));
  assert.throws(() =>
    validateRepairState({ ...repairDefaults(), repairLosses: {} }),
  );
  for (const corrupt of [
    (x) => (x.repairLosses[0].amount = 5000),
    (x) => (x.repairLosses[0].amount = 0),
    (x) => (x.repairLosses[0].amount = NaN),
    (x) => (x.repairLosses[0].amount = -0.001),
    (x) => (x.repairLosses[0].lostOn = "2026-02-30"),
    (x) => (x.repairLosses[0].reason = ""),
    (x) => (x.repairLosses[0].orderId = "missing"),
    (x) => x.repairLosses.push({ ...x.repairLosses[0] }),
    (x) => {
      x.repairLosses[0].voided = true;
    },
  ]) {
    const copy = structuredClone(s);
    corrupt(copy);
    assert.throws(() => validateRepairState(copy));
  }
  const original = initial();
  assert.equal(Object.hasOwn(original, "repairLosses"), false);
  assert.equal(validateRepairState(original), original);
});
