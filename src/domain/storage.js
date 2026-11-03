import { amount } from "./valuation.js";
import { catalogDefaults } from "./catalog.js";
import { policyDefaults } from "./valuation.js";
export const KEY = "nomad-workspace-v2";
export const LEGACY = "nomad-inventory-v1";
export const uid = () => globalThis.crypto.randomUUID();
export function emptyState() {
  return {
    schemaVersion: 2,
    mode: "local",
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
  if (raw !== null) return validateState(JSON.parse(raw));
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
      if (x.status !== "Продан")
        throw new Error("Продажа не согласована со статусом");
    }
  });
  if (!s.policy || Object.keys(policyDefaults).some((k) => !(k in s.policy)))
    throw new Error("Неполная политика");
  Object.values(s.policy).forEach((v) => amount(v));
  const names = new Set();
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
        !(price.source === "owner-guide" && price.base.box == null))
    )
      throw new Error("Некорректная запись прайса");
    priceIds.add(price.id);
    amount(price.price);
    amount(price.storage);
    if (price.source === "owner-guide") {
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
export function recordSale(state, id, revenue, expenses, method) {
  revenue = amount(revenue, "Выручка");
  expenses = amount(expenses, "Расходы");
  if (!["Наличные", "Перевод", "Карта", "Рассрочка"].includes(method))
    throw new Error("Выберите способ оплаты");
  const item = state.inventory.find((x) => x.id === id);
  if (!item) throw new Error("Товар не найден");
  if (item.sale || item.status === "Продан")
    throw new Error(
      "Продажа уже зарегистрирована или требует проверки старой истории",
    );
  const sale = {
    id: uid(),
    revenue,
    expenses,
    method,
    at: new Date().toISOString(),
  };
  return {
    ...state,
    inventory: state.inventory.map((x) =>
      x.id === id ? { ...x, status: "Продан", sale } : x,
    ),
    events: [...state.events, { id: uid(), type: "sale", itemId: id, ...sale }],
  };
}
export function returnSale(state, id, reason) {
  if (!reason.trim()) throw new Error("Укажите причину возврата");
  const item = state.inventory.find((x) => x.id === id);
  if (!item?.sale) throw new Error("Нет подтверждённой продажи");
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
        at: new Date().toISOString(),
        reason,
        sale: item.sale,
      },
    ],
  };
}
export function analytics(state) {
  const stock = state.inventory.filter((x) => x.status !== "Продан");
  const sold = state.inventory.filter((x) => x.sale);
  return {
    stock: stock.length,
    invested: stock.reduce((a, x) => a + Number(x.buy), 0),
    expected: stock.reduce((a, x) => a + Number(x.sell) - Number(x.buy), 0),
    revenue: sold.reduce((a, x) => a + x.sale.revenue, 0),
    profit: sold.reduce(
      (a, x) => a + x.sale.revenue - Number(x.buy) - x.sale.expenses,
      0,
    ),
    sold: sold.length,
  };
}
