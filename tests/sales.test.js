import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, recordSale, returnSale, confirmLegacySale, analytics, validateState } from "../src/domain/storage.js";
import { getSalesHistory, salesReport, saleDay, checkedSaleDate } from "../src/domain/sales.js";

const base = (buy = 50000) => ({ ...emptyState(), inventory: [{ id: "a35", model: "Samsung Galaxy A35 5G", storage: 128, ram: 8, buy, sell: 89000, status: "В наличии", date: "2026-09-01" }] });
const sell = (state = base(), date = "2026-10-01") => recordSale(state, "a35", 89000, 1000, "Наличные", date);
test("sale saves actual business date, recording time and immutable item/buy snapshot", () => {
  const state = sell();
  assert.equal(state.inventory[0].sale.at, "2026-10-01");
  assert.equal(state.inventory[0].sale.soldOn, "2026-10-01");
  assert.ok(Number.isFinite(Date.parse(state.inventory[0].sale.createdAt)));
  assert.equal(state.events.at(-1).itemSnapshot.buy, 50000);
  assert.equal(state.events.at(-1).itemSnapshot.model, "Samsung Galaxy A35 5G");
  assert.equal(validateState(state), state);
  assert.equal(analytics(state).profit, 38000);
});
test("zero purchase and zero actual revenue remain explicit; invalid numbers rejected", () => {
  const state = recordSale(base(0), "a35", 0, 0, "Карта", "2026-10-01");
  assert.equal(getSalesHistory(state).sales[0].buy, 0);
  assert.equal(analytics(state).profit, 0);
  for (const amount of [-1, NaN, Infinity, "", undefined])
    assert.throws(() => recordSale(base(), "a35", amount, 0, "Карта", "2026-10-01"));
});
test("event/current sale duplicates never double revenue and survive missing inventory", () => {
  const state = sell();
  state.events.push(structuredClone(state.events.at(-1)));
  assert.equal(getSalesHistory(state).sales.length, 1);
  assert.equal(analytics(state).revenue, 89000);
  state.inventory = [];
  const row = getSalesHistory(state).sales[0];
  assert.equal(row.model, "Samsung Galaxy A35 5G");
  assert.equal(row.buy, 50000);
  assert.equal(row.missingItem, true);
  assert.equal(analytics(state).sold, 1);
});
test("return keeps original sale and direct expense, dated reversal; resale stays separate", () => {
  const sold = sell();
  const returned = returnSale(sold, "a35", "Клиент вернул", "2026-10-02");
  assert.equal(analytics(returned).sold, 1);
  assert.equal(analytics(returned).returned, 1);
  assert.equal(analytics(returned).revenue, 0);
  assert.equal(analytics(returned).profit, -1000);
  assert.equal(getSalesHistory(returned).sales[0].returned, true);
  const resold = recordSale(returned, "a35", 90000, 2000, "Перевод", "2026-10-03");
  const report = salesReport(resold);
  assert.equal(report.count, 2);
  assert.equal(report.returnCount, 1);
  assert.equal(report.netRevenue, 90000);
  assert.equal(report.profit, 37000);
  assert.equal(salesReport(resold, { from: "2026-10-02", to: "2026-10-02" }).netRevenue, -89000);
  assert.throws(() => returnSale(sold, "a35", "Ошибка", "2026-09-30"), /раньше продажи/);
});
test("legacy sold status is not invented revenue; confirmation requires explicit facts", () => {
  const state = base(); state.inventory[0].status = "Продан";
  assert.equal(getSalesHistory(state).unconfirmed.length, 1);
  assert.equal(analytics(state).revenue, 0);
  assert.throws(() => recordSale(state, "a35", 89000, 0, "Карта", "2026-10-01"));
  assert.throws(() => confirmLegacySale(state, "a35", 87000, 1000, "Карта", "", "Чек"));
  assert.throws(() => confirmLegacySale(state, "a35", 87000, 1000, "Карта", "2026-10-01", ""));
  const confirmed = confirmLegacySale(state, "a35", 87000, 1000, "Карта", "2026-10-01", "Чек перевода");
  assert.equal(confirmed.events.at(-1).historicalConfirmation, true);
  assert.equal(confirmed.events.at(-1).confirmationReason, "Чек перевода");
  assert.equal(analytics(confirmed).revenue, 87000);
  assert.equal(getSalesHistory(confirmed).unconfirmed.length, 0);
  assert.throws(() => confirmLegacySale(confirmed, "a35", 87000, 1000, "Карта", "2026-10-01", "Чек"));
});
test("recorded event recovers visible history without changing source or double selling", () => {
  const state = sell(); state.inventory[0].sale = null; state.inventory[0].status = "В наличии";
  const before = JSON.stringify(state);
  assert.equal(analytics(state).sold, 1);
  assert.equal(analytics(state).stock, 0);
  assert.throws(() => recordSale(state, "a35", 89000, 0, "Карта", "2026-10-03"), /уже есть в истории/);
  assert.equal(JSON.stringify(state), before);
});
test("old event with deleted card never invents model, purchase or sale date", () => {
  const state = emptyState();
  state.events = [{ id: "old-sale", type: "sale", itemId: "lost", revenue: 75000, expenses: 1000, method: "Карта" }];
  const row = getSalesHistory(state).sales[0];
  assert.equal(row.buy, null);
  assert.equal(row.profit, null);
  assert.equal(row.day, null);
  assert.match(row.model, /модель неизвестна/);
  assert.equal(salesReport(state).unknownCostCount, 1);
  assert.equal(salesReport(state).netRevenue, 75000);
  assert.equal(salesReport(state, { from: "2026-01-01" }).count, 0);
});
test("dates/grouping use Asia/Almaty and inclusive real dates, not UTC or purchase date", () => {
  assert.equal(saleDay("2026-11-03T20:00:00Z"), "2026-11-04");
  assert.equal(saleDay("2026-02-31"), null);
  assert.throws(() => checkedSaleDate("2026-02-31"));
  assert.throws(() => checkedSaleDate("2099-01-01"));
  const state = sell();
  state.events[0].at = state.inventory[0].sale.at = "2026-11-03T20:00:00Z";
  assert.equal(salesReport(state, { from: "2026-11-04", to: "2026-11-04" }).count, 1);
  assert.equal(salesReport(state, { group: "week" }).groups[0].key, "2026-11-02");
  assert.equal(salesReport(state, { group: "month" }).groups[0].key, "2026-11");
  assert.throws(() => salesReport(state, { from: "2026-11-05", to: "2026-11-04" }));
});
