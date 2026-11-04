import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyState } from "../../src/domain/storage.js";
import { parseCSV } from "../../src/domain/imports.js";

const KEY = "nomad-workspace-v2";
const stock = {
  id: "loss-test-stock",
  model: "Существующий телефон",
  buy: 50000,
  sell: 89000,
  storage: 128,
  status: "В наличии",
};
const ownerPrice = {
  id: "loss-test-price",
  model: "Samsung Galaxy A35 5G",
  storage: 128,
  ram: 8,
  sim: "physical",
  market: "Астана",
  currency: "KZT",
  channel: "store-cash",
  price: 89000,
  source: "owner",
  checkedAt: "2026-11-03",
  author: "Тестовый владелец",
  base: { screen: "good", body: "good", box: true, battery: null },
  note: "Синтетический ориентир, который убытки не должны менять",
};

async function seed(page) {
  const state = { ...emptyState(), inventory: [stock], prices: [ownerPrice] };
  // Existing repair schema v1 snapshots had no optional losses array.
  delete state.repairLosses;
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
async function openLosses(page) {
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
  await page.getByRole("button", { name: "Убытки", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Учёт убытков" }),
  ).toBeVisible();
}
async function fillLoss(page, amount, reason) {
  const ledger = page.locator(".loss-ledger");
  await ledger.getByLabel("Сумма убытка, ₸", { exact: true }).fill(amount);
  await ledger.getByLabel("Дата убытка", { exact: true }).fill("2026-10-16");
  await ledger.getByLabel("Причина убытка", { exact: true }).fill(reason);
  await ledger
    .getByLabel("Связать с заказом", { exact: true })
    .selectOption("");
  await ledger
    .getByRole("button", { name: "Записать убыток", exact: true })
    .click();
}
async function metric(page, label, pattern) {
  const card = page.locator(".repair-stats article").filter({
    has: page.getByText(label, { exact: true }),
  });
  await expect(card.locator("strong")).toHaveText(pattern);
}
async function openAllReport(page) {
  await page
    .getByRole("button", { name: "Отчёт по ремонтам", exact: true })
    .click();
  await page.getByLabel("Период отчёта", { exact: true }).selectOption("all");
}

// The shared Playwright config runs both scenarios at 1440 and 390 px.
test("убыток −5000 учитывается по неделям/месяцам, экспортируется и восстанавливается без потери склада", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await page.goto("/");
  const original = await workspace(page);
  await openLosses(page);
  await fillLoss(page, "-5000", "Испортили запчасть");
  await expect(page.locator(".loss-row")).toHaveCount(1);
  await expect(page.locator(".loss-row")).toContainText(/-5\s000\s₸/);
  await expect(page.locator(".loss-row")).toContainText("Испортили запчасть");
  let state = await workspace(page);
  expect(state.repairLosses).toHaveLength(1);
  expect(state.repairLosses[0].amount).toBe(-5000);
  expect(state.repairLosses[0].lostOn).toBe("2026-10-16");
  expect(state.inventory).toEqual(original.inventory);
  expect(state.prices).toEqual(original.prices);
  expect(state.repairOrders).toEqual(original.repairOrders);

  await openAllReport(page);
  await metric(page, "Убытки", /-5\s000\s₸/);
  await metric(page, "Заработок после прямых расходов", /-5\s000\s₸/);
  await expect(page.locator(".loss-deficit")).toContainText(
    /В минусе: 5\s000\s₸/,
  );
  await expect(
    page.getByLabel("График доходов и расходов ремонтов", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Группировка", { exact: true }).selectOption("week");
  await metric(page, "Заработок после прямых расходов", /-5\s000\s₸/);
  await expect(
    page.getByLabel("График доходов и расходов ремонтов", { exact: true }),
  ).toBeVisible();
  const csvDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Экспорт отчёта CSV", exact: true })
    .click();
  const csvDownload = await csvDownloadPromise;
  const csvText = await readFile(await csvDownload.path(), "utf8");
  const csv = parseCSV(csvText);
  expect(csv).toHaveLength(1);
  expect(csv[0].key).toMatch(/^2026-W\d{2}$/);
  expect(csv[0].losses).toBe("5000");
  expect(csv[0].expenses).toBe("5000");
  expect(csv[0].profit).toBe("-5000");
  expect(csvText).not.toContain('"\'-5000"');
  await page.getByLabel("Группировка", { exact: true }).selectOption("month");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/nomad-losses-report-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const backupPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать полную копию JSON", exact: true })
    .click();
  const backup = await backupPromise;
  const backupText = await readFile(await backup.path(), "utf8");
  const saved = JSON.parse(backupText);
  expect(saved.repairLosses[0].amount).toBe(-5000);
  expect(saved.inventory).toEqual(original.inventory);
  // Previewing the genuinely older snapshot must not mutate the current ledger.
  await page
    .getByLabel("JSON резервной копии", { exact: true })
    .fill(JSON.stringify(original));
  await page
    .getByRole("button", { name: "Предпросмотр восстановления", exact: true })
    .click();
  expect((await workspace(page)).repairLosses).toHaveLength(1);
  await expect(
    page.locator(".warning").filter({ hasText: "нет учёта убытков" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Подтвердить замену из копии", exact: true })
    .click();
  expect((await workspace(page)).repairLosses?.length ?? 0).toBe(0);
  await page
    .getByLabel("JSON резервной копии", { exact: true })
    .fill(backupText);
  await page
    .getByRole("button", { name: "Предпросмотр восстановления", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить замену из копии", exact: true })
    .click();
  state = await workspace(page);
  expect(state.repairLosses).toEqual(saved.repairLosses);
  expect(state.repairEvents).toEqual(saved.repairEvents);
  expect(state.inventory).toEqual(original.inventory);
  expect(state.prices).toEqual(original.prices);
  await page.reload();
  await openLosses(page);
  await expect(page.locator(".loss-row")).toHaveCount(1);
  await expect(page.locator(".loss-row")).toContainText(/-5\s000\s₸/);
  await page.locator(".loss-ledger").screenshot({
    path: `/tmp/nomad-losses-ledger-${test.info().project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("5000 сохраняется как отрицательный убыток, ноль отвергается, исправление сохраняет историю", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await openLosses(page);
  await fillLoss(page, "0", "Ошибочный нулевой убыток");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator(".loss-row")).toHaveCount(0);
  expect((await workspace(page)).repairLosses?.length ?? 0).toBe(0);
  await fillLoss(page, "5000", "Недостача по работе");
  await expect(page.locator(".loss-row")).toHaveCount(1);
  let state = await workspace(page);
  expect(state.repairLosses[0].amount).toBe(-5000);
  await expect(page.locator(".loss-row")).toContainText(/-5\s000\s₸/);
  page.once("dialog", (dialog) =>
    dialog.accept("Исправление ошибочного ввода"),
  );
  await page
    .locator(".loss-row")
    .getByRole("button", { name: "Исправить запись", exact: true })
    .click();
  await expect(page.locator(".loss-row.loss-voided")).toHaveCount(1);
  await expect(page.locator(".loss-row")).toContainText(
    "Исправление ошибочного ввода",
  );
  state = await workspace(page);
  expect(state.repairLosses).toHaveLength(1);
  expect(state.repairLosses[0].voided).toBe(true);
  expect(state.repairLosses[0].amount).toBe(-5000);
  expect(state.repairLosses[0].voidReason).toBe("Исправление ошибочного ввода");
  expect(state.repairEvents.some((event) => event.type === "repair-loss")).toBe(
    true,
  );
  expect(
    state.repairEvents.some((event) => event.type === "repair-loss-voided"),
  ).toBe(true);
  expect(state.inventory).toEqual([stock]);
  await openAllReport(page);
  await metric(page, "Убытки", /0\s₸/);
  await metric(page, "Заработок после прямых расходов", /0\s₸/);
  await expect(page.locator(".loss-deficit")).toHaveCount(0);
});
