import { test, expect } from "@playwright/test";
import { emptyState, recordSale, KEY, LEGACY } from "../../src/domain/storage.js";
import { mirrorSalesJournal, SALES_JOURNAL } from "../../src/domain/recovery.js";
import { saveEmployee } from "../../src/domain/cash.js";

async function openRecovery(page) {
  await page.getByRole("button", {name:"Настройки",exact:true}).click();
  await page.getByRole("button", {name:"Проверить локальные копии продаж",exact:true}).click();
}
test("подтверждённая A35 восстанавливается из резервного журнала без дубликата и новой карточки",async({page})=>{
  const before=emptyState();
  before.inventory=[{id:"recovery-a35",model:"Samsung Galaxy A35 5G",storage:128,ram:8,buy:50000,sell:89000,status:"В наличии",sale:null}];
  const sold=recordSale(before,"recovery-a35",87000,1000,"Наличные","2026-11-03");
  const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
  mirrorSalesJournal(storage,sold);
  await page.addInitScript(({state,key,journal,journalKey})=>{
    if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(state));localStorage.setItem(journalKey,journal);}
  },{state:emptyState(),key:KEY,journal:map.get(SALES_JOURNAL),journalKey:SALES_JOURNAL});
  await page.goto("/");
  await openRecovery(page);
  await expect(page.locator(".sales-recovery")).toContainText("дополнительных подтверждённых продаж: 1");
  await page.getByRole("button",{name:"Подтвердить восстановление истории",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("История восстановлена");
  await page.getByRole("button",{name:"Продажи",exact:true}).click();
  await expect(page.getByRole("heading",{name:"История продаж (1)",exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Список проданных телефонов"})).toContainText("Samsung Galaxy A35 5G");
  await expect(page.getByRole("region",{name:"Список проданных телефонов"})).toContainText(/87\s*000/);
  await page.reload();
  await openRecovery(page);
  await expect(page.locator(".sales-recovery")).toContainText("дополнительных подтверждённых продаж: 0");
  const result=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  expect(result.inventory).toHaveLength(0);
  expect(result.events.filter(row=>row.type==="sale")).toHaveLength(1);
});
test("старый статус без суммы не становится сделкой; мастер выбирается из сотрудников",async({page})=>{
  const state=saveEmployee(emptyState(),{name:"Мастер Тестовый",jobTitle:"Ремонтник",phone:""});
  await page.addInitScript(({state,key,legacy})=>{
    if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(state));localStorage.setItem(legacy,JSON.stringify([{id:"legacy-a35",model:"Samsung Galaxy A35 5G",buy:50000,sell:89000,status:"Продан"}]));}
  },{state,key:KEY,legacy:LEGACY});
  await page.goto("/");
  await openRecovery(page);
  await expect(page.locator(".sales-recovery")).toContainText("дополнительных подтверждённых продаж: 0");
  await expect(page.getByRole("button",{name:"Подтвердить восстановление истории",exact:true})).toBeDisabled();
  await page.getByRole("checkbox",{name:"Вернуть старые карточки «Продан» для ручного уточнения суммы и даты",exact:true}).check();
  await page.getByRole("button",{name:"Подтвердить восстановление истории",exact:true}).click();
  const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  expect(restored.inventory[0].sale).toBeNull();
  expect(restored.events.some(row=>row.type==="sale")).toBe(false);
  await page.getByRole("button",{name:"Ремонты",exact:true}).click();
  await expect(page.locator("#repair-master-create option[value='Мастер Тестовый']")).toHaveCount(1);
  await page.getByLabel("Мастер",{exact:true}).fill("Мастер Тестовый");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
