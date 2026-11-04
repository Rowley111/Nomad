import { test, expect } from "@playwright/test";
import { emptyState } from "../../src/domain/storage.js";

const KEY = "nomad-workspace-v2";
async function seed(page) {
  const state = emptyState();
  state.inventory.push({
    id: "catalog-existing-stock", model: "Samsung Galaxy A35 5G",
    storage: 128, ram: 8, buy: 50000, sell: 89000, status: "В наличии",
    legacy: true, sale: null, note: "Склад до расширения каталога",
  });
  await page.addInitScript(({ state, key }) => {
    if (localStorage.getItem(key) === null)
      localStorage.setItem(key, JSON.stringify(state));
  }, { state, key: KEY });
  await page.goto("/");
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function openConstructor(page) {
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Добавить модель", exact: true }).click();
}
async function fillModel(page, { name, brand, deviceType = "phone", connectivity = "phone", biometric = "fingerprint", storage = "128", ram = "8" }) {
  await page.getByLabel("Марка/бренд", { exact: true }).fill(brand);
  await page.getByLabel("Название модели", { exact: true }).fill(name);
  await page.getByLabel("Тип устройства", { exact: true }).selectOption(deviceType);
  await page.getByLabel("Подключение", { exact: true }).selectOption(connectivity);
  await page.getByLabel("Биометрия", { exact: true }).selectOption(biometric);
  await page.getByLabel("Источник конфигураций", { exact: true }).fill("Синтетическая конфигурация для UI-проверки; не рыночные данные");
  await page.getByLabel("Встроенная память, ГБ", { exact: true }).first().fill(storage);
  await page.getByLabel("Физическая ОЗУ, ГБ", { exact: true }).first().fill(ram);
}
async function saveModel(page, name) {
  await page.getByRole("button", { name: "Сохранить модель", exact: true }).click();
  await expect.poll(async () => (await stored(page)).catalog.some((model) => model.name === name)).toBe(true);
}

test("своя модель получает оценку только после сохранения её прайса, прежний склад сохраняется", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const name = "OPPO Nomad Test 5G";
  await openConstructor(page);
  await fillModel(page, { name, brand: "OPPO" });
  await saveModel(page, name);
  let state = await stored(page);
  expect(state.inventory[0].buy).toBe(50000);
  expect(state.catalog.find((model) => model.name === name).configs).toEqual([{ storage: 128, ram: 8 }]);
  expect(state.prices.filter((price) => price.model === name)).toHaveLength(0);

  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await page.getByLabel("Поиск модели", { exact: true }).fill(name);
  await expect(page.getByText(/Нет данных для этой конфигурации/)).toBeVisible();
  await expect(page.getByLabel("Конфигурация (физическая память)", { exact: true })).toHaveValue("128|8");

  await page.getByRole("button", { name: "Прайс и источники", exact: true }).click();
  await page.getByLabel("Модель", { exact: true }).selectOption(name);
  await page.getByLabel("Цена витрины, ₸", { exact: true }).fill("75000");
  await page.getByLabel("Автор изменения", { exact: true }).fill("UI-проверка");
  await page.getByLabel("Пояснение (включая комплект и износ)", { exact: true }).fill("Только тестовый ориентир; коробка, хорошее состояние");
  await page.getByRole("button", { name: "Сохранить прайс", exact: true }).click();
  await expect.poll(async () => (await stored(page)).prices.filter((price) => price.model === name).length).toBe(1);

  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await page.getByLabel("Поиск модели", { exact: true }).fill(name);
  await expect(page.getByText("93 750 ₸", { exact: true })).toBeVisible();
  await page.getByText("Комплект, диагностика и расходы", { exact: true }).click();
  await page.getByLabel("Цена продавца, ₸ (необязательно)", { exact: true }).fill("40000");
  await expect(page.getByText("35 000 ₸", { exact: true })).toBeVisible();
  await page.reload();
  state = await stored(page);
  expect(state.catalog.filter((model) => model.name === name)).toHaveLength(1);
  expect(state.prices.filter((price) => price.model === name)).toHaveLength(1);
  expect(state.inventory).toHaveLength(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("конструктор сохраняет Wi-Fi планшет, позволяет добавить конфигурацию и не дублирует модель", async ({ page }) => {
  await seed(page);
  const name = "Nomad Test Tab Wi-Fi";
  await openConstructor(page);
  await fillModel(page, { name, brand: "Lenovo", deviceType: "tablet", connectivity: "wifi", storage: "128", ram: "6" });
  await saveModel(page, name);
  let model = (await stored(page)).catalog.find((row) => row.name === name);
  expect(model.deviceType).toBe("tablet");
  expect(model.connectivity).toBe("wifi");
  expect(model.biometric).toBe("fingerprint");
  await page.getByLabel("Поиск в каталоге", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Редактировать модель " + name, exact: true }).click();
  await page.getByRole("button", { name: "Добавить конфигурацию", exact: true }).click();
  await page.getByLabel("Встроенная память, ГБ", { exact: true }).nth(1).fill("256");
  await page.getByLabel("Физическая ОЗУ, ГБ", { exact: true }).nth(1).fill("8");
  await page.getByRole("button", { name: "Сохранить модель", exact: true }).click();
  await expect.poll(async () => (await stored(page)).catalog.find((row) => row.name === name).configs.length).toBe(2);
  await page.reload();
  const state = await stored(page);
  model = state.catalog.find((row) => row.name === name);
  expect(state.catalog.filter((row) => row.name === name)).toHaveLength(1);
  expect(model.configs).toEqual([{ storage: 128, ram: 6 }, { storage: 256, ram: 8 }]);
  expect(state.inventory[0].note).toBe("Склад до расширения каталога");
  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await page.getByLabel("Поиск модели", { exact: true }).fill(name);
  await expect(page.getByLabel("Конфигурация (физическая память)", { exact: true })).toHaveValue("128|6");
  await page.getByLabel("Конфигурация (физическая память)", { exact: true }).selectOption("256|8");
  await page.getByLabel("Поиск модели", { exact: true }).fill("Samsung Galaxy A35 5G");
  await expect(page.getByLabel("Конфигурация (физическая память)", { exact: true })).toHaveValue("128|8");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
