import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  KEY,
  readState,
  validateState,
} from "../src/domain/storage.js";
import { previewBackup } from "../src/domain/imports.js";
import {
  ensureRepairState,
  createRepair,
  addRepairMaterial,
  addRepairCost,
  addRepairPayment,
} from "../src/domain/repairs.js";

const repairKeys = [
  "repairSchemaVersion",
  "repairOrders",
  "repairTypes",
  "materialCatalog",
  "repairEvents",
];

function legacyWorkspace() {
  const state = emptyState();
  for (const key of repairKeys) delete state[key];
  state.inventory = [
    {
      id: "old-stock",
      model: "Существующий телефон",
      storage: 128,
      buy: 50000,
      sell: 89000,
      status: "Продан",
      sale: { revenue: 87000, expenses: 1000, date: "2026-10-10" },
    },
  ];
  state.assessments = [
    { id: "old-assessment", input: { model: "Существующий телефон" } },
  ];
  state.events = [{ id: "old-event", type: "sale", revenue: 87000 }];
  state.priceHistory = [
    { id: "old-price-change", before: 88000, after: 89000 },
  ];
  state.setupImports = [{ id: "a".repeat(32), at: "2026-10-10T12:00:00Z" }];
  return state;
}

function memoryStorage(raw, failKey) {
  const data = new Map([[KEY, raw]]);
  const writes = [];
  return {
    data,
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (key === failKey) throw new Error("QuotaExceededError");
      writes.push(key);
      data.set(key, value);
    },
  };
}

test("модуль ремонтов дополняет старую v2 с точной резервной копией и без потери склада", () => {
  const old = legacyWorkspace();
  const raw = JSON.stringify(old, null, 2);
  const storage = memoryStorage(raw);
  const migrated = readState(storage);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.repairSchemaVersion, 1);
  assert.deepEqual(migrated.repairOrders, []);
  assert.deepEqual(migrated.materialCatalog, []);
  assert.deepEqual(migrated.repairEvents, []);
  assert.ok(migrated.repairTypes.length > 0);
  for (const key of Object.keys(old))
    assert.deepEqual(migrated[key], old[key], key);
  assert.equal(storage.data.get(KEY + "-before-repairs-v1"), raw);
  assert.equal(storage.data.get(KEY), JSON.stringify(migrated));
  assert.deepEqual(storage.writes, [KEY + "-before-repairs-v1", KEY]);
});

test("повторный вход не меняет резервную копию и не дублирует справочники ремонтов", () => {
  const raw = JSON.stringify(legacyWorkspace());
  const storage = memoryStorage(raw);
  const first = readState(storage);
  const writes = storage.writes.length;
  const second = readState(storage);
  assert.deepEqual(second, first);
  assert.equal(storage.writes.length, writes);
  assert.equal(storage.data.get(KEY + "-before-repairs-v1"), raw);
  assert.equal(
    new Set(second.repairTypes.map((type) => type.id)).size,
    second.repairTypes.length,
  );
});

test("ошибка записи миграции оставляет исходный склад и данные доступными", () => {
  const raw = JSON.stringify(legacyWorkspace());
  const storage = memoryStorage(raw, KEY);
  assert.throws(() => readState(storage), /QuotaExceededError/);
  assert.equal(storage.data.get(KEY), raw);
  assert.equal(storage.data.get(KEY + "-before-repairs-v1"), raw);
});

test("без успешной резервной копии миграция не заменяет основное хранилище", () => {
  const raw = JSON.stringify(legacyWorkspace());
  const storage = memoryStorage(raw, KEY + "-before-repairs-v1");
  assert.throws(() => readState(storage), /QuotaExceededError/);
  assert.equal(storage.data.get(KEY), raw);
  assert.deepEqual(storage.writes, []);
});

test("повреждённые или частичные данные ремонтов не заменяются пустыми", () => {
  const partial = { ...legacyWorkspace(), repairOrders: [] };
  assert.throws(() => validateState(partial));
  const invalid = { ...ensureRepairState(legacyWorkspace()), repairOrders: {} };
  const raw = JSON.stringify(invalid);
  const storage = memoryStorage(raw);
  assert.throws(() => readState(storage));
  assert.equal(storage.data.get(KEY), raw);
  assert.deepEqual(storage.writes, []);
});

test("старую резервную копию можно проверить без выдуманных исторических ремонтов", () => {
  const old = legacyWorkspace();
  const preview = previewBackup(JSON.stringify(old));
  assert.deepEqual(preview.inventory, old.inventory);
  assert.equal(preview.repairOrders?.length ?? 0, 0);
  const restored = ensureRepairState(preview);
  assert.deepEqual(restored.repairOrders, []);
  assert.deepEqual(restored.repairEvents, []);
  assert.deepEqual(restored.setupImports, old.setupImports);
});

test("полная JSON-копия восстанавливает оплаты, материалы и журнал ремонтов вместе со складом", () => {
  let state = createRepair(
    legacyWorkspace(),
    {
      device: "iPhone 13",
      repairTypeId: "display",
      description: "Замена дисплея",
      receivedOn: "2026-10-14",
      plannedRevenue: 50000,
    },
    "create-repair",
  );
  const id = state.repairOrders[0].id;
  state = addRepairMaterial(
    state,
    id,
    {
      name: "Дисплей",
      quantity: 2,
      unit: "шт.",
      unitCost: 3000,
      spentOn: "2026-10-15",
    },
    "material-line",
  );
  state = addRepairCost(
    state,
    id,
    {
      name: "Доставка",
      amount: 1000,
      spentOn: "2026-10-15",
    },
    "cost-line",
  );
  state = addRepairPayment(
    state,
    id,
    {
      amount: 18000,
      kind: "payment",
      method: "transfer",
      paidOn: "2026-10-16",
    },
    "actual-payment",
  );
  const serialized = JSON.stringify(state);
  const restored = previewBackup(serialized);
  assert.deepEqual(restored, state);
  assert.equal(restored.repairOrders[0].materials[0].total, 6000);
  assert.equal(restored.repairOrders[0].payments[0].amount, 18000);
  const storage = memoryStorage(serialized);
  assert.deepEqual(readState(storage), state);
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.data.get(KEY + "-before-repairs-v1"), undefined);
});

test("убытки сохраняются в полной копии, отрицательная запись не меняет прежний склад", async () => {
  const { addRepairLoss } = await import("../src/domain/repairs.js");
  const before = ensureRepairState(legacyWorkspace());
  const snapshot = JSON.stringify(before.inventory);
  const state = addRepairLoss(
    before,
    { amount: "-5000", lostOn: "2026-10-16", reason: "Повреждение при работе" },
    "loss-once",
  );
  const backup = previewBackup(JSON.stringify(state));
  assert.deepEqual(backup, state);
  assert.equal(backup.repairLosses[0].amount, -5000);
  assert.equal(JSON.stringify(backup.inventory), snapshot);
  assert.equal(
    readState(memoryStorage(JSON.stringify(state))).repairLosses[0].amount,
    -5000,
  );
  const broken = {
    ...state,
    repairLosses: [{ ...state.repairLosses[0], amount: 5000 }],
  };
  assert.throws(() => previewBackup(JSON.stringify(broken)));
});
test("старая версия раздела ремонтов без убытков загружается без переписывания данных", () => {
  const state = ensureRepairState(legacyWorkspace());
  delete state.repairLosses;
  const raw = JSON.stringify(state);
  const storage = memoryStorage(raw);
  assert.deepEqual(readState(storage), state);
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.data.get(KEY), raw);
});
