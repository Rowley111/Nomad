import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyState } from "../../src/domain/storage.js";
import { parseCSV } from "../../src/domain/imports.js";

const KEY = "nomad-workspace-v2";
const existingItem = {
  id: "existing-stock",
  model: "Телефон со старого склада",
  storage: 128,
  buy: 50000,
  sell: 89000,
  status: "В наличии",
};

async function seed(page) {
  const state = { ...emptyState(), inventory: [existingItem] };
  for (const key of [
    "repairSchemaVersion",
    "repairOrders",
    "repairTypes",
    "materialCatalog",
    "repairEvents",
  ])
    delete state[key];
  await page.addInitScript(
    ({ key, state }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: KEY, state },
  );
}

async function workspace(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}

async function openRepairs(page) {
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
}

async function createOrder(page, typeLabel = "Диагностика") {
  await page.getByRole("button", { name: "Заказы", exact: true }).click();
  if (
    !(await page.getByLabel("Устройство / модель", { exact: true }).isVisible())
  )
    await page
      .getByRole("button", { name: "Новый ремонт", exact: true })
      .click();
  await page
    .getByLabel("Устройство / модель", { exact: true })
    .fill("iPhone 13 — ремонт экрана");
  await page
    .getByLabel("Тип ремонта", { exact: true })
    .selectOption({ label: typeLabel });
  await page.getByLabel("Дата приёма", { exact: true }).fill("2026-10-14");
  await page
    .getByLabel("Согласованная стоимость, ₸ (необязательно)", { exact: true })
    .fill("50000");
  await page
    .getByLabel("Описание неисправности", { exact: true })
    .fill("Треснуло стекло, клиентские контакты не нужны");
  await page
    .getByRole("button", { name: "Создать заказ", exact: true })
    .click();
  await expect(page.locator(".repair-detail")).toBeVisible();
}

async function recordMoney(page) {
  const detail = page.locator(".repair-detail");
  await detail.getByText(/^Материалы и запчасти/).click();
  await detail
    .getByLabel("Материал / запчасть", { exact: true })
    .fill("Дисплей");
  await detail.getByLabel("Количество", { exact: true }).fill("2");
  await detail.getByLabel("Цена за единицу, ₸", { exact: true }).fill("3000");
  await detail.getByLabel("Дата расхода", { exact: true }).fill("2026-10-15");
  await detail
    .getByRole("button", { name: "Добавить материал", exact: true })
    .click();
  await detail.getByText(/^Другие прямые расходы/).click();
  await detail
    .getByLabel("Название расхода", { exact: true })
    .fill("Доставка запчасти");
  await detail.getByLabel("Сумма расхода, ₸", { exact: true }).fill("1000");
  await detail
    .getByLabel("Дата прямого расхода", { exact: true })
    .fill("2026-10-15");
  await detail
    .getByRole("button", { name: "Добавить расход", exact: true })
    .click();
  await detail.getByLabel("Сумма оплаты, ₸", { exact: true }).fill("18000");
  await detail.getByLabel("Дата оплаты", { exact: true }).fill("2026-10-16");
  await detail
    .getByLabel("Способ оплаты", { exact: true })
    .selectOption("transfer");
  await detail
    .getByRole("button", { name: "Подтвердить оплату", exact: true })
    .click();
}

async function expectMetric(scope, label, value) {
  const element = scope.getByText(label, { exact: true }).first();
  await expect(element.locator("..")).toContainText(
    new RegExp(value.replaceAll(" ", "\\s")),
  );
}

test("ремонт: свой тип, материалы, фактическая оплата и сохранение без потери склада", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await page.goto("/");
  await openRepairs(page);
  await page.getByRole("button", { name: "Справочники", exact: true }).click();
  await page
    .getByLabel("Название типа ремонта", { exact: true })
    .fill("Замена стекла");
  await page
    .getByRole("button", { name: "Сохранить тип ремонта", exact: true })
    .click();
  await page
    .getByLabel("Название материала", { exact: true })
    .fill("Дисплей iPhone 13");
  await page.getByLabel("Единица измерения", { exact: true }).fill("шт.");
  await page
    .getByLabel("Себестоимость единицы, ₸", { exact: true })
    .fill("3000");
  await page
    .getByRole("button", {
      name: "Сохранить материал в справочник",
      exact: true,
    })
    .click();
  await createOrder(page, "Замена стекла");
  await recordMoney(page);
  const detail = page.locator(".repair-detail");
  await expectMetric(detail, "Получено от клиента", "18 000");
  await expectMetric(detail, "Материалы", "6 000");
  await expectMetric(detail, "Другие расходы", "1 000");
  await expectMetric(detail, "Заработок после прямых расходов", "11 000");
  await detail
    .getByRole("button", { name: "Изменить заказ", exact: true })
    .click();
  await detail
    .getByLabel("Согласованная стоимость заказа, ₸", { exact: true })
    .fill("60000");
  await detail
    .getByRole("button", { name: "Сохранить изменения заказа", exact: true })
    .click();
  await expectMetric(detail, "Заработок после прямых расходов", "11 000");
  const csvDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Экспорт заказов CSV", exact: true })
    .click();
  const csvDownload = await csvDownloadPromise;
  const csvText = await readFile(await csvDownload.path(), "utf8");
  const csvRows = parseCSV(csvText);
  expect(csvRows[0].received).toBe("18000");
  expect(csvRows[0].materials).toBe("6000");
  expect(csvRows[0].costs).toBe("1000");
  expect(csvRows[0].profit).toBe("11000");
  expect(csvText).not.toContain("[object Object]");
  await detail.screenshot({
    path: `/tmp/nomad-repairs-detail-${test.info().project.name}.png`,
  });
  const before = await workspace(page);
  expect(before.inventory).toEqual([existingItem]);
  expect(before.repairOrders).toHaveLength(1);
  expect(before.repairOrders[0].payments).toHaveLength(1);
  expect(before.repairOrders[0].materials).toHaveLength(1);
  expect(before.materialCatalog).toHaveLength(1);
  await page.reload();
  await openRepairs(page);
  await expect(
    page.getByText("iPhone 13 — ремонт экрана", { exact: true }).first(),
  ).toBeVisible();
  const after = await workspace(page);
  expect(after.repairOrders).toEqual(before.repairOrders);
  expect(after.inventory).toEqual([existingItem]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("отчёт по ремонту считает деньги по датам операций и показывает недельный и месячный график", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await openRepairs(page);
  await createOrder(page);
  await recordMoney(page);
  await page
    .getByRole("button", { name: "Отчёт по ремонтам", exact: true })
    .click();
  await page.getByLabel("Период отчёта", { exact: true }).selectOption("all");
  await expectMetric(page, "Получено от клиентов (после возвратов)", "18 000");
  await expectMetric(page, "Стоимость материалов", "6 000");
  await expectMetric(page, "Другие прямые расходы", "1 000");
  await expectMetric(page, "Заработок после прямых расходов", "11 000");
  await expect(
    page.getByLabel("График доходов и расходов ремонтов", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Группировка", { exact: true }).selectOption("week");
  await expect(
    page.getByLabel("График доходов и расходов ремонтов", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Группировка", { exact: true }).selectOption("month");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/nomad-repairs-report-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Период отчёта", { exact: true })
    .selectOption("custom");
  await page.getByLabel("С даты", { exact: true }).fill("2026-10-15");
  await page.getByLabel("По дату", { exact: true }).fill("2026-10-15");
  await expectMetric(page, "Получено от клиентов (после возвратов)", "0 ₸");
  await expectMetric(page, "Заработок после прямых расходов", "-7 000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("полная JSON-копия сохраняет ремонты, а замена старой копией требует подтверждения", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await openRepairs(page);
  await createOrder(page);
  await recordMoney(page);
  const before = await workspace(page);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать полную копию JSON", exact: true })
    .click();
  const download = await downloadPromise;
  const savedText = await readFile(await download.path(), "utf8");
  expect(JSON.parse(savedText).repairOrders).toEqual(before.repairOrders);
  const old = structuredClone(before);
  for (const key of [
    "repairSchemaVersion",
    "repairOrders",
    "repairTypes",
    "materialCatalog",
    "repairEvents",
  ])
    delete old[key];
  await page
    .getByLabel("JSON резервной копии", { exact: true })
    .fill(JSON.stringify(old));
  await page
    .getByRole("button", { name: "Предпросмотр восстановления", exact: true })
    .click();
  expect((await workspace(page)).repairOrders).toHaveLength(1);
  await expect(
    page
      .getByText(/ремонт/i)
      .filter({ hasText: /замен|удал|текущ/i })
      .last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Подтвердить замену из копии", exact: true })
    .click();
  expect((await workspace(page)).repairOrders).toHaveLength(0);
  expect((await workspace(page)).inventory).toEqual([existingItem]);
  await page
    .getByLabel("JSON резервной копии", { exact: true })
    .fill(savedText);
  await page
    .getByRole("button", { name: "Предпросмотр восстановления", exact: true })
    .click();
  expect((await workspace(page)).repairOrders).toHaveLength(0);
  await page
    .getByRole("button", { name: "Подтвердить замену из копии", exact: true })
    .click();
  const restored = await workspace(page);
  expect(restored.repairOrders).toEqual(before.repairOrders);
  expect(restored.repairEvents).toEqual(before.repairEvents);
  expect(restored.inventory).toEqual([existingItem]);
  await openRepairs(page);
  await expect(
    page.getByText("iPhone 13 — ремонт экрана", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
