import { workbookReference } from "../data/workbook-reference.js";

const normalize = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
const memoryKey = (storage, ram) => `${Number(storage)}|${ram == null || ram === "" ? "" : Number(ram)}`;
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const modelsById = new Map(workbookReference.models.map((model) => [model.id, model]));
const modelsByName = new Map(workbookReference.models.map((model) => [normalize(model.name), model]));
const variantsByModel = new Map();
for (const row of workbookReference.variants) {
  if (!variantsByModel.has(row.modelId)) variantsByModel.set(row.modelId, []);
  variantsByModel.get(row.modelId).push(row);
}

function appleBiometric(name) {
  if (!/^iphone\s/i.test(name)) return "unknown";
  if (/^iphone\s+(?:se\b|5s\b|[678])/i.test(name)) return "fingerprint";
  if (/^iphone\s+(?:4|5(?:c)?\b)/i.test(name)) return "none";
  return "faceid";
}

/** The workbook is a reference catalogue, never an official specification claim. */
export function workbookModels() {
  return workbookReference.models.map((model) => ({
    name: model.name,
    brand: model.brand,
    deviceType: "phone",
    connectivity: "phone",
    biometric: model.brand === "Apple" ? appleBiometric(model.name) : "unknown",
    ...(model.name === "iPhone Air" ? { simModes: ["esim"] } : {}),
    configs: (variantsByModel.get(model.id) ?? [])
      .filter((row) => number(row.storage) && row.storage > 0 && (row.ram == null || (number(row.ram) && row.ram > 0)))
      .map((row) => ({ storage: row.storage, ram: row.ram, referenceOnly: true })),
    source: model.source || "Таблица владельца: характеристики требуют сверки на устройстве",
    verified: false,
    workbookModelId: model.id,
    hasWorkbookReference: true,
    configStatus: model.configStatus,
    ...(model.manualDiagnosis ? { manualDiagnosis: true } : {}),
  }));
}

/** Read only the saved cached result for this exact row; do not rerun Excel formulas. */
export function findWorkbookPrice(input, catalogModel) {
  if (!input?.model || input.storage === "" || input.storage == null || input.sim === "wifi") return undefined;
  const linked = catalogModel?.workbookModelId && modelsById.get(catalogModel.workbookModelId);
  const model = linked && normalize(linked.name) === normalize(input.model) ? linked : modelsByName.get(normalize(input.model));
  if (!model) return undefined;
  const key = memoryKey(input.storage, input.ram);
  const row = (variantsByModel.get(model.id) ?? []).find((variant) => memoryKey(variant.storage, variant.ram) === key);
  if (!row || ![row.store, row.usedReference, row.usedMax, row.quick].every(number)) return undefined;
  const hasBuyRange = number(row.buyMin) && number(row.buyMax) && row.buyMin <= row.buyMax;
  return {
    id: `workbook:${workbookReference.id}:${row.id}`,
    source: "workbook-reference",
    sourceName: workbookReference.name,
    author: "Таблица владельца · предварительный расчёт",
    model: input.model,
    storage: row.storage,
    ram: row.ram,
    sim: input.sim ?? "physical",
    market: "Астана",
    currency: "KZT",
    channel: "store-cash",
    price: row.store,
    saleMin: row.usedReference,
    saleMax: row.usedMax,
    quickMin: row.quick,
    quickMax: row.quick,
    buyMin: hasBuyRange ? row.buyMin : null,
    buyMax: hasBuyRange ? row.buyMax : null,
    checkedAt: null,
    calculatedAt: row.calculatedOn || workbookReference.calculatedOn,
    base: { screen: "good", body: "good", box: true, battery: 85 },
    note: `${row.priceStatus}. ${row.note}`,
    workbook: {
      id: workbookReference.id,
      variantId: row.id,
      modelId: row.modelId,
      calculatedOn: row.calculatedOn || workbookReference.calculatedOn,
      specCheckedOn: row.specCheckedOn,
      priceCheckedOn: row.checkedOn,
      priceStatus: row.priceStatus,
      memoryStatus: row.memoryStatus,
      baseCondition: model.baseCondition,
      manualDiagnosis: Boolean(row.manualDiagnosis),
      diagnosisNote: row.diagnosisNote,
      specificationUrl: row.source,
      olxSearchUrl: row.olxSearchUrl,
      usedMin: row.usedMin,
      usedReference: row.usedReference,
      usedMax: row.usedMax,
      installmentFromSheet: row.installment,
      hasBuyRange,
      simStatus: "Вариант SIM в таблице не подтверждён",
      quality: "unverified-editorial-estimate",
      formulaHandling: "cached-values-only",
    },
  };
}

export function workbookSummary() {
  return { ...workbookReference.counts, id: workbookReference.id,
    name: workbookReference.name, calculatedOn: workbookReference.calculatedOn };
}

