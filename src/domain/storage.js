import {
  repairDefaults,
  ensureRepairState,
  validateRepairState,
} from "./repairs.js";
import { amount } from "./valuation.js";
import { catalogDefaults } from "./catalog.js";
import { policyDefaults } from "./valuation.js";
import { CATALOG_REVISION, upgradeCatalog, validateCatalog } from "./catalog-management.js";
import { cashDefaults, ensureCashState, validateCashState } from "./cash.js";
import { checkedSaleDate, getSalesHistory, saleDay, saleItemSnapshot, salesReport } from "./sales.js";
export const KEY = "nomad-workspace-v2";
export const LEGACY = "nomad-inventory-v1";
export const uid = () => globalThis.crypto.randomUUID();
export function emptyState() {
  return {
    ...repairDefaults(),
    ...cashDefaults(),
    schemaVersion: 2,
    mode: "local",
    catalogRevision: CATALOG_REVISION,
    inventory: [],
    prices: [],
    priceHistory: [],
    assessments: [],
    events: [],
    catalog: structuredClone(catalogDefaults),
    policy: { ...policyDefaults },
  };
}
export function validateItem(x) {
  if (!x || typeof x.model !== "string" || !x.model.trim() || x.id == null)
    throw new Error("Некорректная карточка склада");
  amount(x.buy, "Закуп");
  amount(x.sell, "Плановая продажа");
  return x;
}
export function migrateLegacy(rows) {
  if (!Array.isArray(rows))
    throw new Error("Старый склад должен быть массивом");
  const state = emptyState();
  const ids = new Set();
  state.inventory = rows.map((x) => {
    validateItem(x);
    if (ids.has(String(x.id))) throw new Error("Повтор ID старого склада");
    ids.add(String(x.id));
    return {
      ...x,
      legacy: true,
      legacySold: x.status === "Продан",
      sale: null,
    };
  });
  return state;
}
export function readState(storage) {
  const raw = storage.getItem(KEY);
  if (raw !== null) {
    const previous = validateState(JSON.parse(raw));
    const repaired = ensureRepairState(previous);
    const catalogued = upgradeCatalog(repaired);
    const upgraded = ensureCashState(catalogued);
    if (upgraded !== previous) {
      if (repaired !== previous) storage.setItem(KEY + "-before-repairs-v1", raw);
      if (catalogued !== repaired) storage.setItem(KEY + "-before-catalog-v" + CATALOG_REVISION, raw);
      if (upgraded !== catalogued) storage.setItem(KEY + "-before-cash-v1", raw);
      storage.setItem(KEY, JSON.stringify(upgraded));
    }
    return upgraded;
  }
  const old = storage.getItem(LEGACY);
  if (old === null) return emptyState();
  const state = migrateLegacy(JSON.parse(old));
  storage.setItem(LEGACY + "-backup-before-v2", old);
  storage.setItem(KEY, JSON.stringify(state));
  return state;
}
export function validateState(s) {
  if (s?.schemaVersion !== 2 || s.mode !== "local")
    throw new Error("Неподдерживаемая схема");
  if (s.catalogRevision !== undefined && (!Number.isSafeInteger(s.catalogRevision) || s.catalogRevision < 0))
    throw new Error("Некорректная версия каталога");
  for (const k of [
    "inventory",
    "prices",
    "priceHistory",
    "assessments",
    "events",
    "catalog",
  ])
    if (!Array.isArray(s[k])) throw new Error("Нет массива " + k);
  if (
    s.setupImports !== undefined &&
    (!Array.isArray(s.setupImports) ||
      s.setupImports.length > 100 ||
      s.setupImports.some(
        (x) =>
          !x ||
          !/^[a-f0-9]{32}$/.test(x.id) ||
          !Number.isFinite(Date.parse(x.at)),
      ))
  )
    throw new Error("Некорректная история настройки");
  const ids = new Set();
  s.inventory.forEach((x) => {
    validateItem(x);
    if (ids.has(String(x.id))) throw new Error("Повтор ID склада");
    ids.add(String(x.id));
    if (x.sale) {
      amount(x.sale.revenue);
      amount(x.sale.expenses);
      if (x.sale.soldOn !== undefined && (saleDay(x.sale.soldOn) !== x.sale.soldOn || saleDay(x.sale.at) !== x.sale.soldOn))
        throw new Error("Некорректная фактическая дата продажи");
      if (x.sale.createdAt !== undefined && !Number.isFinite(Date.parse(x.sale.createdAt)))
        throw new Error("Некорректная дата регистрации продажи");
      if (x.status !== "Продан")
        throw new Error("Продажа не согласована со статусом");
    }
  });
  if (!s.policy || Object.keys(policyDefaults).some((k) => !(k in s.policy)))
    throw new Error("Неполная политика");
  Object.values(s.policy).forEach((v) => amount(v));
  const names = new Set();
  validateCatalog(s.catalog);
  for (const model of s.catalog) {
    if (
      !model ||
      typeof model.name !== "string" ||
      !model.name.trim() ||
      !Array.isArray(model.configs) ||
      names.has(model.name)
    )
      throw new Error("Некорректный каталог");
    names.add(model.name);
    for (const config of model.configs) {
      if (
        amount(config.storage) <= 0 ||
        (config.ram != null && amount(config.ram) <= 0)
      )
        throw new Error("Некорректная память");
    }
  }
  const priceIds = new Set();
  for (const price of s.prices) {
    if (
      !price.id ||
      priceIds.has(price.id) ||
      typeof price.model !== "string" ||
      !price.base ||
      !["ideal", "good", "worn"].includes(price.base.screen) ||
      !["ideal", "good", "worn"].includes(price.base.body) ||
      (typeof price.base.box !== "boolean" &&
        !(["owner-guide", "owner-buy"].includes(price.source) && price.base.box == null))
    )
      throw new Error("Некорректная запись прайса");
    priceIds.add(price.id);
    amount(price.price);
    amount(price.storage);
    if (["owner-guide", "owner-buy"].includes(price.source)) {
      for (const key of [
        "buyMin",
        "buyMax",
        "saleMin",
        "saleMax",
        "quickMin",
        "quickMax",
      ])
        amount(price[key], key);
      if (
        price.buyMin > price.buyMax ||
        price.saleMin > price.saleMax ||
        price.quickMin > price.quickMax
      )
        throw new Error("Обратный диапазон прайса");
    }
    if (!Number.isFinite(Date.parse(price.checkedAt)))
      throw new Error("Некорректная дата прайса");
  }
  for (const a of s.assessments)
    if (!a.id || !a.input || typeof a.input.model !== "string")
      throw new Error("Некорректная сохранённая оценка");
  validateRepairState(s);
  validateCashState(s);
  return s;
}
export function purchase(state, snapshot, buy, reason = "") {
  buy = amount(buy, "Фактический закуп");
  if (
    snapshot.purchaseToken &&
    state.inventory.some((x) => x.purchaseToken === snapshot.purchaseToken)
  )
    throw new Error("Эта закупка уже подтверждена");
  if (snapshot.status === "no-data") throw new Error("Нет основания оценки");
  if ((snapshot.maxBuy == null || buy > snapshot.maxBuy) && !reason.trim())
    throw new Error("Нужна причина закупа при рисках или превышении максимума");
  const id = uid();
  const x = {
    ...snapshot.input,
    id,
    purchaseToken: snapshot.purchaseToken ?? uid(),
    buy,
    sell: snapshot.showcase,
    status:
      snapshot.status === "diagnosis" ? "На диагностике/ремонте" : "В наличии",
    date: new Date().toISOString(),
    snapshot: structuredClone(snapshot),
    purchaseReason: reason,
    sale: null,
  };
  return {
    ...state,
    inventory: [x, ...state.inventory],
    events: [
      ...state.events,
      {
        id: uid(),
        type: "purchase",
        itemId: id,
        at: new Date().toISOString(),
        buy,
        reason,
      },
    ],
  };
}
function prepareSale(item, revenue, expenses, method, soldOn) {
  revenue = amount(revenue, "Выручка");
  expenses = amount(expenses, "Расходы");
  if (!["Наличные", "Перевод", "Карта", "Рассрочка"].includes(method))
    throw new Error("Выберите способ оплаты");
  const createdAt = new Date().toISOString();
  const at = soldOn ? checkedSaleDate(soldOn, createdAt) : createdAt;
  return { id: uid(), revenue, expenses, method, at, soldOn: saleDay(at), createdAt, itemSnapshot: saleItemSnapshot(item) };
}
function applySale(state, item, sale) {
  return {
    ...state,
    inventory: state.inventory.map((x) => x.id === item.id ? { ...x, status: "Продан", sale } : x),
    events: [...state.events, { ...structuredClone(sale), type: "sale", itemId: item.id }],
  };
}
export function recordSale(state, id, revenue, expenses, method, soldOn = "") {
  const item = state.inventory.find((x) => x.id === id);
  if (!item) throw new Error("Товар не найден");
  if (item.sale || item.status === "Продан")
    throw new Error(
      "Продажа уже зарегистрирована или требует проверки старой истории",
    );
  if (getSalesHistory(state).sales.some((row) => String(row.itemId) === String(id) && !row.returned))
    throw new Error("Продажа этого товара уже есть в истории. Не создавайте повторную сделку");
  return applySale(state, item, prepareSale(item, revenue, expenses, method, soldOn));
}
export function confirmLegacySale(state, id, revenue, expenses, method, soldOn, reason) {
  const item = state.inventory.find((row) => row.id === id);
  if (!item || item.status !== "Продан" || item.sale) throw new Error("Нет старой неподтверждённой продажи");
  if (typeof reason !== "string" || !reason.trim()) throw new Error("Укажите основание подтверждения старой сделки");
  if (getSalesHistory(state).sales.some((row) => String(row.itemId) === String(id)))
    throw new Error("Подтверждённая продажа уже есть в журнале");
  checkedSaleDate(soldOn);
  const sale = { ...prepareSale(item, revenue, expenses, method, soldOn), historicalConfirmation: true, confirmationReason: reason.trim() };
  return applySale(state, item, sale);
}
export function returnSale(state, id, reason, returnedOn = "") {
  if (!reason.trim()) throw new Error("Укажите причину возврата");
  const item = state.inventory.find((x) => x.id === id);
  if (!item?.sale) throw new Error("Нет подтверждённой продажи");
  const createdAt = new Date().toISOString();
  const at = returnedOn ? checkedSaleDate(returnedOn, createdAt) : createdAt;
  if (saleDay(at) < saleDay(item.sale.at)) throw new Error("Возврат не может быть раньше продажи");
  return {
    ...state,
    inventory: state.inventory.map((x) =>
      x.id === id ? { ...x, status: "В наличии", sale: null } : x,
    ),
    events: [
      ...state.events,
      {
        id: uid(),
        type: "return",
        itemId: id,
        at,
        createdAt,
        reason,
        sale: structuredClone(item.sale),
        refund: item.sale.revenue,
        itemSnapshot: item.sale.itemSnapshot ?? saleItemSnapshot(item),
      },
    ],
  };
}
export function analytics(state) {
  const history = getSalesHistory(state), report = salesReport(state);
  const active = new Set(history.sales.filter((row) => !row.returned).map((row) => String(row.itemId)));
  const stock = state.inventory.filter((x) => x.status !== "Продан" && !active.has(String(x.id)));
  return {
    stock: stock.length,
    invested: stock.reduce((a, x) => a + Number(x.buy), 0),
    expected: stock.reduce((a, x) => a + Number(x.sell) - Number(x.buy), 0),
    revenue: report.netRevenue,
    profit: report.profit,
    sold: report.count,
    grossRevenue: report.revenue,
    refunds: report.refunds,
    returned: report.returnCount,
    activeSales: history.sales.filter((row) => !row.returned).length,
    unknownCostCount: report.unknownCostCount,
    unconfirmedSales: history.unconfirmed.length,
  };
}
