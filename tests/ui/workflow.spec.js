import { test, expect } from "@playwright/test";
import { emptyState } from "../../src/domain/storage.js";
const price = {
  id: "a35-price",
  model: "Samsung Galaxy A35 5G",
  storage: 128,
  ram: 8,
  sim: "physical",
  market: "Астана",
  currency: "KZT",
  channel: "store-cash",
  price: 89000,
  source: "owner",
  checkedAt: new Date().toISOString().slice(0, 10),
  author: "Владелец",
  base: { screen: "good", body: "good", box: true, battery: null },
  note: "Хорошее состояние, коробка; следы от чехла уже учтены",
};
async function seed(page) {
  const state = { ...emptyState(), prices: [price] };
  await page.addInitScript(
    (state) =>
      localStorage.setItem("nomad-workspace-v2", JSON.stringify(state)),
    state,
  );
}
test("прайс → оценка → подтверждённая закупка → фактическая продажа", async ({
  page,
}) => {
  await seed(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("89 000 ₸", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("111 250 ₸", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Требуется ручная диагностика. Безопасный максимум закупа не рассчитан.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("История ремонта", { exact: true })
    .selectOption("none");
  for (const name of ["Сенсор", "Камеры", "Связь", "Зарядка"])
    await page.getByLabel(name, { exact: true }).selectOption("ok");
  await page
    .getByLabel("Блокировки и аккаунты", { exact: true })
    .selectOption("checked");
  await page.getByLabel("Цена продавца, ₸ (необязательно)").fill("50000");
  await expect(page.getByText("39 000 ₸", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Сохранить оценку", exact: true })
    .click();
  let s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nomad-workspace-v2")),
  );
  expect(s.inventory).toHaveLength(0);
  expect(s.assessments).toHaveLength(1);
  await page
    .getByRole("button", { name: "Оформить закупку", exact: true })
    .click();
  await page.getByLabel("Фактический закуп, ₸").fill("50000");
  await page
    .getByRole("button", { name: "Подтвердить закупку", exact: true })
    .click();
  await page.getByRole("button", { name: "Склад", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Samsung Galaxy A35/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Зарегистрировать продажу" }).click();
  await page.getByLabel("Фактическая выручка, ₸").fill("87000");
  await page
    .getByLabel("Прямые расходы сделки, ₸ (включая комиссию банка)")
    .fill("1000");
  await page
    .getByRole("button", { name: "Подтвердить продажу", exact: true })
    .click();
  await expect(
    page.getByText(/Результат до общих расходов и налогов: 36\s000/),
  ).toBeVisible();
  s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nomad-workspace-v2")),
  );
  expect(s.inventory[0].sale.revenue).toBe(87000);
  expect(s.events.filter((x) => x.type === "sale")).toHaveLength(1);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("чистая установка без выдуманной цены, прайс сохраняется один раз", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText(/Нет данных для этой конфигурации/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Прайс и источники", exact: true })
    .click();
  await page.getByLabel("Цена витрины, ₸").fill("89000");
  await page.getByLabel("Автор изменения").fill("Владелец");
  await page
    .getByLabel("Пояснение (включая комплект и износ)")
    .fill("Коробка, хорошее состояние, следы от чехла учтены");
  await page
    .getByRole("button", { name: "Сохранить прайс", exact: true })
    .click();
  await page.getByRole("button", { name: "Оценщик", exact: true }).click();
  await expect(page.getByText("111 250 ₸", { exact: true })).toBeVisible();
  await page.getByLabel("Поиск модели").fill("iPhone 11");
  await expect(page.getByLabel("Конфигурация (физическая память)")).toHaveValue(
    "64|",
  );
  await expect(
    page.getByText(/Нет данных для этой конфигурации/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("старый localStorage сохраняется при открытии", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nomad-inventory-v1",
      JSON.stringify([
        {
          id: 1,
          model: "Samsung Galaxy A35 5G",
          storage: 128,
          ram: 8,
          buy: 50000,
          sell: 89000,
          status: "В наличии",
          box: true,
          date: "2026-11-03",
          note: "Старый товар",
        },
      ]),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Склад", exact: true }).click();
  await expect(page.getByText(/Старый товар/)).toBeVisible();
  const values = await page.evaluate(() => ({
    old: localStorage.getItem("nomad-inventory-v1"),
    backup: localStorage.getItem("nomad-inventory-v1-backup-before-v2"),
    count: JSON.parse(localStorage.getItem("nomad-workspace-v2")).inventory
      .length,
  }));
  expect(values.old).toBe(values.backup);
  expect(values.count).toBe(1);
});

test('резервная копия восстанавливается только после предпросмотра и подтверждения',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Настройки',exact:true}).click();const state={...emptyState(),inventory:[{id:'restored',model:'Восстановленный телефон',storage:128,ram:8,buy:0,sell:100,status:'В наличии'}]};await page.getByLabel('JSON резервной копии').fill(JSON.stringify(state));await page.getByRole('button',{name:'Предпросмотр восстановления'}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nomad-workspace-v2')||'{"inventory":[]}').inventory.length)).toBe(0);await page.getByRole('button',{name:'Подтвердить замену из копии'}).click();await page.getByRole('button',{name:'Склад',exact:true}).click();await expect(page.getByRole('heading',{name:/Восстановленный телефон/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
