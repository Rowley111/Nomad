// Sales history is derived from immutable events, never from a plan or a status alone.
const finiteMoney = (value) => value !== "" && value != null && typeof value !== "boolean" &&
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function saleDay(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value + "T12:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !saleDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function saleToday(now = new Date().toISOString()) { return saleDay(now); }
export function checkedSaleDate(value, now = new Date().toISOString()) {
  const day = saleDay(value);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Укажите фактическую дату в формате ГГГГ-ММ-ДД");
  if (day > saleToday(now)) throw new Error("Фактическая дата не может быть в будущем");
  return day;
}
export function saleItemSnapshot(item) {
  return {
    id: item.id, model: item.model, storage: item.storage ?? null, ram: item.ram ?? null,
    buy: finiteMoney(item.buy), purchaseDate: item.date ?? null,
  };
}
const displayModel = (value) => typeof value === "string" && value.trim() ? value : "Карточка удалена / модель неизвестна";
const tuple = (itemId, sale) => [String(itemId ?? ""), sale.at ?? "", sale.revenue ?? "", sale.expenses ?? "", sale.method ?? ""].join("|");
export const getSaleRecordKey = (sale, itemId = sale.itemId) => String(itemId) + "::" + String(sale.id ?? `legacy:${tuple(itemId, sale)}`);

export function getSalesHistory(state) {
  const inventory = new Map(state.inventory.map((item) => [String(item.id), item]));
  const deleted = new Map();
  for (const event of state.events ?? []) if (event?.type === "delete" && event.item?.id != null) deleted.set(String(event.item.id), event.item);
  const sales = new Map(), identities = new Map(), warnings = [];
  const add = (sale, itemId, snapshot, source) => {
    if (!sale || finiteMoney(sale.revenue) == null || itemId == null) return null;
    const fallback = inventory.get(String(itemId)) ?? deleted.get(String(itemId));
    const item = snapshot && typeof snapshot.model === "string" ? snapshot : fallback;
    const identity = tuple(itemId, sale);
    const id = String(sale.id ?? identities.get(identity) ?? `legacy:${identity}`);
    const saleKey = getSaleRecordKey({ id }, itemId);
    const existing = sales.get(saleKey);
    const buy = finiteMoney(item?.buy), expenses = finiteMoney(sale.expenses);
    if (existing) {
      if (existing.revenue !== finiteMoney(sale.revenue) || existing.at !== (sale.at ?? null))
        warnings.push("Повторный ID продажи с отличающимися значениями: " + id);
      if (existing.model === "Карточка удалена / модель неизвестна" && item?.model) existing.model = displayModel(item.model);
      if (existing.buy == null && buy != null) { existing.buy = buy; existing.buySource = snapshot ? "sale-snapshot" : "inventory-record"; }
      if (existing.storage == null && item?.storage != null) existing.storage = item.storage;
      if (existing.ram == null && item?.ram != null) existing.ram = item.ram;
      existing.profit = existing.buy == null || existing.expenses == null ? null : existing.revenue - existing.buy - existing.expenses;
      return existing;
    }
    const row = {
      id, saleKey, itemId, model: displayModel(item?.model), storage: item?.storage ?? null, ram: item?.ram ?? null,
      buy, expenses, revenue: finiteMoney(sale.revenue), method: typeof sale.method === "string" ? sale.method : "Не указан",
      at: sale.at ?? null, day: saleDay(sale.at), createdAt: sale.createdAt ?? null,
      returned: false, returnAt: null, returnReason: null, source, missingItem: !inventory.has(String(itemId)),
      buySource: snapshot ? "sale-snapshot" : fallback ? "inventory-record" : "unknown",
      profit: buy == null || expenses == null ? null : finiteMoney(sale.revenue) - buy - expenses,
      historicalConfirmation: sale.historicalConfirmation === true,
    };
    sales.set(saleKey, row); identities.set(identity, id); return row;
  };
  // Events win over mutable/current inventory fields. New events carry a minimal item snapshot.
  for (const event of state.events ?? []) {
    if (event?.type === "sale") add(event.sale ?? event, event.itemId, event.itemSnapshot, "event");
  }
  for (const item of state.inventory) {
    if (item.sale) add(item.sale, item.id, item.sale.itemSnapshot, "inventory");
  }
  const returns = [], returnIds = new Set(), returnedSales = new Set();
  for (const event of state.events ?? []) {
    if (event?.type !== "return" || !event.sale || event.itemId == null) continue;
    const sale = add(event.sale, event.itemId, event.itemSnapshot, "return-event");
    if (!sale) continue;
    const id = String(event.id ?? `return:${sale.id}:${event.at ?? ""}`);
    const returnKey = String(event.itemId) + "::" + id;
    if (returnIds.has(returnKey) || returnedSales.has(sale.saleKey)) continue;
    returnIds.add(returnKey); returnedSales.add(sale.saleKey);
    sale.returned = true; sale.returnAt = event.at ?? null; sale.returnReason = event.reason ?? "Причина не сохранена";
    const refund = finiteMoney(event.refund) ?? sale.revenue;
    returns.push({
      id, saleId: sale.id, saleKey: sale.saleKey, itemId: event.itemId, model: sale.model, storage: sale.storage, ram: sale.ram,
      buy: sale.buy, expenses: 0, revenue: refund, refund, at: event.at ?? null, day: saleDay(event.at),
      reason: sale.returnReason, method: sale.method, profit: sale.buy == null ? null : sale.buy - refund,
    });
  }
  const rows = [...sales.values()].sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || b.id.localeCompare(a.id));
  const confirmedItems = new Set(rows.map((row) => String(row.itemId)));
  const unconfirmed = state.inventory.filter((item) => item.status === "Продан" && !item.sale && !confirmedItems.has(String(item.id)));
  return { sales: rows, returns: returns.sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "")), unconfirmed, warnings: [...new Set(warnings)] };
}

function groupKey(day, group) {
  if (!day) return "undated";
  if (group === "month") return day.slice(0, 7);
  if (group === "week") {
    const date = new Date(day + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.toISOString().slice(0, 10);
  }
  return day;
}
function groupLabel(key, group) {
  if (key === "undated") return "Дата не подтверждена";
  if (group === "month") return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(key + "-15T12:00:00Z"));
  const date = key.split("-").reverse().join(".");
  return group === "week" ? "Неделя с " + date : date;
}
function totals(sales, returns) {
  const unknown = new Set(sales.filter((row) => row.profit == null).map((row) => row.saleKey));
  for (const row of returns) if (row.profit == null) unknown.add(row.saleKey);
  const revenue = sales.reduce((sum, row) => sum + row.revenue, 0);
  const refunds = returns.reduce((sum, row) => sum + row.refund, 0);
  const expenses = sales.reduce((sum, row) => sum + (row.expenses ?? 0), 0);
  return {
    count: sales.length, returnCount: returns.length, revenue, refunds, netRevenue: revenue - refunds, expenses,
    profit: sales.reduce((sum, row) => sum + (row.profit ?? 0), 0) + returns.reduce((sum, row) => sum + (row.profit ?? 0), 0),
    unknownCostCount: unknown.size,
  };
}
export function salesReport(state, { from = "", to = "", group = "day", search = "" } = {}) {
  if (!["day", "week", "month"].includes(group)) throw new Error("Неизвестная группировка продаж");
  if ((from && saleDay(from) !== from) || (to && saleDay(to) !== to)) throw new Error("Некорректный период продаж");
  if (from && to && from > to) throw new Error("Начало периода позже окончания");
  const history = getSalesHistory(state), query = search.trim().toLocaleLowerCase("ru-RU");
  const filter = (row) => (!query || row.model.toLocaleLowerCase("ru-RU").includes(query)) &&
    ((!from && !to) || row.day != null) && (!from || row.day >= from) && (!to || row.day <= to);
  const sales = history.sales.filter(filter), returns = history.returns.filter(filter), groups = new Map();
  const bucket = (day) => {
    const key = groupKey(day, group);
    if (!groups.has(key)) groups.set(key, { key, label: groupLabel(key, group), sales: [], returns: [] });
    return groups.get(key);
  };
  for (const row of sales) bucket(row.day).sales.push(row);
  for (const row of returns) bucket(row.day).returns.push(row);
  return {
    ...history, sales, returns, ...totals(sales, returns),
    groups: [...groups.values()].map((row) => ({ ...row, ...totals(row.sales, row.returns) })).sort((a, b) => b.key.localeCompare(a.key)),
  };
}
