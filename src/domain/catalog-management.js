import { catalogDefaults } from "./catalog.js";

export const CATALOG_REVISION = 2;
const clone = (x) => structuredClone(x);
const normalize = (x) => String(x ?? "").trim().replace(/\s+/g, " ");
const configKey = (x) => Number(x.storage) + "|" + (x.ram == null || x.ram === "" ? "" : Number(x.ram));

export function validateCatalog(catalog, prices = []) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error("Нужен непустой каталог моделей");
  const names = new Set();
  for (const model of catalog) {
    if (!model || typeof model.name !== "string" || !model.name.trim() ||
        typeof model.brand !== "string" || !model.brand.trim() || !Array.isArray(model.configs))
      throw new Error("Модели нужны название, бренд и список конфигураций");
    const key = normalize(model.name).toLocaleLowerCase("ru-RU");
    if (names.has(key)) throw new Error("Модель с таким названием уже существует");
    names.add(key);
    if (model.deviceType !== undefined && !["phone", "tablet"].includes(model.deviceType))
      throw new Error("Неизвестный тип устройства");
    if (model.connectivity !== undefined && !["phone", "wifi", "cellular"].includes(model.connectivity))
      throw new Error("Неизвестный вариант связи");
    if (model.connectivity === "wifi" && model.deviceType !== "tablet")
      throw new Error("Вариант без SIM предназначен для планшета Wi-Fi");
    if (model.biometric !== undefined && !["faceid", "fingerprint", "none", "unknown"].includes(model.biometric))
      throw new Error("Некорректный тип биометрии");
    if (model.simModes !== undefined && (!Array.isArray(model.simModes) || !model.simModes.length ||
        model.simModes.some((x) => !["physical", "esim", "other", "wifi"].includes(x))))
      throw new Error("Некорректные варианты SIM");
    const configs = new Set();
    for (const config of model.configs) {
      const positiveInteger = (value) => ["number", "string"].includes(typeof value) &&
        Number.isSafeInteger(Number(value)) && Number(value) > 0;
      const positiveRam = (value) => ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) > 0;
      if (!positiveInteger(config.storage) || (config.ram != null && !positiveRam(config.ram)))
        throw new Error("Накопитель — положительное целое число, физическая ОЗУ — положительное число без виртуального расширения");
      if (configs.has(configKey(config))) throw new Error("Повтор конфигурации памяти");
      configs.add(configKey(config));
    }
  }
  for (const price of prices) {
    const model = catalog.find((row) => row.name === price.model);
    if (!model || !model.configs.some((row) => configKey(row) === configKey(price)))
      throw new Error("Нельзя удалить модель или конфигурацию, используемую прайсом");
    if ((model.connectivity === "wifi") !== (price.sim === "wifi") ||
        (model.simModes && !model.simModes.includes(price.sim ?? "physical")))
      throw new Error("Вариант связи используется прайсом. Создайте отдельную модель Wi-Fi/Cellular вместо изменения");
  }
  return catalog;
}

export function saveCatalogModel(state, originalName, form) {
  const name = normalize(form.name), brand = normalize(form.brand);
  if (!name || !brand || name.length > 160 || brand.length > 80)
    throw new Error("Укажите название модели и бренд");
  const previous = originalName == null ? null : state.catalog.find((x) => x.name === originalName);
  if (originalName != null && !previous) throw new Error("Модель изменена. Откройте её заново");
  if (previous && previous.name !== name && (
    state.prices.some((x) => x.model === previous.name) ||
    state.inventory.some((x) => x.model === previous.name) ||
    state.assessments.some((x) => x.input.model === previous.name)))
    throw new Error("Модель используется в данных. Создайте новую модель вместо переименования истории");
  const deviceType = form.deviceType ?? "phone";
  const connectivity = deviceType === "phone" ? "phone" : form.connectivity ?? "wifi";
  const configs = (form.configs ?? []).filter((row) => !((row.storage == null || row.storage === "") && (row.ram == null || row.ram === ""))).map((row) => {
    if (row.storage === "" || row.storage == null) throw new Error("Укажите встроенную память");
    const ram = brand.toLowerCase() === "apple" ? null : row.ram === "" || row.ram == null ? null : Number(row.ram);
    if (brand.toLowerCase() !== "apple" && ram == null)
      throw new Error("Укажите физическую ОЗУ Android, без виртуального расширения");
    return { storage: Number(row.storage), ram };
  });
  const saved = { ...previous, name, brand, deviceType, connectivity,
    biometric: form.biometric ?? "unknown", configs,
    source: normalize(form.source) || "Конфигурация подтверждена владельцем",
    verified: false, userConfirmed: true };
  // Changing connectivity invalidates old manufacturer SIM restrictions.
  saved.simModes = connectivity === "wifi" ? ["wifi"] :
    connectivity === previous?.connectivity && previous?.simModes ? clone(previous.simModes) : ["physical", "esim", "other"];
  const catalog = previous ? state.catalog.map((x) => x.name === originalName ? saved : x) : [...state.catalog, saved];
  validateCatalog(catalog, state.prices);
  return { ...state, catalog };
}

export function extendCatalog(existing, defaults = catalogDefaults) {
  const catalog = clone(existing);
  const byName = new Map(catalog.map((x) => [x.name.toLocaleLowerCase("ru-RU"), x]));
  for (const addition of defaults) {
    const key = addition.name.toLocaleLowerCase("ru-RU");
    const model = byName.get(key);
    if (!model) {
      const row = clone(addition); catalog.push(row); byName.set(key, row); continue;
    }
    for (const config of addition.configs)
      if (!model.configs.some((row) => configKey(row) === configKey(config))) model.configs.push(clone(config));
    for (const key of ["deviceType", "connectivity", "biometric", "simModes", "workbookModelId", "hasWorkbookReference", "configStatus"])
      if (model[key] === undefined && addition[key] !== undefined) model[key] = clone(addition[key]);
  }
  validateCatalog(catalog);
  return catalog;
}

export function upgradeCatalog(state) {
  if ((state.catalogRevision ?? 0) >= CATALOG_REVISION) return state;
  return { ...state, catalogRevision: CATALOG_REVISION, catalog: extendCatalog(state.catalog) };
}
