import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnerPrice, ownerPriceSummary } from "../src/domain/price-builder.js";
import { emptyState } from "../src/domain/storage.js";
import { evaluate } from "../src/domain/valuation.js";
import { initialInput } from "../src/domain/catalog.js";
import { mergePrices, pricesCSV, previewPrices } from "../src/domain/imports.js";

const now = "2026-11-04T12:00:00.000Z";
const base = () => ({
  model: "Samsung Galaxy A35 5G", storage: 128, ram: 8, sim: "physical",
  buyMin: "40000", buyMax: "", saleMin: "75000", saleMax: "", author: "Владелец",
});

test("owner price uses entered purchase/sale and visible quick-sale policy without inventing market data", () => {
  const state = emptyState();
  const row = buildOwnerPrice(base(), state, { now });
  assert.equal(row.source, "owner-buy");
  assert.equal(row.price, 75000);
  assert.equal(row.buyMin, 40000);
  assert.equal(row.buyMax, 40000);
  assert.equal(row.quickMin, 71250);
  assert.equal(row.checkedAt, "2026-11-04");
  assert.deepEqual(ownerPriceSummary(row), { buyMiddle: 40000, saleMiddle: 75000, profitMiddle: 35000 });
  assert.match(row.note, /не статистика рынка/);
});
test("owner price handles ranges and explicit zero without replacing values", () => {
  const state = emptyState();
  const row = buildOwnerPrice({ ...base(), buyMin: 0, buyMax: 10000, saleMin: 30000, saleMax: 50000 }, state, { now });
  assert.equal(row.buyMin, 0);
  assert.equal(row.price, 50000);
  assert.deepEqual(ownerPriceSummary(row), { buyMiddle: 5000, saleMiddle: 40000, profitMiddle: 35000 });
  const zero = buildOwnerPrice({ ...base(), buyMin: 0, saleMin: 0 }, state, { now });
  assert.equal(zero.price, 0);
  assert.equal(zero.quickMin, 0);
});
test("invalid sums, reversed ranges, missing author and unknown configurations are rejected", () => {
  const state = emptyState();
  for (const value of ["", " ", null, false, -1, NaN, Infinity, "Infinity"])
    assert.throws(() => buildOwnerPrice({ ...base(), buyMin: value }, state, { now }));
  assert.throws(() => buildOwnerPrice({ ...base(), buyMax: 30000 }, state, { now }), /Верхняя цена/);
  assert.throws(() => buildOwnerPrice({ ...base(), saleMax: 60000 }, state, { now }), /Верхняя цена/);
  assert.throws(() => buildOwnerPrice({ ...base(), author: " " }, state, { now }), /автор/);
  assert.throws(() => buildOwnerPrice({ ...base(), storage: 999 }, state, { now }), /конфигурация/);
  assert.throws(() => buildOwnerPrice({ ...base(), battery: 101 }, state, { now }), /АКБ/);
});
test("own iPhone purchase price is not reduced by the document policy", () => {
  const state = emptyState();
  const row = buildOwnerPrice({ ...base(), model: "iPhone 13", storage: 128, ram: null }, state, { now });
  const input = { ...initialInput, model: "iPhone 13", storage: 128, ram: null, repairHistory: "none", locks: "checked",
    checks: { sensor: "ok", cameras: "ok", network: "ok", charging: "ok", faceid: "ok" } };
  const result = evaluate(input, row, state.policy, now);
  assert.equal(result.reduction, 0);
  assert.equal(result.preliminaryMin, 40000);
  assert.equal(result.showcase, 75000);
  const changedPolicy = evaluate(input, row, { ...state.policy, quick: 20 }, now);
  assert.equal(changedPolicy.quick, 60000);
});
test("Wi-Fi tablet own price keeps the exact physical memory and no-SIM variant", () => {
  const state = emptyState();
  state.catalog.push({ name: "Test Tab Wi-Fi", brand: "Lenovo", deviceType: "tablet", connectivity: "wifi",
    simModes: ["wifi"], source: "Конфигурация владельца", configs: [{ storage: 128, ram: 6 }] });
  const row = buildOwnerPrice({ ...base(), model: "Test Tab Wi-Fi", ram: 6, sim: "wifi" }, state, { now });
  assert.equal(row.sim, "wifi");
  assert.equal(row.ram, 6);
  assert.throws(() => buildOwnerPrice({ ...base(), model: "Test Tab Wi-Fi", ram: 12, sim: "wifi" }, state, { now }), /конфигурация/);
});
test("same own price updates once and round-trips CSV with range provenance", () => {
  const state = emptyState();
  const row = buildOwnerPrice(base(), state, { now });
  const saved = mergePrices(state, [row]);
  const repeated = mergePrices(saved, [row]);
  assert.equal(repeated.prices.length, 1);
  assert.equal(repeated.priceHistory.length, 1);
  const imported = previewPrices(pricesCSV(repeated.prices), "csv", state.catalog);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.valid[0].source, "owner-buy");
  assert.equal(imported.valid[0].buyMin, 40000);
  assert.equal(imported.valid[0].base.battery, null);
});
