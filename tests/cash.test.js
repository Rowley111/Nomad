import test from "node:test";
import assert from "node:assert/strict";
import {
  cashDefaults, cashToday, ensureCashState, validateCashState, addCashTransaction,
  voidCashTransaction, saveEmployee, saveCashCategory, cashReport, getAccountBalance,
} from "../src/domain/cash.js";

const day = "2026-10-28";
const input = (changes = {}) => ({ kind: "expense", accountId: "cash", categoryId: "expense-water", amount: "1200", happenedOn: day, reason: "Вода в магазин", ...changes });
const empty = () => ({ inventory: [{ id: "old", buy: 50000 }], prices: [{ price: 89000 }], ...cashDefaults("2026-10-01T08:00:00Z") });

test("cash: additive migration preserves existing records and starts both accounts at zero", () => {
  const previous = { inventory: [{ id: "old", buy: 50000 }], repairLosses: [{ amount: -5000 }] };
  assert.equal(validateCashState(previous), previous);
  const copy = structuredClone(previous), migrated = ensureCashState(previous);
  assert.deepEqual(previous, copy);
  assert.equal(migrated.inventory, previous.inventory);
  assert.equal(migrated.repairLosses, previous.repairLosses);
  assert.equal(migrated.cashTransactions.length, 0);
  assert.equal(migrated.employees.length, 0);
  assert.equal(getAccountBalance(migrated, "cash"), 0);
  assert.equal(getAccountBalance(migrated, "bank"), 0);
  assert.equal(cashReport(migrated).balance, 0);
  assert.equal(ensureCashState(migrated), migrated);
  const isolated = cashDefaults(); isolated.cashAccounts[0].name = "Другое";
  assert.equal(cashDefaults().cashAccounts[0].name, "Касса");
});

test("cash: expense 1200 records one negative movement with reason and may show a deficit", () => {
  const state = empty(), original = structuredClone(state);
  const next = addCashTransaction(state, input(), "water-operation");
  assert.deepEqual(state, original);
  assert.equal(next.cashTransactions[0].amount, 1200);
  assert.equal(next.cashTransactions[0].signedAmount, -1200);
  assert.equal(next.cashTransactions[0].reason, "Вода в магазин");
  assert.equal(next.cashTransactions[0].categoryName, "Вода");
  assert.equal(getAccountBalance(next, "cash"), -1200);
  assert.equal(getAccountBalance(next, "bank"), 0);
  assert.equal(cashReport(next).expenses, 1200);
  assert.equal(cashReport(next).net, -1200);
  assert.equal(next.cashEvents[0].type, "cash-created");
  assert.equal(next.cashEvents[0].after.amount, 1200);
});

test("cash: positive and negative expense notation normalize without a double minus", () => {
  for (const amount of [5000, -5000, "5000", "-5000", "−5000"]) {
    const next = addCashTransaction(empty(), input({ amount }), "loss-operation");
    assert.equal(getAccountBalance(next, "cash"), -5000);
    assert.equal(next.cashTransactions[0].amount, 5000);
    assert.equal(next.cashTransactions[0].signedAmount, -5000);
  }
  const withdrawn = addCashTransaction(empty(), input({ amount: 500000, categoryId: "expense-parts", reason: "Закупка запчастей" }), "withdrawal");
  assert.equal(getAccountBalance(withdrawn, "cash"), -500000);
});

test("cash: empty, zero, NaN, infinite and over-precision amounts are rejected atomically", () => {
  const state = empty(), original = structuredClone(state);
  for (const amount of [0, -0, "0", "", null, undefined, true, NaN, Infinity, -Infinity, "NaN", "Infinity", "1e3", 1.005, "1.005", "1200 ₸"]) {
    assert.throws(() => addCashTransaction(state, input({ amount }), "bad-amount"), String(amount));
    assert.deepEqual(state, original);
  }
  assert.throws(() => addCashTransaction(state, input({ kind: "income", categoryId: "income-other", amount: -5 }), "bad-income"));
  assert.throws(() => addCashTransaction(state, input({ kind: "transfer", toAccountId: "bank", amount: -5 }), "bad-transfer"));
  assert.equal(getAccountBalance(addCashTransaction(state, input({ amount: "1200,50" }), "decimal"), "cash"), -1200.5);
});

test("cash: transfer preserves combined balance and is not income or an expense", () => {
  let state = addCashTransaction(empty(), input({ kind: "income", categoryId: "income-sales", amount: 20000, reason: "Продажа" }), "receipt");
  state = addCashTransaction(state, input({ kind: "transfer", toAccountId: "bank", amount: 5000, reason: "Внесение наличных на банк" }), "transfer");
  assert.equal(state.cashTransactions.length, 2);
  assert.equal(getAccountBalance(state, "cash"), 15000);
  assert.equal(getAccountBalance(state, "bank"), 5000);
  const all = cashReport(state);
  assert.equal(all.balance, 20000); assert.equal(all.income, 20000); assert.equal(all.expenses, 0);
  assert.equal(all.transferIn, 5000); assert.equal(all.transferOut, 5000); assert.equal(all.net, 20000);
  const cash = cashReport(state, { accountId: "cash" });
  assert.equal(cash.transferOut, 5000); assert.equal(cash.transferIn, 0); assert.equal(cash.net, 15000);
  const bank = cashReport(state, { accountId: "bank" });
  assert.equal(bank.income, 0); assert.equal(bank.transferIn, 5000); assert.equal(bank.net, 5000);
  assert.throws(() => addCashTransaction(state, input({ kind: "transfer", toAccountId: "cash" }), "same-account"), /разные/);
});

test("cash: owner's contribution changes funds, not operating receipts", () => {
  let state = addCashTransaction(empty(), input({ kind: "income", categoryId: "income-owner", amount: 20000, reason: "Взнос владельца" }), "owner-contribution");
  state = addCashTransaction(state, input({ kind: "income", categoryId: "income-repair", amount: 10000, reason: "Оплата ремонта" }), "repair-receipt");
  const report = cashReport(state);
  assert.equal(report.income, 30000); assert.equal(report.capitalIn, 20000); assert.equal(report.operatingIncome, 10000);
  assert.equal(report.balance, 30000);
  assert.equal(state.inventory[0].buy, 50000);
});

test("cash: duplicate operation is idempotent and cannot be reused for another amount or reason", () => {
  const state = addCashTransaction(empty(), input({ amount: -5000 }), "repeat-operation");
  assert.equal(addCashTransaction(state, input({ amount: 5000 }), "repeat-operation"), state);
  assert.equal(state.cashTransactions.length, 1); assert.equal(state.cashEvents.length, 1);
  assert.throws(() => addCashTransaction(state, input({ amount: 5001 }), "repeat-operation"), /других данных/);
  assert.throws(() => addCashTransaction(state, input({ amount: 5000, reason: "Иная причина" }), "repeat-operation"), /других данных/);
  const voided = voidCashTransaction(state, state.cashTransactions[0].id, "Ошибка ввода");
  assert.equal(addCashTransaction(voided, input({ amount: 5000 }), "repeat-operation"), voided);
  assert.equal(getAccountBalance(voided, "cash"), 0);
});

test("cash: payroll stores employee/category snapshots; directory edits and archives do not rewrite them", () => {
  let state = saveEmployee(empty(), { name: "Вася", jobTitle: "Мастер", phone: "+7 (701) 012-34-56" });
  const employee = state.employees[0];
  state = addCashTransaction(state, input({ amount: 50000, categoryId: "expense-salary", employeeId: employee.id, reason: "Зарплата за октябрь" }), "salary");
  const original = structuredClone(state.cashTransactions[0]);
  state = saveEmployee(state, { ...employee, name: "Василий", jobTitle: "Старший мастер", archived: true });
  state = saveCashCategory(state, { ...state.cashCategories.find((row) => row.id === "expense-salary"), name: "Оплата труда", archived: true });
  assert.deepEqual(state.cashTransactions[0], original);
  assert.equal(original.employeeName, "Вася"); assert.equal(original.employeeJobTitle, "Мастер"); assert.equal(original.categoryName, "Зарплата");
  assert.equal(getAccountBalance(state, "cash"), -50000);
  assert.throws(() => addCashTransaction(state, input({ categoryId: "expense-salary" }), "archived-category"), /категорию/);
  assert.throws(() => addCashTransaction(state, input({ employeeId: employee.id }), "archived-employee"), /сотрудника/);
  assert.equal(validateCashState(state), state);
  assert.equal(state.cashEvents.at(-1).before.name, "Зарплата");
});

test("cash: correction retains amount and immutable audit snapshots, JSON restores completely", () => {
  const state = addCashTransaction(empty(), input(), "mistyped"), id = state.cashTransactions[0].id;
  const corrected = voidCashTransaction(state, id, "Чек введён два раза");
  assert.equal(state.cashTransactions[0].voided, undefined);
  assert.equal(corrected.cashTransactions[0].amount, 1200);
  assert.equal(corrected.cashTransactions[0].voided, true);
  assert.equal(corrected.cashTransactions[0].voidReason, "Чек введён два раза");
  assert.equal(corrected.cashEvents.at(-1).type, "cash-voided");
  assert.equal(corrected.cashEvents[0].after.voided, undefined);
  assert.equal(cashReport(corrected).expenses, 0); assert.equal(cashReport(corrected).voidCount, 1);
  assert.throws(() => voidCashTransaction(corrected, id, "Повтор"), /уже исправлена/);
  assert.throws(() => voidCashTransaction(state, id, ""), /причина/);
  assert.deepEqual(validateCashState(JSON.parse(JSON.stringify(corrected))), corrected);
});

test("cash: week/month report uses actual dates, inclusive boundaries and opening/closing balance", () => {
  let state = addCashTransaction(empty(), input({ kind: "income", categoryId: "income-owner", amount: 20000, happenedOn: "2026-09-30", reason: "Взнос" }), "sept");
  state = addCashTransaction(state, input({ happenedOn: "2026-10-01", amount: 1200 }), "oct-first");
  state = addCashTransaction(state, input({ happenedOn: "2026-10-28", amount: 5000 }), "oct-last");
  const report = cashReport(state, { from: "2026-10-01", to: "2026-10-28", group: "week" });
  assert.equal(report.count, 2); assert.equal(report.income, 0); assert.equal(report.expenses, 6200);
  assert.equal(report.openingBalance, 20000); assert.equal(report.closingBalance, 13800); assert.equal(report.balance, 13800);
  assert.deepEqual(report.groups.map((row) => row.key), ["2026-10-26", "2026-09-28"]);
  const months = cashReport(state, { group: "month" });
  assert.deepEqual(months.groups.map((row) => row.key), ["2026-10", "2026-09"]);
  assert.equal(cashToday("2026-10-31T20:00:00Z"), "2026-11-01");
});

test("cash: malformed schema, bad references, dates and reasons cannot be accepted", () => {
  for (const value of [{ cashSchemaVersion: 1 }, { ...cashDefaults(), cashSchemaVersion: 2 }, { ...cashDefaults(), cashAccounts: [] }, { ...cashDefaults(), employees: [{}] }]) assert.throws(() => validateCashState(value));
  const state = empty();
  for (const changes of [{ happenedOn: "2026-02-30" }, { happenedOn: "2100-01-01" }, { reason: "" }, { reason: "\u0000" }, { accountId: "unknown" }, { categoryId: "income-sales" }, { employeeId: "unknown" }])
    assert.throws(() => addCashTransaction(state, input(changes), "invalid-request"));
  const next = addCashTransaction(state, input(), "valid");
  const tampered = structuredClone(next); tampered.cashTransactions[0].signedAmount = 1200;
  assert.throws(() => validateCashState(tampered), /знак/);
  const duplicate = structuredClone(next); duplicate.cashTransactions.push({ ...duplicate.cashTransactions[0], id: "another-row" });
  assert.throws(() => validateCashState(duplicate), /Повтор операции/);
  const future = structuredClone(next); future.cashTransactions[0].happenedOn = "2100-01-01";
  assert.throws(() => validateCashState(future), /будущем/);
});

test("cash: employee strings preserve leading zeroes; category updates retain historical kind", () => {
  let state = saveEmployee(empty(), { name: "Тест", jobTitle: "Ремонтник", phone: "00701234567" });
  assert.equal(state.employees[0].phone, "00701234567");
  state = saveEmployee(state, { id: state.employees[0].id, archived: true });
  assert.equal(state.employees[0].phone, "00701234567");
  assert.equal(state.employees[0].jobTitle, "Ремонтник");
  assert.throws(() => saveEmployee(state, { name: "Тест", jobTitle: "Мастер", phone: 7011234567 }));
  assert.throws(() => saveEmployee(state, { name: "", jobTitle: "Мастер" }));
  state = saveCashCategory(state, { name: "Аренда", kind: "expense" });
  const rent = state.cashCategories.at(-1);
  state = addCashTransaction(state, input({ categoryId: rent.id }), "rent");
  assert.throws(() => saveCashCategory(state, { ...rent, kind: "income" }), /Тип используемой категории/);
  assert.throws(() => saveCashCategory(state, { name: "ВОДА", kind: "expense" }), /уже существует/);
});
