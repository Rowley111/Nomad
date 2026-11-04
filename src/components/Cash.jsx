import React, { useRef, useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { money, businessDate } from "../domain/valuation.js";
import { safeCell } from "../domain/imports.js";
import {
  ensureCashState, cashToday, cashReport, getAccountBalance, addCashTransaction,
  voidCashTransaction, saveCashCategory,
} from "../domain/cash.js";

const uid = () => crypto.randomUUID();
const kindNames = { income: "Приход", expense: "Расход", transfer: "Перевод" };
const emptyForm = () => ({ kind: "expense", accountId: "cash", toAccountId: "bank", amount: "", categoryId: "expense-other", employeeId: "", happenedOn: cashToday(), reason: "" });
const emptyCategory = () => ({ name: "", kind: "expense", archived: false, capital: false });

function cashCSV(rows, accounts) {
  const columns = ["id", "operation", "date", "account", "toAccount", "amount", "signedAmount", "category", "employee", "reason", "voided", "voidReason"];
  return "\uFEFF" + columns.join(";") + "\n" + rows.map((row) => {
    const value = { id: row.id, operation: row.kind, date: row.happenedOn,
      account: accounts.find((item) => item.id === row.accountId)?.name ?? row.accountId,
      toAccount: accounts.find((item) => item.id === row.toAccountId)?.name ?? "",
      amount: row.amount, signedAmount: row.signedAmount, category: row.categoryName ?? "", employee: row.employeeName ?? "",
      reason: row.reason, voided: Boolean(row.voided), voidReason: row.voidReason ?? "" };
    return columns.map((key) => safeCell(value[key])).join(";");
  }).join("\n");
}

function Categories({ state, commit, notify }) {
  const data = ensureCashState(state);
  const [form, setForm] = useState(emptyCategory), [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  async function save(event) {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await commit((previous) => saveCashCategory(previous, form));
      setForm(emptyCategory()); notify("Категория сохранена. Названия прежних операций сохранены в истории.");
    } catch (error) { notify(error.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <details className="panel cash-categories">
    <summary>Категории прихода и расхода</summary>
    <form onSubmit={save} aria-label="Категория кассы">
      <fieldset disabled={busy} className="workspace-controls">
        <div className="formgrid">
          <Field label="Название категории" value={form.name} required maxLength="120" onChange={(name) => setForm((previous) => ({ ...previous, name }))} />
          <Select label="Вид категории" value={form.kind} options={[["expense", "Расход"], ["income", "Приход"]]} onChange={(kind) => setForm((previous) => ({ ...previous, kind, capital: kind === "income" && previous.capital }))} />
        </div>
        {form.kind === "income" && <label className="check"><input type="checkbox" checked={form.capital} onChange={(event) => setForm((previous) => ({ ...previous, capital: event.target.checked }))} />Взнос / пополнение владельца, не выручка от работы</label>}
        {form.id && <label className="check"><input type="checkbox" checked={form.archived} onChange={(event) => setForm((previous) => ({ ...previous, archived: event.target.checked }))} />Категория в архиве</label>}
        <div className="actions wrap"><button type="submit">{busy ? "Сохраняю…" : "Сохранить категорию"}</button>{form.id && <button type="button" onClick={() => setForm(emptyCategory())}>Новая категория</button>}</div>
      </fieldset>
    </form>
    <div className="cash-category-list">{data.cashCategories.map((row) => <div className="cash-category" key={row.id}>
      <span>{kindNames[row.kind]} · {row.name}{row.archived ? " · в архиве" : ""}</span>
      <button type="button" disabled={busy} aria-label={`Редактировать категорию ${row.name} (${kindNames[row.kind]})`} onClick={() => setForm({ ...row, capital: Boolean(row.capital) })}>Редактировать</button>
    </div>)}</div>
  </details>;
}

export default function Cash({ state, commit, notify, adminEdit = true, storageMode = "local" }) {
  const data = ensureCashState(state);
  const [form, setForm] = useState(emptyForm), [operationId, setOperationId] = useState(uid),
    [busy, setBusy] = useState(false), [accountId, setAccountId] = useState(""),
    [from, setFrom] = useState(""), [to, setTo] = useState(""), [group, setGroup] = useState("day"),
    [search, setSearch] = useState("");
  const busyRef = useRef(false);
  const activeAccounts = data.cashAccounts.filter((row) => !row.archived);
  const categories = data.cashCategories.filter((row) => !row.archived && row.kind === form.kind);
  const employees = data.employees.filter((row) => !row.archived);
  const balances = data.cashAccounts.map((row) => ({ ...row, balance: getAccountBalance(data, row.id) }));
  let report, error;
  try { report = cashReport(data, { from, to, group, accountId }); }
  catch (failure) { error = failure.message; }
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const rows = (report?.transactions ?? []).filter((row) => !query || `${row.reason} ${row.categoryName ?? ""} ${row.employeeName ?? ""}`.toLocaleLowerCase("ru-RU").includes(query))
    .slice().sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt));
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  function chooseKind(kind) {
    const first = data.cashCategories.find((row) => !row.archived && row.kind === kind);
    setForm((previous) => ({ ...previous, kind, categoryId: first?.id ?? "" }));
  }
  function chooseAccount(id) {
    setAccountId(id);
    if (id) setForm((previous) => ({ ...previous, accountId: id,
      toAccountId: previous.toAccountId === id ? activeAccounts.find((row) => row.id !== id)?.id ?? "" : previous.toAccountId }));
  }
  async function save(event) {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await commit((previous) => addCashTransaction(previous, form, operationId));
      setForm((previous) => ({ ...previous, amount: "", reason: "" }));
      setOperationId(uid()); notify("Денежная операция сохранена");
    } catch (failure) { notify(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function correct(row) {
    if (busyRef.current) return;
    const reason = window.prompt("Причина исправления операции. Исходная запись останется в истории.");
    if (!reason) return;
    busyRef.current = true; setBusy(true);
    try {
      await commit((previous) => voidCashTransaction(previous, row.id, reason));
      notify("Операция исправлена отдельной записью; исходная сумма сохранена в истории");
    } catch (failure) { notify(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (storageMode === "cloud" && !state.cashSchemaVersion) return <section className="panel">
    <h2>Начало кассового учёта</h2>
    <p>Кассовый учёт в общей базе ещё не начат. При запуске касса и банк получают нулевые остатки; прежние продажи и ремонты не превращаются в деньги на счетах.</p>
    {adminEdit ? <button type="button" className="primary" disabled={busy} onClick={async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true);
      try { await commit(ensureCashState); notify("Кассовый учёт начат с нуля"); }
      catch (failure) { notify(failure.message); }
      finally { busyRef.current = false; setBusy(false); }
    }}>{busy ? "Сохраняю…" : "Начать кассовый учёт с нуля"}</button> : <p>Кассовый учёт сначала должен начать администратор.</p>}
  </section>;
  return <div className="cash-workspace">
    <section className="panel">
      <h2>Касса и банк</h2>
      <p>Внутренний учёт денежных операций. Настоящий банковский счёт не подключён. Начальные остатки — 0 ₸; старые продажи не подставляются в кассу.</p>
      <p className="muted">{storageMode === "cloud" ? "Общая база" : "Данные в этом браузере"} · Даты — Asia/Almaty</p>
      <div className="cash-balances">{balances.map((row) => <article className="cash-balance" key={row.id} data-account={row.id}>
        <span>{row.name} · текущий остаток</span><strong className={row.balance < 0 ? "cash-negative" : ""}>{money(row.balance)}</strong>
        {row.balance < 0 && <p className="cash-negative">Учётный минус: {money(Math.abs(row.balance))}</p>}
      </article>)}</div>
      <div className="actions wrap cash-account-tabs">
        <button type="button" className={!accountId ? "primary" : ""} onClick={() => chooseAccount("")}>Все счета</button>
        {data.cashAccounts.map((row) => <button type="button" key={row.id} className={accountId === row.id ? "primary" : ""} onClick={() => chooseAccount(row.id)}>{row.name}</button>)}
      </div>
    </section>
    <section className="panel">
      <h2>Записать движение денег</h2>
      <form onSubmit={save} aria-label="Денежная операция">
        <fieldset disabled={busy} className="workspace-controls">
          <div className="formgrid">
            <Select label="Вид денежной операции" value={form.kind} onChange={chooseKind} options={[["income", "Приход"], ["expense", "Расход"], ["transfer", "Перевод между счетами"]]} />
            <Select label={form.kind === "transfer" ? "Со счёта" : "Счёт операции"} value={form.accountId} onChange={(value) => {
              setForm((previous) => ({ ...previous, accountId: value, toAccountId: previous.toAccountId === value ? activeAccounts.find((row) => row.id !== value)?.id ?? "" : previous.toAccountId }));
            }} options={activeAccounts.map((row) => [row.id, row.name])} />
            {form.kind === "transfer" && <Select label="На счёт" value={form.toAccountId} onChange={(value) => update("toAccountId", value)} options={activeAccounts.filter((row) => row.id !== form.accountId).map((row) => [row.id, row.name])} />}
            <Field label="Сумма денежной операции, ₸" value={form.amount} onChange={(value) => update("amount", value)} type="number" step="0.01" min={form.kind === "expense" ? undefined : "0.01"} required />
            <Field label="Дата денежной операции" value={form.happenedOn} onChange={(value) => update("happenedOn", value)} type="date" required />
            {form.kind !== "transfer" && <Select label="Категория денежной операции" value={form.categoryId} onChange={(value) => update("categoryId", value)} options={categories.length ? categories.map((row) => [row.id, row.name]) : [["", "Добавьте категорию"]]} />}
            <Select label="Сотрудник операции (необязательно)" value={form.employeeId} onChange={(value) => update("employeeId", value)} options={[["", "Без сотрудника"], ...employees.map((row) => [row.id, `${row.name} · ${row.jobTitle}`])]} />
            <Field label="Причина денежной операции" value={form.reason} onChange={(value) => update("reason", value)} required maxLength="2000" placeholder="На что потратили или откуда поступили деньги" />
          </div>
          {form.kind === "expense" && <p className="muted">Расход можно ввести как 1200 или −1200: деньги вычтутся один раз. Минус на счёте показывается отдельно.</p>}
          <p className="source-note">Здесь операции записываются вручную. Оплаты, материалы и продажи из других разделов автоматически не дублируются. Движение денег и прибыль — разные показатели.</p>
          <button type="submit" className="primary">{busy ? "Сохраняю…" : "Записать денежную операцию"}</button>
        </fieldset>
      </form>
    </section>
    <section className="panel">
      <h2>История денег</h2>
      <div className="formgrid cash-report-filters">
        <Field label="Деньги с даты" type="date" value={from} onChange={setFrom} />
        <Field label="Деньги по дату" type="date" value={to} onChange={setTo} />
        <Select label="Группировка денег" value={group} onChange={setGroup} options={[["day", "По дням"], ["week", "По неделям"], ["month", "По месяцам"]]} />
        <Field label="Поиск в денежных операциях" value={search} onChange={setSearch} />
      </div>
      {error ? <p role="alert">{error}</p> : <>
        <div className="cash-period-summary">
          <div><span>Приход за период</span><strong>{money(report.income)}</strong></div>
          <div><span>Расход за период</span><strong>{money(report.expenses)}</strong></div>
          <div><span>Остаток на начало периода</span><strong>{money(report.openingBalance)}</strong></div>
          <div><span>Остаток на конец периода</span><strong className={report.closingBalance < 0 ? "cash-negative" : ""}>{money(report.closingBalance)}</strong></div>
        </div>
        <p className="muted">Взносы владельца в приходе: {money(report.capitalIn)}. Переводы показаны отдельно и не являются расходом магазина или новой выручкой.</p>
        <div className="cash-periods">{report.groups.map((row) => <article key={row.key}><h3>{row.label}</h3><p>Приход: {money(row.income)} · Расход: {money(row.expenses)} · Переводы: +{money(row.transferIn)} / −{money(row.transferOut)}</p><p>Движение за период: <b className={row.net < 0 ? "cash-negative" : ""}>{money(row.net)}</b></p></article>)}</div>
        <Download name="nomad-cash-ledger.csv" type="text/csv;charset=utf-8" data={cashCSV(rows, data.cashAccounts)}>Экспорт денежных операций CSV</Download>
        <p className="muted">Записей по поиску: {rows.length}. Итоги выше относятся ко всему выбранному счёту и периоду.</p>
        <div className="cash-ledger">{rows.map((row) => <article className={`cash-row${row.voided ? " cash-voided" : ""}`} key={row.id}>
          <div><p className="cash-row-meta">{businessDate(row.happenedOn)} · {kindNames[row.kind]} · {data.cashAccounts.find((account) => account.id === row.accountId)?.name ?? row.accountId}{row.kind === "transfer" ? ` → ${data.cashAccounts.find((account) => account.id === row.toAccountId)?.name ?? row.toAccountId}` : ""}</p><h3>{row.reason}</h3><p>{row.categoryName ?? "Перевод между своими счетами"}{row.employeeName ? ` · ${row.employeeName} · ${row.employeeJobTitle ?? ""}` : ""}</p></div>
          <strong className={row.kind === "expense" && !row.voided ? "cash-negative" : row.kind === "income" ? "cash-positive" : ""}>{row.kind === "expense" ? "−" : row.kind === "income" ? "+" : ""}{money(row.amount)}</strong>
          {row.voided ? <p className="muted">Исправлена: {row.voidReason}</p> : <button type="button" disabled={busy} onClick={() => correct(row)}>Исправить денежную операцию</button>}
        </article>)}</div>
        {!rows.length && <p>Денежных операций за выбранный период пока нет.</p>}
      </>}
    </section>
    {adminEdit && <Categories state={state} commit={commit} notify={notify} />}
  </div>;
}
