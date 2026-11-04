import { validatePrice } from "./imports.js";
import { amount } from "./valuation.js";
import { businessToday } from "./repairs.js";

const blank = (value) => value == null || (typeof value === "string" && !value.trim());
function priceAmount(value, label) {
  if (blank(value)) throw new Error(label + ": укажите сумму");
  return amount(value, label);
}

// These are the owner's entered prices. No market prices or iPhone document
// reductions are inferred here. Lower quick-sale revenue uses the visible policy.
export function buildOwnerPrice(form, state, { now = new Date() } = {}) {
  const buyMin = priceAmount(form.buyMin, "Скупка от");
  const buyMax = blank(form.buyMax) ? buyMin : priceAmount(form.buyMax, "Скупка до");
  const saleMin = priceAmount(form.saleMin, "Продажа от");
  const saleMax = blank(form.saleMax) ? saleMin : priceAmount(form.saleMax, "Продажа до");
  if (buyMax < buyMin || saleMax < saleMin)
    throw new Error("Верхняя цена диапазона не может быть меньше нижней");
  const quick = amount(state.policy?.quick ?? 0, "Скидка быстрой продажи");
  if (quick > 100) throw new Error("Скидка быстрой продажи должна быть 0–100%");
  const battery = blank(form.battery) ? null : priceAmount(form.battery, "АКБ");
  if (battery != null && battery > 100) throw new Error("АКБ должна быть 0–100%");
  const row = {
    model: form.model,
    storage: form.storage,
    ram: form.ram == null || form.ram === "" ? null : form.ram,
    sim: form.sim ?? "physical",
    market: "Астана",
    currency: "KZT",
    channel: "store-cash",
    source: "owner-buy",
    sourceName: "Прайс владельца",
    price: saleMax,
    buyMin, buyMax, saleMin, saleMax,
    quickMin: Math.floor(saleMin * (1 - quick / 100)),
    quickMax: Math.floor(saleMax * (1 - quick / 100)),
    checkedAt: form.checkedAt || businessToday(now),
    author: String(form.author ?? "").trim(),
    note: String(form.note ?? "").trim() || "Ориентир владельца для указанной конфигурации, состояния и комплекта; не статистика рынка.",
    base: {
      screen: form.screen ?? "good",
      body: form.body ?? "good",
      box: form.box ?? true,
      battery,
    },
  };
  return validatePrice(row, state.catalog);
}

export function ownerPriceSummary(row) {
  const buyMiddle = (amount(row.buyMin) + amount(row.buyMax)) / 2;
  const saleMiddle = (amount(row.saleMin) + amount(row.saleMax)) / 2;
  return { buyMiddle, saleMiddle, profitMiddle: saleMiddle - buyMiddle };
}
