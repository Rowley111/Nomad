import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyState } from "../../src/domain/storage.js";
import { createRepair } from "../../src/domain/repairs.js";

const KEY = "nomad-workspace-v2";
async function seed(page, legacy = false) {
  let state = emptyState();
  if (legacy) {
    state = createRepair(state, { device: "Redmi A5 — старый заказ", repairTypeId: "diagnostic", description: "Диагностика", receivedOn: "2026-11-01" });
    for (const key of ["masterName", "clientName", "clientPhone", "clientNote"]) delete state.repairOrders[0][key];
  }
  await page.addInitScript(({ state, key }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { state, key: KEY });
  await page.goto("/");
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
}
const workspace = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

test("мастер и контакты клиента сохраняются в ремонте, поиске и полной копии", async ({ page }) => {
  await seed(page);
  await page.getByLabel("Устройство / модель", { exact: true }).fill("Redmi A5 — тест контактов");
  await page.getByLabel("Описание неисправности", { exact: true }).fill("Не заряжается");
  await page.getByLabel("Мастер", { exact: true }).fill("Мастер Тест");
  await page.getByLabel("Имя клиента", { exact: true }).fill("Клиент Тест");
  await page.getByLabel("Телефон клиента", { exact: true }).fill("+7 700 000 00 00");
  await page.getByLabel("Примечание к клиенту", { exact: true }).fill("Тестовая запись: позвонить после диагностики");
  await page.getByRole("button", { name: "Создать заказ", exact: true }).click();
  const detail = page.locator(".repair-detail");
  await expect(detail).toContainText("Мастер Тест");
  await expect(detail).toContainText("Клиент Тест");
  await expect(detail).toContainText("+7 700 000 00 00");
  await detail.getByLabel("Сумма оплаты, ₸", { exact: true }).fill("10000");
  await detail.getByRole("button", { name: "Подтвердить оплату", exact: true }).click();
  let state = await workspace(page);
  expect(state.repairOrders[0].payments).toHaveLength(1);
  expect(state.repairOrders[0].payments[0].amount).toBe(10000);
  await page.reload();
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
  await page.getByLabel("Поиск ремонта", { exact: true }).fill("Мастер Тест");
  await expect(page.locator(".repair-order-card")).toHaveCount(1);
  await page.getByLabel("Поиск ремонта", { exact: true }).fill("Клиент Тест");
  await expect(page.locator(".repair-order-card")).toHaveCount(1);
  await detail.getByRole("button", { name: "Изменить заказ", exact: true }).click();
  await detail.getByLabel("Мастер в заказе", { exact: true }).fill("Мастер Второй");
  await detail.getByLabel("Телефон клиента в заказе", { exact: true }).fill("+7 (700) 000-00-01");
  await detail.getByRole("button", { name: "Сохранить изменения заказа", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Данные заказа обновлены");
  state = await workspace(page);
  expect(state.repairOrders[0].masterName).toBe("Мастер Второй");
  expect(state.repairOrders[0].clientPhone).toBe("+7 (700) 000-00-01");
  expect(state.repairOrders[0].payments[0].amount).toBe(10000);
  const edited = state.repairEvents.findLast((event) => event.type === "repair-updated");
  expect(edited.before.masterName).toBe("Мастер Тест");
  expect(edited.after.masterName).toBe("Мастер Второй");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать полную копию JSON", exact: true }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.repairOrders[0].clientName).toBe("Клиент Тест");
  expect(backup.repairOrders[0].clientPhone).toBe("+7 (700) 000-00-01");
  expect(backup.repairOrders[0].clientNote).toContain("Тестовая запись");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("старый ремонт без контактов открывается и допускает проверенное дополнение", async ({ page }) => {
  await seed(page, true);
  const detail = page.locator(".repair-detail");
  await expect(detail).toContainText("Redmi A5 — старый заказ");
  await detail.getByRole("button", { name: "Изменить заказ", exact: true }).click();
  await expect(detail.getByLabel("Мастер в заказе", { exact: true })).toHaveValue("");
  await expect(detail.getByLabel("Телефон клиента в заказе", { exact: true })).toHaveValue("");
  await detail.getByLabel("Мастер в заказе", { exact: true }).fill("Мастер Тест");
  await detail.getByLabel("Телефон клиента в заказе", { exact: true }).fill("не телефон");
  await detail.getByRole("button", { name: "Сохранить изменения заказа", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/телефон/i);
  expect((await workspace(page)).repairOrders[0].clientPhone).toBeUndefined();
  await detail.getByLabel("Телефон клиента в заказе", { exact: true }).fill("007000000000");
  await detail.getByLabel("Имя клиента в заказе", { exact: true }).fill("Клиент Тест");
  await detail.getByRole("button", { name: "Сохранить изменения заказа", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Данные заказа обновлены");
  const after = await workspace(page);
  expect(after.repairOrders[0].clientPhone).toBe("007000000000");
  expect(after.repairOrders[0].payments).toEqual([]);
  expect(after.repairOrders[0].materials).toEqual([]);
  expect(after.repairOrders[0].receivedOn).toBe("2026-11-01");
});
