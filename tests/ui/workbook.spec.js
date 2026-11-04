import { test, expect } from "@playwright/test";
import { emptyState } from "../../src/domain/storage.js";
import { findWorkbookPrice } from "../../src/domain/workbook.js";

const KEY = "nomad-workspace-v2";
async function seed(page, ownerPrice = false) {
  const state = emptyState();
  if (ownerPrice) state.prices.push({
    id: "owner-a35-before-workbook", source: "owner", model: "Samsung Galaxy A35 5G", storage: 128, ram: 8,
    sim: "physical", market: "Астана", currency: "KZT", channel: "store-cash", price: 89000,
    checkedAt: new Date().toISOString().slice(0, 10), author: "Владелец",
    base: { screen: "good", body: "good", box: true, battery: null }, note: "Согласованный ориентир, следы от чехла уже включены",
  });
  await page.addInitScript(({ state, key }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { state, key: KEY });
  await page.goto("/");
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

test("пустой оценщик ждёт выбора, фильтр не выбирает A35 и Excel даёт подписанный ориентир", async ({ page }) => {
  await seed(page);
  await expect(page.getByLabel("Поиск модели", { exact: true })).toHaveValue("");
  await expect(page.locator(".result")).toContainText("Выберите устройство из подсказок");
  await expect(page.getByRole("button", { name: "Оформить закупку", exact: true })).toHaveCount(0);
  await page.getByLabel("Бренды в подсказках", { exact: true }).selectOption("Samsung");
  await expect(page.getByLabel("Поиск модели", { exact: true })).toHaveValue("");
  await page.getByLabel("Поиск модели", { exact: true }).fill("Samsung Galaxy A35 5G");
  await page.getByLabel("Конфигурация (физическая память)", { exact: true }).selectOption("128|8");
  await expect(page.locator(".workbook-basis")).toContainText("Черновой ориентир из Excel — рынок не проверен");
  await expect(page.locator(".workbook-basis")).toContainText("нет подтверждённой даты");
  await expect(page.locator(".offer-hero")).toContainText(/39\s*000.*52\s*000/);
  await expect(page.locator(".resultline").filter({ hasText: "Максимальный закуп" })).toContainText("Нет данных");
  expect((await stored(page)).inventory).toHaveLength(0);
  expect((await stored(page)).prices).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("собственный прайс A35 имеет приоритет, Excel можно выбрать явно и сохранить только снимок", async ({ page }) => {
  await seed(page, true);
  await page.getByLabel("Поиск модели", { exact: true }).fill("Samsung Galaxy A35 5G");
  await expect(page.getByText("111 250 ₸", { exact: true })).toBeVisible();
  await expect(page.locator(".workbook-basis")).toHaveCount(0);
  const workbook = findWorkbookPrice({ model: "Samsung Galaxy A35 5G", storage: 128, ram: 8, sim: "physical" });
  await page.getByLabel("Базовое состояние прайса", { exact: true }).selectOption(workbook.id);
  await expect(page.locator(".workbook-basis")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить оценку", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Оценка сохранена");
  const state = await stored(page);
  expect(state.prices).toHaveLength(1);
  expect(state.prices[0].price).toBe(89000);
  expect(state.assessments.at(-1).price.source).toBe("workbook-reference");
  expect(state.assessments.at(-1).price.checkedAt).toBeNull();
  expect(state.assessments.at(-1).price.workbook.calculatedOn).toBe("2026-11-04");
  expect(state.inventory).toHaveLength(0);
  await page.reload();
  await expect(page.getByLabel("Поиск модели", { exact: true })).toHaveValue("");
  await page.getByLabel("Поиск модели", { exact: true }).fill("Samsung Galaxy A35 5G");
  await expect(page.getByText("111 250 ₸", { exact: true })).toBeVisible();
});

test("пустые цены Excel не становятся нулём, складной аппарат не получает выдуманную скупку", async ({ page }) => {
  await seed(page);
  await page.getByLabel("Поиск модели", { exact: true }).fill("BlackBerry Bold 9900");
  await expect(page.getByLabel("Конфигурация (физическая память)", { exact: true })).toHaveValue("8|0.75");
  await expect(page.locator(".result")).toContainText("Нет данных для этой конфигурации");
  await expect(page.getByRole("button", { name: "Оформить закупку", exact: true })).toHaveCount(0);
  await page.getByLabel("Поиск модели", { exact: true }).fill("Samsung Galaxy Z Fold4");
  await page.getByLabel("Конфигурация (физическая память)", { exact: true }).selectOption("256|12");
  await expect(page.locator(".result")).toContainText("В таблице нет диапазона скупки");
  await expect(page.getByRole("button", { name: "Скопировать предложение клиенту", exact: true })).toBeDisabled();
  await expect(page.locator(".resultline").filter({ hasText: "Максимальный закуп" })).toContainText("Нет данных");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
