import { unzipSync, strFromU8 } from "fflate";
import { amount } from "./valuation.js";

const normalize = (s) =>
  String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function tableAmount(value) {
  const s = normalize(value).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s))
    throw new Error("Не распознана сумма: " + value);
  return Math.round(amount(s) * 1000);
}
export function tableRange(value) {
  const parts = normalize(value).split(/[–—−-]/);
  if (parts.length > 2) throw new Error("Не распознан диапазон");
  const min = tableAmount(parts[0]),
    max = parts.length === 2 ? tableAmount(parts[1]) : min;
  if (max < min) throw new Error("Обратный диапазон");
  return [min, max];
}
export function parseGuideTables(tables, sourceName, documentDate) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(documentDate) ||
    !Number.isFinite(Date.parse(documentDate))
  )
    throw new Error("Укажите дату редакции прайса");
  const entries = [],
    skipped = [];
  let rowNumber = 0;
  for (const table of tables) {
    if (!table.length) continue;
    const header = table[0].map(normalize);
    if (
      header.length !== 7 ||
      !header[0].includes("Модель") ||
      !header[2].includes("Скупка") ||
      !header[3].includes("Витрина")
    )
      continue;
    for (const cells of table.slice(1)) {
      rowNumber++;
      try {
        if (cells.length !== 7) throw new Error("Нужно 7 колонок");
        let [model, memory, buy, price, sale, quick] = cells.map(normalize);
        model = model.replace(/\*/g, "").trim();
        const iphone =
          /^(?:11|12|13|14|15|16|17)(?: mini| Plus| Pro| Pro Max)?$/.test(
            model,
          ) || model === "Air";
        if (iphone) model = "iPhone " + model;
        else if (model.startsWith("Galaxy ")) model = "Samsung " + model;
        else if (model.startsWith("Spark Go")) model = "TECNO " + model;
        model = model.replace("Redmi 10 (2022)", "Redmi 10 2022");
        let storage,
          ram = null;
        if (iphone) {
          storage = /ТБ/.test(memory)
            ? Number(memory.replace(/\s*ТБ/, "")) * 1024
            : Number(memory);
        } else {
          const pair = memory.split("/");
          if (pair.length !== 2)
            throw new Error("Не распознаны физическая ОЗУ/память");
          ram = /^\d+$/.test(pair[0]) ? Number(pair[0]) : null;
          storage = Number(pair[1]);
        }
        if (!Number.isInteger(storage) || storage <= 0)
          throw new Error("Неверная память");
        const [buyMin, buyMax] = tableRange(buy),
          [saleMin, saleMax] = tableRange(sale),
          [quickMin, quickMax] = tableRange(quick);
        entries.push({
          id: "guide-" + rowNumber,
          model,
          storage,
          ram,
          sim: model === "iPhone Air" ? "esim" : "physical",
          market: "Астана",
          currency: "KZT",
          channel: "store-cash",
          price: tableAmount(price),
          buyMin,
          buyMax,
          saleMin,
          saleMax,
          quickMin,
          quickMax,
          source: "owner-guide",
          sourceName,
          checkedAt: documentDate,
          author: "Прайс владельца из переписки",
          base: {
            screen: "good",
            body: "good",
            box: iphone ? true : null,
            battery: iphone
              ? model.includes("17") || model === "iPhone Air"
                ? 95
                : 85
              : null,
          },
          note: "Справочная сетка из переписки, не рыночные сделки. Хорошее состояние, исправность; детали и комплектацию проверить.",
          needsConfiguration:
            !iphone &&
            (ram == null ||
              model === "Samsung Galaxy A17" ||
              model === "Samsung Galaxy A23" ||
              model === "ZTE Blade A76"),
        });
      } catch (e) {
        skipped.push({ row: rowNumber, message: e.message });
      }
    }
  }
  if (!entries.length)
    throw new Error(
      "Не найдены основные таблицы прайса (Модель / Память / Скупка / Витрина / После торга / Быстро / Рассрочка)",
    );
  return {
    format: "nomad-owner-guide",
    version: 1,
    documentDate,
    sourceName,
    entries,
    skipped,
  };
}
export function readDocxGuide(buffer, sourceName, documentDate) {
  if (buffer.byteLength > 5e6) throw new Error("DOCX больше 5 МБ");
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      if (f.name !== "word/document.xml") return false;
      if (f.originalSize > 2e6) throw new Error("Таблица слишком большая");
      return true;
    },
  });
  if (!files["word/document.xml"])
    throw new Error("Нет word/document.xml: выберите DOCX");
  const xml = strFromU8(files["word/document.xml"]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Внешние XML-сущности не поддерживаются");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Повреждённый XML документа");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const tables = Array.from(doc.getElementsByTagNameNS(ns, "tbl"), (table) =>
    Array.from(table.getElementsByTagNameNS(ns, "tr"), (row) =>
      Array.from(row.getElementsByTagNameNS(ns, "tc"), (cell) =>
        Array.from(
          cell.getElementsByTagNameNS(ns, "t"),
          (node) => node.textContent,
        ).join(""),
      ),
    ),
  );
  return parseGuideTables(tables, sourceName, documentDate);
}
export function previewGuide(guide, catalog) {
  if (
    guide?.format !== "nomad-owner-guide" ||
    guide.version !== 1 ||
    !Array.isArray(guide.entries) ||
    guide.entries.length > 10000
  )
    throw new Error("Неподдерживаемый формат справочника");
  const valid = [],
    pending = [...(guide.skipped ?? [])],
    seen = new Set();
  for (const entry of guide.entries) {
    const model = catalog.find((m) => m.name === entry.model);
    const matches = model?.configs.some(
      (c) =>
        c.storage === entry.storage && (c.ram ?? null) === (entry.ram ?? null),
    );
    if (entry.needsConfiguration || !matches) {
      pending.push({
        model: entry.model,
        storage: entry.storage,
        ram: entry.ram,
        message:
          "Уточните модификацию/физическую ОЗУ и добавьте подтверждённую конфигурацию в настройки",
      });
      continue;
    }
    const key = [entry.model, entry.storage, entry.ram, entry.sim].join("|");
    if (seen.has(key)) {
      pending.push({
        model: entry.model,
        message: "Повтор конфигурации в файле пропущен",
      });
      continue;
    }
    seen.add(key);
    valid.push({
      ...entry,
      sourceName: entry.sourceName || guide.sourceName,
      checkedAt: entry.checkedAt || guide.documentDate,
      market: "Астана",
      currency: "KZT",
      channel: "store-cash",
      source: "owner-guide",
    });
  }
  return {
    valid,
    pending,
    sourceName: guide.sourceName,
    documentDate: guide.documentDate,
  };
}
