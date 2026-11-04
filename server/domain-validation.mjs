import { isDeepStrictEqual } from "node:util";
import { ensureRepairState } from "../src/domain/repairs.js";
import { validateState } from "../src/domain/storage.js";
import { evaluate, amount } from "../src/domain/valuation.js";
import { validateCatalog } from "../src/domain/catalog-management.js";

function safeJSON(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Недопустимое имя поля");
      safeJSON(value[key]);
    }
  }
}

export function validateWorkspace(value) {
  safeJSON(value);
  const state = ensureRepairState(validateState(value));
  const purchaseTokens = new Set();
  for (const row of state.inventory) {
    if (row.purchaseToken == null) continue; // Historical local rows had no token.
    if (typeof row.purchaseToken !== "string" || !row.purchaseToken.trim() ||
        row.purchaseToken.length > 128 || purchaseTokens.has(row.purchaseToken))
      throw new Error("Повторный или некорректный идентификатор закупки");
    purchaseTokens.add(row.purchaseToken);
  }
  // Historical audit rows may lack IDs. Keep them verbatim; import identifies
  // those rows by canonical content, without inventing dates or business facts.
  for (const key of ["assessments", "events", "priceHistory"]) {
    const ids = new Set();
    for (const row of state[key]) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error("Некорректная запись истории: " + key);
      if (row.id == null) continue;
      if (ids.has(String(row.id))) throw new Error("Повторный ID: " + key);
      ids.add(String(row.id));
    }
  }
  return state;
}

function appendOnly(previous, next, key) {
  const rows = next[key] ?? [];
  for (const [index, row] of (previous[key] ?? []).entries()) {
    if (!isDeepStrictEqual(row, rows[index]))
      throw new Error("Историю нельзя удалить или переписать: " + key);
  }
}

function preserveExpenseRows(beforeRows, afterRows, label) {
  const byId = new Map(afterRows.map((row) => [String(row.id), row]));
  for (const before of beforeRows) {
    const after = byId.get(String(before.id));
    if (isDeepStrictEqual(before, after)) continue;
    const stripVoid = (row) => Object.fromEntries(Object.entries(row ?? {}).filter(
      ([key]) => !["voided", "voidReason", "voidedAt"].includes(key)));
    if (!after || before.voided || !after.voided || !after.voidReason?.trim() ||
        !isDeepStrictEqual(stripVoid(before), stripVoid(after)))
      throw new Error("Расход можно исправить только сторнированием: " + label);
  }
}

function verifySnapshot(snapshot, previous, now) {
  if (!snapshot?.input || !Number.isFinite(Date.parse(snapshot.at)))
    throw new Error("Нужен снимок оценки с датой");
  if (Math.abs(Date.parse(snapshot.at) - Date.parse(now)) > 10 * 60 * 1000)
    throw new Error("Обновите оценку перед сохранением: прошло более 10 минут");
  const price = previous.prices.find((row) => row.id === snapshot.price?.id);
  if (!price || !isDeepStrictEqual(price, snapshot.price))
    throw new Error("Прайс изменился. Пересчитайте оценку");
  const result = evaluate(snapshot.input, price, previous.policy, snapshot.at, previous.catalog.find((row) => row.name === snapshot.input.model));
  for (const [key, expected] of Object.entries(result)) {
    if (!isDeepStrictEqual(snapshot[key], expected))
      throw new Error("Серверный расчёт не совпал с оценкой: " + key);
  }
  return result;
}

export function validateTransition(previousValue, value, now = new Date().toISOString()) {
  const previous = validateWorkspace(previousValue);
  const state = validateWorkspace(value);
  if (!isDeepStrictEqual(previous.catalog, state.catalog)) validateCatalog(state.catalog, previous.prices);
  for (const key of ["events", "priceHistory", "repairEvents", "assessments"])
    appendOnly(previous, state, key);
  preserveExpenseRows(previous.repairLosses ?? [], state.repairLosses ?? [], "убытки");
  const repairOrders = new Map(state.repairOrders.map((row) => [String(row.id), row]));
  for (const before of previous.repairOrders) {
    const after = repairOrders.get(String(before.id));
    if (!after) throw new Error("Нельзя удалить заказ ремонта");
    appendOnly(before, after, "payments");
    preserveExpenseRows(before.materials, after.materials, "материалы");
    preserveExpenseRows(before.costs, after.costs, "расходы ремонта");
  }
  const oldAssessments = new Set(previous.assessments.map((row) => row.id));
  for (const row of state.assessments) {
    if (!oldAssessments.has(row.id)) verifySnapshot(row, previous, now);
  }
  const byId = new Map(state.inventory.map((row) => [String(row.id), row]));
  const oldIds = new Set(previous.inventory.map((row) => String(row.id)));
  const newEvents = state.events.slice(previous.events.length);
  for (const before of previous.inventory) {
    const after = byId.get(String(before.id));
    if (!after) throw new Error("Нельзя удалить карточку склада");
    if (!isDeepStrictEqual(before.snapshot, after.snapshot) || before.buy !== after.buy)
      throw new Error("Закуп и исторический снимок нельзя переписать");
    for (const key of ["model", "storage", "ram", "sim", "date", "purchaseToken"])
      if (!isDeepStrictEqual(before[key], after[key]))
        throw new Error("Исторические данные закупки нельзя переписать: " + key);
    if (before.sale && after.sale && !isDeepStrictEqual(before.sale, after.sale))
      throw new Error("Исправление продажи требует возврата отдельным событием");
    if (before.sale && !after.sale && !newEvents.some((event) =>
      event.type === "return" && event.itemId === before.id &&
      event.reason?.trim() && isDeepStrictEqual(event.sale, before.sale)))
      throw new Error("Возврат требует причины и события с прежней продажей");
    if (!before.sale && after.sale) {
      if (before.status === "Продан")
        throw new Error("Старый статус продажи не подтверждает фактическую сделку");
      if (!["Наличные", "Перевод", "Карта", "Рассрочка"].includes(after.sale.method) ||
          !newEvents.some((event) => event.type === "sale" && event.itemId === after.id &&
            event.id === after.sale.id && event.revenue === after.sale.revenue &&
            event.expenses === after.sale.expenses && event.method === after.sale.method))
        throw new Error("Продажа требует фактической суммы, способа оплаты и события");
    }
  }
  const tokens = new Set();
  for (const row of state.inventory) {
    if (row.purchaseToken) {
      if (tokens.has(row.purchaseToken)) throw new Error("Повторная закупка");
      tokens.add(row.purchaseToken);
    }
    if (oldIds.has(String(row.id))) continue;
    const result = verifySnapshot(row.snapshot, previous, now);
    amount(row.buy, "Фактический закуп");
    if (result.status === "no-data" || row.sale)
      throw new Error("Новая закупка требует оценки и отдельной продажи");
    if ((result.maxBuy == null || row.buy > result.maxBuy) && !row.purchaseReason?.trim())
      throw new Error("Нужна причина закупа при рисках или превышении максимума");
    if (!row.purchaseToken || !newEvents.some((event) =>
      event.type === "purchase" && event.itemId === row.id && event.buy === row.buy))
      throw new Error("Нужно подтверждение закупа отдельным событием");
    for (const key of ["model", "storage", "ram", "sim"])
      if (row[key] !== row.snapshot.input[key])
        throw new Error("Конфигурация закупа отличается от оценки");
  }
  return state;
}

export function calculateWorkspace(stateValue, input, priceId, now) {
  const state = validateWorkspace(stateValue);
  return evaluate(input, state.prices.find((row) => row.id === priceId), state.policy, now, state.catalog.find((row) => row.name === input.model));
}
