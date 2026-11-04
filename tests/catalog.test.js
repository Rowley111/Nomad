import test from "node:test";
import assert from "node:assert/strict";
import { catalogDefaults, changeModel, initialInput, deviceProfile } from "../src/domain/catalog.js";
import { saveCatalogModel, upgradeCatalog, validateCatalog, CATALOG_REVISION } from "../src/domain/catalog-management.js";
import { emptyState, readState, KEY } from "../src/domain/storage.js";
import { buildOwnerPrice } from "../src/domain/price-builder.js";
import { mergePrices, validatePrice } from "../src/domain/imports.js";
import { evaluate } from "../src/domain/valuation.js";

const custom = (overrides = {}) => ({ name: "OPPO Моя модель 5G", brand: "OPPO", deviceType: "phone", connectivity: "phone", biometric: "unknown", configs: [{ storage: "128", ram: "8" }], ...overrides });
test("popular reference spans phones/tablets without making up any price", () => {
  assert.ok(catalogDefaults.length >= 300);
  for (const brand of ["Motorola", "Samsung", "Xiaomi", "Redmi", "OPPO", "Google", "ZTE", "Apple"])
    assert.ok(catalogDefaults.some((row) => row.brand === brand));
  assert.ok(catalogDefaults.filter((row) => row.deviceType === "tablet").length >= 50);
  assert.equal(emptyState().prices.length, 0);
  assert.ok(catalogDefaults.some((row) => row.configs.length === 0 && !row.verified));
  assert.equal(validateCatalog(catalogDefaults), catalogDefaults);
});
test("local catalogue upgrade preserves custom records, stock and prices, backs up once", () => {
  const previous = emptyState();
  delete previous.catalogRevision;
  previous.catalog = [custom({ name: "Мой старый телефон", configs: [{ storage: "128", ram: "8" }] })];
  previous.inventory.push({ id: "old", model: "Мой старый телефон", buy: 0, sell: 75000 });
  const raw = JSON.stringify(previous), map = new Map([[KEY, raw]]), writes = [];
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { writes.push(key); map.set(key, value); } };
  const next = readState(storage);
  assert.deepEqual(next.inventory, previous.inventory);
  assert.deepEqual(next.catalog[0], previous.catalog[0]);
  assert.equal(map.get(KEY + "-before-catalog-v" + CATALOG_REVISION), raw);
  assert.ok(next.catalog.length > previous.catalog.length);
  const count = writes.length;
  readState(storage);
  assert.equal(writes.length, count);
  assert.equal(upgradeCatalog(next), next);
});
test("constructor accepts exact new configuration and refuses duplicate/invalid physical RAM", () => {
  let state = saveCatalogModel(emptyState(), null, custom());
  assert.deepEqual(state.catalog.at(-1).configs, [{ storage: 128, ram: 8 }]);
  assert.throws(() => saveCatalogModel(state, null, custom({ name: "oppo моя модель 5g" })), /уже существует/);
  for (const row of [{ storage: 128, ram: "" }, { storage: -1, ram: 8 }, { storage: 128, ram: Infinity }, { storage: 128.5, ram: 8 }])
    assert.throws(() => saveCatalogModel(state, null, custom({ name: "Другая модель", configs: [row] })));
  state = saveCatalogModel(state, null, custom({ name: "Неизвестная память", configs: [{ storage: "", ram: "" }] }));
  assert.deepEqual(state.catalog.at(-1).configs, []);
});
test("changing used model/config cannot detach a saved price or purchase history", () => {
  let state = saveCatalogModel(emptyState(), null, custom());
  const row = buildOwnerPrice({ model: custom().name, storage: 128, ram: 8, sim: "physical", buyMin: 40000, saleMin: 75000, author: "Владелец" }, state);
  state = mergePrices(state, [row]);
  const old = structuredClone(state);
  assert.throws(() => saveCatalogModel(state, custom().name, custom({ name: "Переименовано" })), /используется/);
  assert.throws(() => saveCatalogModel(state, custom().name, custom({ configs: [{ storage: 256, ram: 8 }] })), /используемую прайсом/);
  assert.throws(() => saveCatalogModel(state, custom().name, custom({ deviceType: "tablet", connectivity: "wifi" })), /связи используется прайсом/);
  assert.deepEqual(state, old);
});
test("Wi-Fi and Cellular tablets cannot share SIM prices; A16 Cellular is eSIM-only", () => {
  const wifi = catalogDefaults.find((row) => row.name === "iPad (A16) Wi-Fi");
  const cellular = catalogDefaults.find((row) => row.name === "iPad (A16) Wi-Fi + Cellular");
  assert.ok(wifi && cellular);
  assert.deepEqual(deviceProfile(wifi).simModes, ["wifi"]);
  assert.deepEqual(deviceProfile(cellular).simModes, ["esim"]);
  const state = emptyState();
  const form = { model: wifi.name, storage: 128, ram: null, sim: "wifi", buyMin: 40000, saleMin: 75000, author: "Владелец" };
  const price = buildOwnerPrice(form, state);
  assert.throws(() => validatePrice({ ...price, sim: "physical" }, state.catalog), /Wi-Fi/);
  const input = changeModel(initialInput, wifi.name, state.catalog);
  assert.equal(input.sim, "wifi");
  assert.throws(() => evaluate({ ...input, sim: "physical" }, price, state.policy, undefined, wifi), /SIM/);
  assert.equal(evaluate(input, price, state.policy, undefined, wifi).base, 75000);
});
test("model changes reset incompatible memory and only applicable Face ID is required", () => {
  const state = emptyState();
  const se = changeModel({ ...initialInput, storage: 2048, battery: 0 }, "iPhone SE (3rd generation)", state.catalog);
  const actualSE = state.catalog.find((row) => row.name.includes("iPhone SE") && row.biometric === "fingerprint");
  assert.ok(actualSE);
  const selected = changeModel(initialInput, actualSE.name, state.catalog);
  assert.equal(selected.checks.faceid, undefined);
  const pro = state.catalog.find((row) => row.deviceType === "tablet" && row.biometric === "faceid");
  assert.equal(changeModel(initialInput, pro.name, state.catalog).checks.faceid, "unknown");
  assert.notEqual(se.storage, 2048);
  assert.equal(se.battery, "");
});
