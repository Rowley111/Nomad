import { test, expect } from "@playwright/test";
import { emptyState } from "../../src/domain/storage.js";

const KEY = "nomad-workspace-v2";
async function start(page) {
  const state = emptyState();
  state.policy.guideIphoneDiscount = 30000;
  await page.addInitScript(({ state, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { state, key: KEY });
  await page.goto("/");
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function ownPrice(page, model) {
  await page.getByRole("button", { name: "Прайс и источники", exact: true }).click();
  await page.getByLabel("Модель скупочного прайса", { exact: true }).fill(model);
  await page.getByLabel("Скупка от, ₸", { exact: true }).fill("40000");
  await page.getByLabel("Продажа от, ₸", { exact: true }).fill("75000");
  await page.getByLabel("Автор скупочного прайса", { exact: true }).fill("Владелец · тест");
  await page.getByRole("button", { name: "Сохранить мои цены", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Скупочный прайс сохранён");
}
test("свои цены iPhone автоматически оцениваются без снижения DOCX и редактируются с историей", async ({ page }) => {
  await start(page);
  await ownPrice(page, "iPhone 13");
  const saved = (await stored(page)).prices[0];
  expect(saved.buyMin).toBe(40000);
  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await page.getByLabel("Поиск модели", { exact: true }).fill("iPhone 13");
  await expect(page.locator(".offer-hero")).toContainText(/40\s*000/);
  await expect(page.locator(".offer-hero")).toContainText("Средний ориентир скупки");
  await page.getByRole("button", { name: "Сохранить оценку", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Оценка сохранена");
  await page.getByRole("button", { name: "Прайс и источники", exact: true }).click();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(page.getByLabel("Модель скупочного прайса", { exact: true })).toHaveValue("iPhone 13");
  await page.getByLabel("Скупка от, ₸", { exact: true }).fill("45000");
  await page.getByLabel("Скупка до, ₸ (необязательно)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Сохранить мои цены", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Скупочный прайс сохранён");
  const next = await stored(page);
  expect(next.prices).toHaveLength(1);
  expect(next.prices[0].id).toBe(saved.id);
  expect(next.prices[0].buyMin).toBe(45000);
  expect(next.assessments[0].price.buyMin).toBe(40000);
  await page.reload();
  await page.getByLabel("Поиск модели", { exact: true }).fill("iPhone 13");
  await expect(page.locator(".offer-hero")).toContainText(/45\s*000/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("планшет Wi-Fi получает свой прайс и оценку без физической SIM и Face ID", async ({ page }) => {
  await start(page);
  const name = "iPad (A16) Wi-Fi";
  await ownPrice(page, name);
  expect((await stored(page)).prices[0].sim).toBe("wifi");
  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await page.getByLabel("Поиск модели", { exact: true }).fill(name);
  await expect(page.getByLabel("SIM (проверить вручную)", { exact: true })).toHaveValue("wifi");
  await expect(page.getByLabel("SIM (проверить вручную)", { exact: true }).locator("option")).toHaveCount(1);
  await expect(page.locator(".offer-hero")).toContainText(/40\s*000/);
  await expect(page.getByLabel("Face ID", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
