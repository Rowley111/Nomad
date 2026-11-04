import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyState } from "../../src/domain/storage.js";
import { ensureCashState, addCashTransaction } from "../../src/domain/cash.js";

const KEY = "nomad-workspace-v2";
async function start(page, supplied) {
  const state = supplied ?? ensureCashState(emptyState());
  await page.addInitScript(({ state, key }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { state, key: KEY });
  await page.goto("/");
  await page.getByRole("button", { name: "Касса и банк", exact: true }).click();
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function transaction(page, { kind, amount, reason, category, employee, account = "cash", toAccount = "bank" }) {
  await page.getByLabel("Вид денежной операции", { exact: true }).selectOption(kind);
  await page.getByLabel(kind === "transfer" ? "Со счёта" : "Счёт операции", { exact: true }).selectOption(account);
  if (kind === "transfer") await page.getByLabel("На счёт", { exact: true }).selectOption(toAccount);
  else if (category) await page.getByLabel("Категория денежной операции", { exact: true }).selectOption(category);
  if (employee) await page.getByLabel("Сотрудник операции (необязательно)", { exact: true }).selectOption(employee);
  await page.getByLabel("Сумма денежной операции, ₸", { exact: true }).fill(String(amount));
  await page.getByLabel("Причина денежной операции", { exact: true }).fill(reason);
  await page.getByRole("button", { name: "Записать денежную операцию", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Денежная операция сохранена");
}

test("касса и банк начинают с нуля, приход/расход/перевод сохраняются раздельно", async ({ page }) => {
  await start(page);
  await expect(page.locator('.cash-balance[data-account="cash"]')).toContainText(/0\s₸/);
  await expect(page.locator('.cash-balance[data-account="bank"]')).toContainText(/0\s₸/);
  expect((await stored(page)).cashTransactions).toHaveLength(0);
  await transaction(page, { kind: "income", amount: 200000, reason: "Тестовое пополнение владельцем", category: "income-owner" });
  await transaction(page, { kind: "expense", amount: 1200, reason: "Тестовая покупка воды", category: "expense-water" });
  await transaction(page, { kind: "transfer", amount: 50000, reason: "Тестовый перевод в банк" });
  await expect(page.locator('.cash-balance[data-account="cash"]')).toContainText(/148\s800/);
  await expect(page.locator('.cash-balance[data-account="bank"]')).toContainText(/50\s000/);
  const snapshot = await stored(page);
  expect(snapshot.cashTransactions).toHaveLength(3);
  expect(snapshot.cashTransactions.find((row) => row.kind === "expense").signedAmount).toBe(-1200);
  await page.reload();
  await page.getByRole("button", { name: "Касса и банк", exact: true }).click();
  await expect(page.locator('.cash-balance[data-account="cash"]')).toContainText(/148\s800/);
  await page.getByRole("button", { name: "Банк", exact: true }).click();
  await expect(page.locator(".cash-row")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("зарплата показывает минус и сохраняет имя сотрудника после изменения справочника", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Сотрудники", exact: true }).click();
  await page.getByLabel("Имя сотрудника", { exact: true }).fill("Тестовый мастер");
  await page.getByLabel("Должность сотрудника", { exact: true }).fill("Ремонтник");
  await page.getByLabel("Телефон сотрудника (необязательно)", { exact: true }).fill("+7 700 000 00 01");
  await page.getByRole("button", { name: "Сохранить сотрудника", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Сотрудник сохранён");
  const employee = (await stored(page)).employees[0];
  await page.getByRole("button", { name: "Касса и банк", exact: true }).click();
  await transaction(page, { kind: "expense", amount: -5000, reason: "Тестовая выплата зарплаты", category: "expense-salary", employee: employee.id });
  await expect(page.locator('.cash-balance[data-account="cash"]')).toContainText(/-5\s000/);
  await expect(page.locator(".cash-row")).toContainText("Тестовый мастер");
  await page.getByRole("button", { name: "Сотрудники", exact: true }).click();
  await page.getByRole("button", { name: "Редактировать сотрудника Тестовый мастер", exact: true }).click();
  await page.getByLabel("Имя сотрудника", { exact: true }).fill("Новое имя мастера");
  await page.getByRole("button", { name: "Сохранить сотрудника", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Сотрудник сохранён");
  await page.getByRole("button", { name: "Архивировать сотрудника Новое имя мастера", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Сотрудник архивирован");
  await page.getByRole("button", { name: "Касса и банк", exact: true }).click();
  await expect(page.locator(".cash-row")).toContainText("Тестовый мастер");
  const state = await stored(page);
  expect(state.employees[0].archived).toBe(true);
  expect(state.cashTransactions[0].employeeName).toBe("Тестовый мастер");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("своя категория и исправление операции сохраняют исходную сумму и причину", async ({ page }) => {
  await start(page);
  await page.getByText("Категории прихода и расхода", { exact: true }).click();
  await page.getByLabel("Название категории", { exact: true }).fill("Тестовые расходники");
  await page.getByRole("button", { name: "Сохранить категорию", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Категория сохранена");
  const category = (await stored(page)).cashCategories.find((row) => row.name === "Тестовые расходники");
  await page.getByLabel("Сумма денежной операции, ₸", { exact: true }).fill("0");
  await page.getByLabel("Причина денежной операции", { exact: true }).fill("Тестовая проверка нуля");
  await page.getByRole("button", { name: "Записать денежную операцию", exact: true }).click();
  expect((await stored(page)).cashTransactions).toHaveLength(0);
  await transaction(page, { kind: "expense", amount: 1200, reason: "Тестовые материалы", category: category.id });
  page.once("dialog", (dialog) => dialog.accept("Ошибочная тестовая запись"));
  await page.getByRole("button", { name: "Исправить денежную операцию", exact: true }).click();
  await expect(page.locator(".cash-voided")).toHaveCount(1);
  await expect(page.locator('.cash-balance[data-account="cash"]')).toContainText(/0\s₸/);
  const state = await stored(page);
  expect(state.cashTransactions).toHaveLength(1);
  expect(state.cashTransactions[0].amount).toBe(1200);
  expect(state.cashTransactions[0].voidReason).toBe("Ошибочная тестовая запись");
  expect(state.cashEvents.length).toBeGreaterThan(1);
});

test("денежный журнал фильтруется по датам, группируется и экспортируется", async ({ page }) => {
  let state = ensureCashState(emptyState());
  state = addCashTransaction(state, { kind: "income", accountId: "cash", amount: 800, categoryId: "income-owner", happenedOn: "2026-10-31", reason: "Тестовое предыдущее пополнение" }, "cash-test-october");
  state = addCashTransaction(state, { kind: "income", accountId: "cash", amount: 1000, categoryId: "income-sales", happenedOn: "2026-11-01", reason: "Тестовый ноябрьский приход" }, "cash-test-november");
  await start(page, state);
  await page.getByLabel("Деньги с даты", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Деньги по дату", { exact: true }).fill("2026-11-02");
  await page.getByLabel("Группировка денег", { exact: true }).selectOption("month");
  await expect(page.locator(".cash-row")).toHaveCount(1);
  await expect(page.locator(".cash-periods")).toContainText(/ноябр/i);
  await expect(page.locator(".cash-period-summary")).toContainText(/800\s₸/);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт денежных операций CSV", exact: true }).click();
  const download = await downloadEvent;
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain("Тестовый ноябрьский приход");
  expect(csv).not.toContain("Тестовое предыдущее пополнение");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
