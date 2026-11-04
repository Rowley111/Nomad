// Internal cash-flow ledger. Balances start at zero; cash flow is not profit.
const KEYS = ["cashSchemaVersion", "cashAccounts", "cashCategories", "employees", "cashTransactions", "cashEvents", "cashStartedAt"];
const KINDS = ["income", "expense", "transfer"];
const EVENT_TYPES = ["cash-created", "cash-voided", "cash-employee-saved", "cash-category-saved"];
const clone = (value) => structuredClone(value);
const uid = () => globalThis.crypto.randomUUID();
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const round = (value) => {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Сумма слишком велика");
  return cents === 0 ? 0 : cents / 100;
};
function text(value, name, { optional = false, max = 2000 } = {}) {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()) ||
      [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127))
    throw new Error("Некорректное поле: " + name);
  return value.trim();
}
function id(value, name = "идентификатор") { return text(value, name, { max: 128 }); }
function date(value, name = "Дата операции") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(name + ": используйте ГГГГ-ММ-ДД");
  const parsed = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(name + ": такой даты нет");
  return value;
}
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Некорректное время события кассы");
  return value;
}
export function cashToday(now = new Date().toISOString()) {
  timestamp(now);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function money(value, allowNegative = false) {
  if (!["number", "string"].includes(typeof value)) throw new Error("Сумма: требуется конечное число больше нуля");
  const input = typeof value === "string" ? value.trim().replace(/^−/, "-").replace(",", ".") : value;
  if (typeof input === "string" && !/^-?\d+(?:\.\d{1,2})?$/.test(input)) throw new Error("Сумма: не более двух знаков после запятой");
  const result = Number(input);
  if (!Number.isFinite(result) || result === 0 || (!allowNegative && result < 0)) throw new Error("Сумма должна быть конечным числом больше нуля");
  const normalized = round(Math.abs(result));
  if (normalized === 0 || Math.abs(normalized - Math.abs(result)) > 1e-7) throw new Error("Сумма: не более двух знаков после запятой");
  return normalized;
}
function phone(value = "") {
  const result = text(value, "телефон сотрудника", { optional: true, max: 64 });
  if (result && (!/^\+?[\d ().-]+$/.test(result) || result.replace(/\D/g, "").length < 7 || result.replace(/\D/g, "").length > 20))
    throw new Error("Телефон сотрудника: 7–20 цифр, допустимы +, пробелы, скобки и дефисы");
  return result;
}
function unique(rows, label) {
  if (!Array.isArray(rows)) throw new Error("Нет массива: " + label);
  const ids = new Set();
  for (const row of rows) {
    if (!record(row)) throw new Error("Некорректная запись: " + label);
    id(row.id);
    if (ids.has(row.id)) throw new Error("Повтор ID: " + label);
    ids.add(row.id);
  }
  return ids;
}
function archived(value) {
  if (typeof value !== "boolean") throw new Error("Некорректный статус архивной записи");
  return value;
}
const category = (id, name, kind, capital = false) => ({ id, name, kind, capital, archived: false });
export function cashDefaults(now = new Date().toISOString()) {
  timestamp(now);
  return {
    cashSchemaVersion: 1,
    cashStartedAt: now,
    cashAccounts: [
      { id: "cash", name: "Касса", kind: "cash", archived: false },
      { id: "bank", name: "Банк", kind: "bank", archived: false },
    ],
    cashCategories: [
      category("income-sales", "Продажа техники", "income"),
      category("income-repair", "Оплата ремонта", "income"),
      category("income-owner", "Взнос владельца", "income", true),
      category("income-other", "Прочий приход", "income"),
      category("expense-water", "Вода", "expense"),
      category("expense-utilities", "Коммунальные расходы", "expense"),
      category("expense-phone-purchase", "Покупка техники", "expense"),
      category("expense-parts", "Запчасти", "expense"),
      category("expense-materials", "Расходные материалы", "expense"),
      category("expense-salary", "Зарплата", "expense"),
      category("expense-other", "Прочие расходы", "expense"),
    ],
    employees: [], cashTransactions: [], cashEvents: [],
  };
}
export function ensureCashState(state) {
  if (!record(state)) throw new Error("Некорректное рабочее пространство");
  validateCashState(state);
  if (KEYS.every((key) => state[key] === undefined)) return { ...state, ...cashDefaults() };
  return state;
}
const requestOf = (row) => JSON.stringify({
  kind: row.kind, accountId: row.accountId, toAccountId: row.toAccountId ?? null,
  amount: row.amount, categoryId: row.categoryId ?? null, employeeId: row.employeeId ?? null,
  happenedOn: row.happenedOn, reason: row.reason,
});
export function validateCashState(state) {
  const present = KEYS.filter((key) => state?.[key] !== undefined);
  if (!present.length) return state;
  if (present.length !== KEYS.length || state.cashSchemaVersion !== 1) throw new Error("Неполная или неподдерживаемая схема кассы");
  timestamp(state.cashStartedAt);
  const accountIds = unique(state.cashAccounts, "счета"), categoryIds = unique(state.cashCategories, "категории"), employeeIds = unique(state.employees, "сотрудники");
  unique(state.cashTransactions, "операции кассы"); unique(state.cashEvents, "события кассы");
  if (!state.cashAccounts.some((row) => row.id === "cash") || !state.cashAccounts.some((row) => row.id === "bank")) throw new Error("Должны сохраняться касса и банк");
  for (const row of state.cashAccounts) {
    text(row.name, "название счёта", { max: 120 }); archived(row.archived);
    if (!["cash", "bank"].includes(row.kind)) throw new Error("Неизвестный тип счёта");
  }
  for (const row of state.cashCategories) {
    text(row.name, "категория", { max: 120 }); archived(row.archived);
    if (!["income", "expense"].includes(row.kind) || (row.capital !== undefined && typeof row.capital !== "boolean") || (row.capital && row.kind !== "income")) throw new Error("Некорректный тип категории");
  }
  for (const row of state.employees) {
    text(row.name, "имя сотрудника", { max: 120 }); text(row.jobTitle, "должность", { optional: true, max: 120 });
    phone(row.phone ?? ""); archived(row.archived);
  }
  const operations = new Set();
  for (const row of state.cashTransactions) {
    id(row.operationId, "номер операции");
    if (operations.has(row.operationId)) throw new Error("Повтор операции кассы");
    operations.add(row.operationId);
    if (!KINDS.includes(row.kind) || !accountIds.has(row.accountId)) throw new Error("Некорректный счёт или тип операции");
    if (typeof row.amount !== "number" || money(row.amount) !== row.amount) throw new Error("Некорректная сумма операции");
    const signed = row.kind === "income" ? row.amount : row.kind === "expense" ? -row.amount : 0;
    if (row.signedAmount !== signed) throw new Error("Неверный знак операции");
    date(row.happenedOn); timestamp(row.createdAt); text(row.reason, "причина операции");
    if (row.happenedOn > cashToday()) throw new Error("Дата фактической операции не может быть в будущем");
    if (row.kind === "transfer") {
      if (!accountIds.has(row.toAccountId) || row.accountId === row.toAccountId || row.categoryId != null || row.categoryName != null || row.capital) throw new Error("Некорректный перевод между счетами");
    } else {
      if (!categoryIds.has(row.categoryId) || row.categoryKind !== row.kind) throw new Error("Неизвестная категория операции");
      text(row.categoryName, "снимок категории", { max: 120 });
      if (typeof row.capital !== "boolean" || (row.capital && row.kind !== "income")) throw new Error("Некорректный взнос владельца");
      if (row.toAccountId != null) throw new Error("Второй счёт допускается только для перевода");
    }
    if (row.employeeId != null) {
      if (!employeeIds.has(row.employeeId)) throw new Error("Неизвестный сотрудник операции");
      text(row.employeeName, "снимок имени сотрудника", { max: 120 });
      text(row.employeeJobTitle, "снимок должности", { optional: true, max: 120 });
    }
    if (row.voided !== undefined && typeof row.voided !== "boolean") throw new Error("Некорректная отмена операции");
    if (row.voided) { text(row.voidReason, "причина исправления"); timestamp(row.voidedAt); }
  }
  for (const event of state.cashEvents) {
    if (!EVENT_TYPES.includes(event.type)) throw new Error("Неизвестное событие кассы");
    timestamp(event.at);
    if (event.transactionId != null && !state.cashTransactions.some((row) => row.id === event.transactionId)) throw new Error("Событие относится к неизвестной операции");
    if (event.before != null && !record(event.before)) throw new Error("Некорректный снимок до изменения");
    if (event.after != null && !record(event.after)) throw new Error("Некорректный снимок после изменения");
  }
  return state;
}
function event(state, type, before, after, transactionId) {
  const row = { id: uid(), type, at: new Date().toISOString(), before: before ? clone(before) : null, after: after ? clone(after) : null };
  if (transactionId) row.transactionId = transactionId;
  const result = { ...state, cashEvents: [...state.cashEvents, row] };
  validateCashState(result); return result;
}
export function addCashTransaction(state, input, operationId = uid()) {
  const current = ensureCashState(state);
  id(operationId, "номер операции");
  if (!KINDS.includes(input.kind)) throw new Error("Выберите приход, расход или перевод");
  const createdAt = new Date().toISOString(), happenedOn = date(input.happenedOn);
  if (happenedOn > cashToday(createdAt)) throw new Error("Дата операции не может быть в будущем");
  const normalized = {
    kind: input.kind, accountId: input.accountId,
    toAccountId: input.kind === "transfer" ? input.toAccountId : null,
    amount: money(input.amount, input.kind === "expense"),
    categoryId: input.kind === "transfer" ? null : input.categoryId,
    employeeId: input.employeeId || null,
    happenedOn, reason: text(input.reason, "причина операции"),
  };
  const previous = current.cashTransactions.find((row) => row.operationId === operationId);
  if (previous) {
    if (requestOf(previous) !== requestOf(normalized)) throw new Error("Номер операции уже использован для других данных");
    return current;
  }
  const account = current.cashAccounts.find((row) => row.id === normalized.accountId && !row.archived);
  if (!account) throw new Error("Выберите действующий счёт");
  const after = { ...normalized, id: uid(), operationId, createdAt,
    signedAmount: normalized.kind === "income" ? normalized.amount : normalized.kind === "expense" ? -normalized.amount : 0 };
  if (normalized.kind === "transfer") {
    if (normalized.accountId === normalized.toAccountId || !current.cashAccounts.some((row) => row.id === normalized.toAccountId && !row.archived)) throw new Error("Для перевода нужны разные действующие счета");
  } else {
    const category = current.cashCategories.find((row) => row.id === normalized.categoryId && row.kind === normalized.kind && !row.archived);
    if (!category) throw new Error("Выберите действующую категорию для этого типа операции");
    after.categoryName = category.name; after.categoryKind = category.kind; after.capital = category.capital === true;
  }
  if (normalized.employeeId) {
    const employee = current.employees.find((row) => row.id === normalized.employeeId && !row.archived);
    if (!employee) throw new Error("Выберите действующего сотрудника");
    after.employeeName = employee.name; after.employeeJobTitle = employee.jobTitle;
  }
  return event({ ...current, cashTransactions: [...current.cashTransactions, after] }, "cash-created", null, after, after.id);
}
export function voidCashTransaction(state, transactionId, reason) {
  const current = ensureCashState(state), before = current.cashTransactions.find((row) => row.id === transactionId);
  if (!before) throw new Error("Операция не найдена");
  if (before.voided) throw new Error("Операция уже исправлена");
  const after = { ...before, voided: true, voidReason: text(reason, "причина исправления"), voidedAt: new Date().toISOString() };
  return event({ ...current, cashTransactions: current.cashTransactions.map((row) => row.id === transactionId ? after : row) }, "cash-voided", before, after, after.id);
}
export function saveEmployee(state, input) {
  const current = ensureCashState(state), before = input.id ? current.employees.find((row) => row.id === input.id) : null;
  if (input.id && !before) throw new Error("Сотрудник не найден");
  const after = { id: before?.id ?? uid(), name: text(input.name ?? before?.name, "имя сотрудника", { max: 120 }),
    jobTitle: text(input.jobTitle ?? before?.jobTitle ?? "", "должность", { optional: true, max: 120 }), phone: phone(input.phone ?? before?.phone ?? ""), archived: input.archived ?? before?.archived ?? false };
  archived(after.archived);
  return event({ ...current, employees: before ? current.employees.map((row) => row.id === before.id ? after : row) : [...current.employees, after] }, "cash-employee-saved", before, after);
}
export function saveCashCategory(state, input) {
  const current = ensureCashState(state), before = input.id ? current.cashCategories.find((row) => row.id === input.id) : null;
  if (input.id && !before) throw new Error("Категория не найдена");
  const kind = input.kind ?? before?.kind;
  if (!["income", "expense"].includes(kind)) throw new Error("Категория относится к приходу или расходу");
  if (before && before.kind !== kind && current.cashTransactions.some((row) => row.categoryId === before.id)) throw new Error("Тип используемой категории нельзя изменить; создайте другую");
  const after = { id: before?.id ?? uid(), name: text(input.name ?? before?.name, "название категории", { max: 120 }), kind,
    capital: input.capital ?? before?.capital ?? false, archived: input.archived ?? before?.archived ?? false };
  if (typeof after.capital !== "boolean" || (after.capital && after.kind !== "income")) throw new Error("Взнос владельца возможен только для прихода");
  archived(after.archived);
  if (!after.archived && current.cashCategories.some((row) => row.id !== before?.id && !row.archived && row.kind === after.kind && row.name.toLocaleLowerCase("ru-RU") === after.name.toLocaleLowerCase("ru-RU"))) throw new Error("Такая категория уже существует");
  return event({ ...current, cashCategories: before ? current.cashCategories.map((row) => row.id === before.id ? after : row) : [...current.cashCategories, after] }, "cash-category-saved", before, after);
}
function effect(row, accountId) {
  if (row.voided) return 0;
  if (row.kind === "transfer") return accountId ? row.accountId === accountId ? -row.amount : row.toAccountId === accountId ? row.amount : 0 : 0;
  return !accountId || row.accountId === accountId ? row.signedAmount : 0;
}
export function getAccountBalance(state, accountId) {
  const current = ensureCashState(state);
  if (accountId && !current.cashAccounts.some((row) => row.id === accountId)) throw new Error("Счёт не найден");
  return round(current.cashTransactions.reduce((sum, row) => sum + effect(row, accountId), 0));
}
function totals(rows, accountId) {
  let income = 0, expenses = 0, transferIn = 0, transferOut = 0, capitalIn = 0, count = 0;
  for (const row of rows) {
    if (row.voided) continue;
    count++;
    if (row.kind === "income") { income += row.amount; if (row.capital) capitalIn += row.amount; }
    else if (row.kind === "expense") expenses += row.amount;
    else {
      if (!accountId || row.toAccountId === accountId) transferIn += row.amount;
      if (!accountId || row.accountId === accountId) transferOut += row.amount;
    }
  }
  return { income: round(income), expenses: round(expenses), transferIn: round(transferIn), transferOut: round(transferOut),
    net: round(income - expenses + transferIn - transferOut), capitalIn: round(capitalIn), operatingIncome: round(income - capitalIn), count, voidCount: rows.filter((row) => row.voided).length };
}
function groupKey(day, group) {
  if (group === "month") return day.slice(0, 7);
  if (group === "day") return day;
  const result = new Date(day + "T12:00:00Z");
  result.setUTCDate(result.getUTCDate() - (result.getUTCDay() + 6) % 7);
  return result.toISOString().slice(0, 10);
}
export function cashReport(state, { from = "", to = "", group = "day", accountId = "" } = {}) {
  const current = ensureCashState(state);
  if (from) date(from); if (to) date(to);
  if (from && to && from > to) throw new Error("Начало периода позже окончания");
  if (!["day", "week", "month"].includes(group)) throw new Error("Неизвестная группировка кассы");
  if (accountId && !current.cashAccounts.some((row) => row.id === accountId)) throw new Error("Счёт не найден");
  const relevant = current.cashTransactions.filter((row) => !accountId || row.accountId === accountId || row.toAccountId === accountId);
  const transactions = relevant.filter((row) => (!from || row.happenedOn >= from) && (!to || row.happenedOn <= to));
  const groups = new Map();
  for (const row of transactions) {
    const key = groupKey(row.happenedOn, group);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const label = (key) => group === "month" ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(key + "-01T12:00:00Z")) : group === "week" ? "Неделя с " + key.split("-").reverse().join(".") : key.split("-").reverse().join(".");
  return {
    accounts: current.cashAccounts.map((row) => ({ ...row, balance: getAccountBalance(current, row.id) })),
    transactions: [...transactions].sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt)),
    groups: [...groups].map(([key, rows]) => ({ key, label: label(key), ...totals(rows, accountId) })).sort((a, b) => b.key.localeCompare(a.key)),
    ...totals(transactions, accountId), balance: getAccountBalance(current, accountId),
    openingBalance: from ? round(relevant.filter((row) => row.happenedOn < from).reduce((sum, row) => sum + effect(row, accountId), 0)) : 0,
    closingBalance: round(relevant.filter((row) => !to || row.happenedOn <= to).reduce((sum, row) => sum + effect(row, accountId), 0)),
  };
}
