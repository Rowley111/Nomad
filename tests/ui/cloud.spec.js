import { test, expect } from "@playwright/test";
import { emptyState } from "../../src/domain/storage.js";
const KEY = "nomad-workspace-v2", API = "https://nomad-api.test";
const local = {
  ...emptyState(),
  inventory: [{ id: "private-local", model: "Только локальный телефон", buy: 50000, sell: 89000, status: "В наличии" }],
};
async function cloudPage(page, { role = "admin", state = emptyState(), write, preview, transfer } = {}) {
  let serverState = structuredClone(state), revision = 1;
  const calls = [];
  await page.addInitScript(({ key, state }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { key: KEY, state: local });
  // The dev module is forced to a mock HTTPS API. Production still uses only
  // the build-time VITE_API_URL, never a user-controlled URL or localStorage.
  await page.route("**/src/domain/remote.js*", async (route) => {
    const source = await route.fetch();
    const body = (await source.text()).replace(/^export const API_URL = .*$/m, `export const API_URL = "${API}";`);
    expect(body).toContain(`export const API_URL = "${API}";`);
    await route.fulfill({ response: source, body });
  });
  await page.route(API + "/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const body = request.postDataJSON();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
    const reply = (json, status = 200) => route.fulfill({ status, json, headers: cors });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ path, method, body, authorization: request.headers().authorization });
    if (path.endsWith("/auth/login")) return reply({ token: "opaque-ui-token", user: { username: "owner", role } });
    expect(request.headers().authorization).toBe("Bearer opaque-ui-token");
    if (path.endsWith("/workspace") && method === "GET") return reply({ state: serverState, revision });
    if (path.endsWith("/workspace") && method === "PUT") {
      if (write) {
        const result = await write(body, calls);
        if (result.status === 409) { revision++; return reply({ detail: "База изменена другим сотрудником" }, 409); }
      }
      expect(body.revision).toBe(revision);
      serverState = body.state; revision++;
      return reply({ state: serverState, revision });
    }
    if (path.endsWith("/import/preview")) {
      preview?.(body);
      return reply({ previewId: "preview-ui-id", revision, report: { added: { inventory: 1 }, duplicates: {}, conflicts: [], totalAdded: 1 } });
    }
    if (path.endsWith("/import/commit")) {
      transfer?.(body);
      serverState = { ...serverState, inventory: local.inventory }; revision++;
      return reply({ state: serverState, revision, report: { totalAdded: 1 } });
    }
    if (path.endsWith("/auth/logout")) return reply({ ok: true });
    throw new Error("Unexpected API request " + method + " " + path);
  });
  await page.goto("/");
  return { calls };
}
async function login(page) {
  await page.getByLabel("Логин", { exact: true }).fill("owner");
  await page.getByLabel("Пароль", { exact: true }).fill("private-ui-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Оценщик", exact: true })).toBeVisible();
}
async function openLosses(page) {
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
  await page.getByRole("button", { name: "Убытки", exact: true }).click();
}

test("общая база скрыта до входа, не использует локальный склад и ограничивает сотрудника", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { calls } = await cloudPage(page, { role: "staff" });
  await expect(page.getByRole("heading", { name: "Вход в Nomad Mobile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Склад", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Только локальный телефон");
  expect(calls).toHaveLength(0);
  await login(page);
  await expect(page.getByRole("button", { name: "Настройки", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Прайс и источники", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Склад", exact: true }).click();
  await expect(page.locator("body")).not.toContainText("Только локальный телефон");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)).toEqual(local);
  expect(await page.evaluate(() => [localStorage, sessionStorage].flatMap((store) => Object.values(store)).some((value) => value.includes("opaque-ui-token")))).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Вход в Nomad Mobile" })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("сохранение ждёт API, конфликт сохраняет поля и требует загрузить новую версию", async ({ page }) => {
  let release;
  let writes = 0;
  const waiting = new Promise((resolve) => { release = resolve; });
  await cloudPage(page, { write: async () => { writes++; if (writes === 1) { await waiting; return {}; } return { status: 409 }; } });
  await login(page); await openLosses(page);
  await page.getByLabel("Сумма убытка, ₸", { exact: true }).fill("-5000");
  await page.getByLabel("Причина убытка", { exact: true }).fill("Испортили деталь");
  await page.getByRole("button", { name: "Записать убыток", exact: true }).click();
  await expect(page.getByText("Сохраняю в общую базу…", { exact: true })).toBeVisible();
  await expect(page.locator(".loss-row")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Убыток записан и учтён");
  release();
  await expect(page.locator(".loss-row")).toHaveCount(1);
  await expect(page.locator(".loss-row")).toContainText("Испортили деталь");
  await expect(page.getByLabel("Сумма убытка, ₸", { exact: true })).toHaveValue("");
  await page.getByLabel("Сумма убытка, ₸", { exact: true }).fill("-1000");
  await page.getByLabel("Причина убытка", { exact: true }).fill("Несохранённое поле");
  await page.getByRole("button", { name: "Записать убыток", exact: true }).click();
  await expect(page.getByRole("button", { name: "Загрузить текущую версию базы" })).toBeVisible();
  await expect(page.getByLabel("Причина убытка", { exact: true })).toHaveValue("Несохранённое поле");
  await expect(page.getByRole("button", { name: "Записать убыток", exact: true })).toBeDisabled();
  await expect(page.locator(".loss-row")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Загрузить текущую версию базы" }).click();
  await expect(page.getByText("Загружена текущая версия общей базы")).toBeVisible();
  await page.getByRole("button", { name: "Убытки", exact: true }).click();
  await expect(page.getByLabel("Причина убытка", { exact: true })).toHaveValue("");
  await expect(page.locator(".loss-row")).toHaveCount(1);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)).toEqual(local);
});

test("перенос локальных данных требует серверного предпросмотра и подтверждения", async ({ page }) => {
  let previewCount = 0, importCount = 0;
  const { calls } = await cloudPage(page, {
    preview: ({ state }) => { previewCount++; expect(state.inventory).toEqual(local.inventory); },
    transfer: ({ previewId, operationId }) => { importCount++; expect(previewId).toBe("preview-ui-id"); expect(operationId).toMatch(/^[a-f0-9-]{36}$/); },
  });
  await login(page);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подтвердить замену из копии" })).toHaveCount(0);
  await page.getByRole("button", { name: "Предпросмотр данных этого браузера", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Предпросмотр переноса" })).toBeVisible();
  expect(previewCount).toBe(1); expect(importCount).toBe(0);
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key + "-before-cloud-import"), KEY))).toEqual(local);
  await page.getByRole("button", { name: "Подтвердить перенос в общую базу", exact: true }).click();
  await expect(page.getByText(/Перенос завершён: добавлено 1/)).toBeVisible();
  expect(importCount).toBe(1);
  await page.getByRole("button", { name: "Склад", exact: true }).click();
  await expect(page.locator("body")).toContainText("Только локальный телефон");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)).toEqual(local);
  expect(calls.filter((call) => call.path.endsWith("/import/commit"))).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
