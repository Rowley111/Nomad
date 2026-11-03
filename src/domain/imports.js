import { amount, priceKey } from "./valuation.js";
import { validateState, uid } from "./storage.js";
export const columns = [
  "model",
  "storage",
  "ram",
  "sim",
  "market",
  "currency",
  "channel",
  "price",
  "source",
  "checkedAt",
  "author",
  "screen",
  "body",
  "box",
  "battery",
  "note",
  "buyMin",
  "buyMax",
  "saleMin",
  "saleMax",
  "quickMin",
  "quickMax",
  "sourceName",
];
export function validatePrice(row, catalog) {
  const x = structuredClone(row);
  if (
    !catalog.some(
      (m) =>
        m.name === x.model &&
        m.configs.some(
          (c) =>
            Number(c.storage) === Number(x.storage) &&
            String(c.ram ?? "") === String(x.ram ?? ""),
        ),
    )
  )
    throw new Error("Модель/конфигурация отсутствует в каталоге");
  x.storage = amount(x.storage);
  x.ram = x.ram === "" || x.ram == null ? null : amount(x.ram);
  x.price = amount(x.price, "Цена");
  if (
    x.market !== "Астана" ||
    x.currency !== "KZT" ||
    x.channel !== "store-cash"
  )
    throw new Error("Поддерживается Астана / KZT / store-cash");
  const guide = x.source === "owner-guide";
  if (x.source !== "owner" && !guide)
    throw new Error(
      "Поддерживаются прайс владельца (owner) и справочник (owner-guide)",
    );
  if (!["physical", "esim", "other"].includes(x.sim))
    throw new Error("Некорректный вариант SIM");
  if (!x.author?.trim() || !x.note?.trim())
    throw new Error("Нужны автор и пояснение");
  if (
    !/^\d{4}-\d{2}-\d{2}/.test(x.checkedAt) ||
    !Number.isFinite(Date.parse(x.checkedAt)) ||
    Date.parse(x.checkedAt) > Date.now() + 86400000
  )
    throw new Error("Некорректная дата проверки");
  const b = x.base ?? {
    screen: x.screen,
    body: x.body,
    box:
      guide && (x.box === "" || x.box == null)
        ? null
        : x.box === true || x.box === "true",
    battery: x.battery === "" || x.battery == null ? null : Number(x.battery),
  };
  if (
    !["ideal", "good", "worn"].includes(b.screen) ||
    !["ideal", "good", "worn"].includes(b.body) ||
    (typeof b.box !== "boolean" && !(guide && b.box == null))
  )
    throw new Error("Некорректное базовое состояние");
  if (b.battery != null && amount(b.battery) > 100)
    throw new Error("АКБ вне диапазона");
  if (guide) {
    for (const key of [
      "buyMin",
      "buyMax",
      "saleMin",
      "saleMax",
      "quickMin",
      "quickMax",
    ])
      x[key] = amount(x[key], key);
    if (x.buyMin > x.buyMax || x.saleMin > x.saleMax || x.quickMin > x.quickMax)
      throw new Error("Обратный диапазон справочника");
    if (!x.sourceName?.trim()) throw new Error("Укажите документ-источник");
  }
  x.base = b;
  return x;
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ";" || c === ",")) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Незакрытые кавычки CSV");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length)
    throw new Error("Некорректный заголовок");
  return rows.map((r, i) => {
    if (r.length !== header.length)
      throw new Error("Строка " + (i + 2) + ": число колонок");
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}
export function previewPrices(text, format, catalog) {
  const rows = format === "json" ? JSON.parse(text) : parseCSV(text);
  if (!Array.isArray(rows) || rows.length > 10000)
    throw new Error("Нужен массив до 10000 строк");
  const valid = [],
    errors = [];
  rows.forEach((x, i) => {
    try {
      valid.push(validatePrice(x, catalog));
    } catch (e) {
      errors.push({ row: i + 1, message: e.message });
    }
  });
  return { valid, errors };
}
export function mergePrices(state, rows) {
  const prices = [...state.prices],
    history = [...state.priceHistory];
  for (const raw of rows) {
    const x = validatePrice(raw, state.catalog);
    const idx = prices.findIndex((p) => priceKey(p) === priceKey(x));
    const old = idx < 0 ? null : prices[idx];
    if (
      old &&
      JSON.stringify({ ...old, id: undefined }) ===
        JSON.stringify({ ...x, id: undefined })
    )
      continue;
    const next = { ...x, id: old?.id ?? uid() };
    history.push({
      id: uid(),
      at: new Date().toISOString(),
      author: x.author,
      before: old,
      after: next,
    });
    if (idx < 0) prices.push(next);
    else prices[idx] = next;
  }
  return { ...state, prices, priceHistory: history };
}
export function safeCell(v) {
  // Calculated numeric amounts, including losses, remain numbers in Excel.
  if (typeof v === "number" && Number.isFinite(v)) return '"' + String(v) + '"';
  const s = String(v ?? "");
  return (
    '"' +
    (/^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') +
    '"'
  );
}
export function pricesCSV(rows) {
  return (
    "\uFEFF" +
    columns.join(";") +
    "\n" +
    rows
      .map((x) =>
        columns
          .map((k) => safeCell(k in (x.base ?? {}) ? x.base[k] : x[k]))
          .join(";"),
      )
      .join("\n")
  );
}
export function previewBackup(text) {
  const state = validateState(JSON.parse(text));
  state.prices = state.prices.map((x) => validatePrice(x, state.catalog));
  return state;
}
