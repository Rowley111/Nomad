import test from "node:test";
import assert from "node:assert/strict";
import { workbookModels, findWorkbookPrice, workbookSummary } from "../src/domain/workbook.js";
import { evaluate } from "../src/domain/valuation.js";
import { initialInput, changeModel } from "../src/domain/catalog.js";
import { emptyState } from "../src/domain/storage.js";

const input = { ...initialInput, model: "Samsung Galaxy A35 5G", storage: 128, ram: 8, sim: "physical", ask: 50000,
  locks: "checked", repairHistory: "none", checks: { sensor: "ok", cameras: "ok", network: "ok", charging: "ok" } };
const now = "2026-11-04T12:00:00.000Z";

test("workbook preserves all provided rows and labels prices as unverified calculations", () => {
  const summary = workbookSummary();
  assert.equal(summary.models, 1187);
  assert.equal(summary.variants, 2675);
  assert.equal(summary.pricedVariants, 2618);
  assert.equal(summary.noPriceVariants, 57);
  const models = workbookModels();
  assert.equal(models.length, summary.models);
  assert.ok(models.every((row) => row.verified === false));
  assert.equal(models.reduce((sum, row) => sum + row.configs.length, 0), summary.variants);
  assert.ok(JSON.stringify(models).length < 700000);
});
test("A35 exact cached memory row returns 88000/80000/72000/39000–52000 without repeating Excel factors", () => {
  const price = findWorkbookPrice(input);
  assert.equal(price.price, 88000);
  assert.equal(price.saleMin, 80000);
  assert.equal(price.quickMin, 72000);
  assert.equal(price.buyMin, 39000);
  assert.equal(price.buyMax, 52000);
  const state = emptyState(), model = state.catalog.find((row) => row.name === input.model);
  const result = evaluate(input, price, state.policy, now, model);
  assert.equal(result.showcase, 88000);
  assert.equal(result.sale, 80000);
  assert.equal(result.quick, 72000);
  assert.equal(result.preliminaryMin, 39000);
  assert.equal(result.preliminaryMax, 52000);
  assert.equal(result.installment, 110000);
  assert.deepEqual(result.adjustments, []);
  assert.equal(result.maxBuy, null);
  assert.equal(result.status, "diagnosis");
});
test("date of calculation is retained separately and never becomes a price-verification date", () => {
  const price = findWorkbookPrice(input);
  assert.equal(price.checkedAt, null);
  assert.equal(price.workbook.priceCheckedOn, null);
  assert.equal(price.workbook.calculatedOn, "2026-11-04");
  assert.equal(price.workbook.specificationUrl, "");
  assert.match(price.workbook.priceStatus, /рынок не проверен/);
});
test("configuration matching never rounds physical RAM or borrows an adjacent model price", () => {
  const six = findWorkbookPrice({ ...input, ram: 6 });
  assert.equal(six.price, 86000);
  assert.notEqual(six.id, findWorkbookPrice(input).id);
  assert.equal(findWorkbookPrice({ ...input, ram: null }), undefined);
  assert.equal(findWorkbookPrice({ ...input, ram: 16 }), undefined);
  assert.equal(findWorkbookPrice({ ...input, storage: 1024 }), undefined);
  assert.equal(findWorkbookPrice({ ...input, model: "Samsung Galaxy A35 5G Ultra" }), undefined);
  assert.equal(findWorkbookPrice({ ...input, sim: "wifi" }), undefined);
  const bold = workbookModels().find((row) => row.name === "BlackBerry Bold 9900");
  assert.equal(bold.configs[0].ram, 0.75);
});
test("workbook rows without a price stay empty and foldables without a buy range stay manual", () => {
  assert.equal(findWorkbookPrice({ model: "BlackBerry Bold 9900", storage: 8, ram: 0.75, sim: "physical" }), undefined);
  const fold = findWorkbookPrice({ model: "Samsung Galaxy Z Fold4", storage: 256, ram: 12, sim: "physical" });
  assert.ok(fold);
  assert.equal(fold.buyMin, null);
  assert.equal(fold.buyMax, null);
  assert.equal(fold.workbook.hasBuyRange, false);
  assert.equal(fold.workbook.manualDiagnosis, true);
  const state = emptyState(), model = state.catalog.find((row) => row.name === fold.model);
  const selected = changeModel(input, fold.model, state.catalog);
  const result = evaluate(selected, fold, state.policy, now, model);
  assert.equal(result.preliminaryMin, null);
  assert.equal(result.customerOffer, null);
  assert.equal(result.maxBuy, null);
});
test("lookups are deterministic and cannot be changed through a previous returned snapshot", () => {
  const original = findWorkbookPrice(input), next = findWorkbookPrice(input);
  assert.deepEqual(original, next);
  original.price = 1;
  original.workbook.usedReference = 1;
  assert.equal(findWorkbookPrice(input).price, 88000);
  assert.equal(findWorkbookPrice(input).workbook.usedReference, 80000);
});
test("renaming a model cannot carry its previous workbook reference to another model", () => {
  const original = workbookModels().find((row) => row.name === input.model);
  assert.equal(findWorkbookPrice({ ...input, model: "Другая модель" }, { ...original, name: "Другая модель" }), undefined);
});
test("old iPhone references distinguish models with no biometric sensor, Touch ID and Face ID", () => {
  const models = workbookModels();
  assert.equal(models.find((row) => row.name === "iPhone 5").biometric, "none");
  assert.equal(models.find((row) => row.name === "iPhone 8").biometric, "fingerprint");
  assert.equal(models.find((row) => row.name === "iPhone 13").biometric, "faceid");
});
test("a specification URL never labels an editorial workbook price as a verified market quote", () => {
  const price = findWorkbookPrice({ model: "iPhone 13", storage: 128, ram: null, sim: "physical" });
  assert.match(price.workbook.specificationUrl, /support\.apple\.com/);
  assert.equal(price.workbook.priceCheckedOn, null);
  assert.equal(price.workbook.quality, "unverified-editorial-estimate");
  assert.equal(workbookModels().find((row) => row.name === "iPhone 13").verified, false);
});
