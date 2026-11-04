import React, { useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { salesReport, saleDay } from "../domain/sales.js";
import { returnSale, confirmLegacySale } from "../domain/storage.js";
import { businessToday } from "../domain/repairs.js";
import { businessDate, money } from "../domain/valuation.js";
import { safeCell } from "../domain/imports.js";

function presetDates(preset) {
  const today = businessToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: today.slice(0, 7) + "-01", to: today };
  if (preset === "week") {
    const start = new Date(today + "T12:00:00Z");
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return { from: start.toISOString().slice(0, 10), to: today };
  }
  return { from: "", to: "" };
}

function csv(report) {
  const columns = ["operation", "id", "saleId", "itemId", "date", "model", "storage", "ram", "buy", "revenue", "expenses", "method", "returned", "reason"];
  const rows = [
    ...report.sales.map((row) => ({ ...row, operation: "sale", saleId: row.id, date: row.at, reason: row.returnReason ?? "" })),
    ...report.returns.map((row) => ({ ...row, operation: "return", date: row.at, revenue: -row.revenue, expenses: 0 })),
  ];
  return "\uFEFF" + columns.join(";") + "\n" + rows.map((row) => columns.map((key) => safeCell(row[key])).join(";")).join("\n");
}

export default function Sales({ state, commit, notify, onRecoverSales }) {
  const [search, setSearch] = useState(""), [group, setGroup] = useState("day"),
    [period, setPeriod] = useState("all"), [from, setFrom] = useState(""), [to, setTo] = useState(""),
    [showOld, setShowOld] = useState(false), [busyId, setBusyId] = useState(null),
    [legacyId, setLegacyId] = useState(null),
    [legacyForm, setLegacyForm] = useState({ revenue: "", expenses: "", method: "", soldOn: "", reason: "" });
  let report, error;
  try { report = salesReport(state, { from, to, group, search }); }
  catch (failure) { error = failure.message; }
  const changePeriod = (value) => {
    setPeriod(value);
    if (value === "custom") return;
    const next = presetDates(value); setFrom(next.from); setTo(next.to);
  };
  async function registerReturn(row) {
    if (busyId) return;
    const reason = window.prompt(`Полный возврат выручки ${money(row.revenue)}. Укажите причину (сохранится отдельным событием)`);
    if (!reason) return;
    setBusyId(row.id);
    try {
      await commit((previous) => {
        const item = previous.inventory.find((entry) => String(entry.id) === String(row.itemId));
        return returnSale(previous, item?.id ?? row.itemId, reason);
      });
      notify("Возврат зарегистрирован. Продажа сохранена в истории.");
    } catch (failure) { notify(failure.message); }
    finally { setBusyId(null); }
  }
  return <>
    <section className="panel sales-history">
      <h2>История продаж{report ? ` (${report.count})` : ""}</h2>
      {onRecoverSales&&<button onClick={onRecoverSales}>Проверить локальные копии продаж</button>}
      <p>Здесь сохраняются фактические продажи по датам, включая возвращённые товары. Плановая цена и старый статус «Продан» сами по себе не подтверждают сделку. Даты — Asia/Almaty.</p>
      <div className="formgrid">
        <Field label="Поиск в истории продаж" value={search} onChange={setSearch} placeholder="Название модели" />
        <Select label="Период продаж" value={period} onChange={changePeriod} options={[["all", "За всё время"], ["today", "Сегодня"], ["week", "Эта неделя"], ["month", "Этот месяц"], ["custom", "Свой период"]]} />
        <Field label="Продажи с даты" type="date" value={from} onChange={(value) => { setFrom(value); setPeriod("custom"); }} />
        <Field label="Продажи по дату" type="date" value={to} onChange={(value) => { setTo(value); setPeriod("custom"); }} />
        <Select label="Группировка продаж" value={group} onChange={setGroup} options={[["day", "По дням"], ["week", "По неделям"], ["month", "По месяцам"]]} />
      </div>
      {error && <p className="warning" role="alert">{error}</p>}
      {report && <>
        <div className="actions wrap"><Download name="nomad-sales-history.csv" type="text/csv;charset=utf-8" data={csv(report)}>Экспорт истории продаж CSV</Download></div>
        {!!report.warnings?.length && <details><summary>Что требует проверки ({report.warnings.length})</summary>{report.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</details>}
        <div className="stats">
          {[
            ["Подтверждённых продаж за период", report.count],
            ["Возвратов за период", report.returnCount],
            ["Выручка до возвратов", money(report.revenue)],
            ["Возвращено клиентам", money(report.refunds)],
            ["Выручка после возвратов", money(report.netRevenue)],
            ["Прямые расходы продаж", money(report.expenses)],
            [report.unknownCostCount ? "Результат по записям с известным закупом" : "Результат после прямых расходов", money(report.profit)],
          ].map(([label, value]) => <article key={label}><span>{label}</span><strong className={typeof value === "string" && value.startsWith("-") ? "warning" : undefined}>{value}</strong></article>)}
        </div>
        {!!report.unknownCostCount && <p className="warning">У {report.unknownCostCount} продаж неполные сведения о закупе или расходах. Полный результат по ним не рассчитан; выручка показана отдельно.</p>}
        <p className="muted">Возврат здесь означает полный возврат выручки в дату возврата; понесённые расходы сделки остаются расходами. Результат показан до налогов и общих расходов магазина.</p>
      </>}
    </section>
    {report && <>
      <section className="panel" aria-label="Продажи по датам">
        <h2>{group === "day" ? "Продажи по дням" : group === "week" ? "Продажи по неделям" : "Продажи по месяцам"}</h2>
        {!report.groups.length && <p className="empty">За выбранный период подтверждённых операций нет. Выберите «За всё время», чтобы увидеть всю историю.</p>}
        {report.groups.map((row) => <article className="stockcard" key={row.key}>
          <div><h3>{row.label ?? row.key}</h3><p>Продаж: {row.count} · Возвратов: {Array.isArray(row.returns) ? row.returns.length : row.returns ?? 0}</p>
            <p>Выручка: {money(row.revenue)} · Возвращено: {money(row.refunds)} · После возвратов: {money(row.netRevenue)}</p>
            <p>Расходы: {money(row.expenses)} · {row.unknownCostCount ? "Известный результат" : "Результат"}: <b>{money(row.profit)}</b></p>
          </div>
        </article>)}
      </section>
      <section className="panel" aria-label="Список проданных телефонов">
        <h2>Какие устройства проданы</h2>
        {!report.sales.length && <p className="empty">Продаж за выбранный период нет. Фактическая продажа регистрируется в карточке склада с суммой, датой и способом оплаты.</p>}
        {report.sales.map((row) => {
          const current = state.inventory.find((item) => String(item.id) === String(row.itemId) && item.sale && String(item.sale.id) === String(row.id));
          return <article className="stockcard" key={`${row.itemId}:${row.id}`}>
            <div>
              <h3>{row.model || "Модель не сохранилась"}{row.storage ? ` · ${row.storage} ГБ` : ""}{row.ram != null ? ` / ОЗУ ${row.ram} ГБ` : ""}</h3>
              <p>Дата продажи: {row.day ? businessDate(row.at) : "Дата не подтверждена"} · {row.method || "Способ оплаты не сохранился"}</p>
              <p>Фактическая выручка: <b>{money(row.revenue)}</b> · Закуп: {money(row.buy)} · Прямые расходы: {money(row.expenses)}</p>
              <p>{row.buy == null || row.expenses == null ? "Закуп или расходы неизвестны: результат по сделке не рассчитан" : `Результат продажи до возвратов: ${money(row.revenue - row.buy - row.expenses)}`}</p>
              <p><b>{row.returned ? "Возврат зарегистрирован" : "Продажа подтверждена"}</b></p>
              {row.returned && <p>Дата возврата: {saleDay(row.returnAt) ? businessDate(row.returnAt) : "Дата не подтверждена"} · {row.returnReason}</p>}
              {row.missingItem && <p className="muted">Карточка отсутствует на складе; сохранённая сделка остаётся в истории.</p>}
              <details><summary>Номер записи</summary><p style={{ overflowWrap: "anywhere" }}>{row.id}</p></details>
            </div>
            {current && !row.returned && <button disabled={Boolean(busyId)} onClick={() => registerReturn(row)}>{busyId === row.id ? "Сохраняю возврат…" : "Оформить возврат"}</button>}
          </article>;
        })}
      </section>
      {!!report.returns.length && <section className="panel" aria-label="Возвраты по датам"><h2>Возвраты за период</h2>{report.returns.map((row) => <article className="stockcard" key={row.id}><div><h3>{row.model || "Модель не сохранилась"}</h3><p>{businessDate(row.at)} · Возвращено: {money(row.revenue)}</p><p>{row.reason}</p></div></article>)}</section>}
      <section className="panel">
        <button onClick={() => setShowOld((value) => !value)} aria-expanded={showOld}>Проверить старые записи ({report.unconfirmed.length})</button>
        {showOld && <>
          <p>Записи только со статусом «Продан» не содержат подтверждённой суммы и даты. Они сохраняются отдельно и не добавляются в фактическую выручку.</p>
          {!report.unconfirmed.length && <p>Неподтверждённых старых продаж не найдено.</p>}
          {report.unconfirmed.map((row) => <article className="stockcard" key={row.id}>
            <div><h3>{row.model}</h3><p className="warning">Старый статус — сумма и дата не подтверждены</p><p>Плановая витрина: {money(row.sell)} · известный закуп: {money(row.buy)}</p></div>
            <button disabled={Boolean(busyId)} onClick={() => {
              setLegacyId(row.id); setLegacyForm({ revenue: "", expenses: "", method: "", soldOn: "", reason: "" });
            }}>Подтвердить старую продажу</button>
            {legacyId === row.id && <form onSubmit={async (event) => {
              event.preventDefault();
              if (busyId) return;
              setBusyId("legacy:" + row.id);
              try {
                await commit((previous) => confirmLegacySale(previous, row.id, legacyForm.revenue, legacyForm.expenses, legacyForm.method, legacyForm.soldOn, legacyForm.reason));
                setLegacyId(null); notify("Старая продажа подтверждена фактическими данными и сохранена в истории.");
              } catch (failure) { notify(failure.message); }
              finally { setBusyId(null); }
            }}>
              <h4>Подтверждение старой сделки</h4>
              <p>Укажите известные фактические данные. Плановая цена не подставляется как выручка; дата регистрации этой записи сохранится отдельно.</p>
              <fieldset disabled={Boolean(busyId)} className="workspace-controls">
                <div className="formgrid">
                  <Field label="Выручка старой продажи, ₸" type="number" min="0" step="any" value={legacyForm.revenue} onChange={(value) => setLegacyForm((previous) => ({ ...previous, revenue: value }))} required />
                  <Field label="Расходы старой продажи, ₸" type="number" min="0" step="any" value={legacyForm.expenses} onChange={(value) => setLegacyForm((previous) => ({ ...previous, expenses: value }))} required />
                  <Select label="Способ оплаты старой продажи" value={legacyForm.method} onChange={(value) => setLegacyForm((previous) => ({ ...previous, method: value }))} options={[["", "Выберите способ"], "Наличные", "Перевод", "Карта", "Рассрочка"]} />
                  <Field label="Фактическая дата старой продажи" type="date" value={legacyForm.soldOn} max={businessToday()} onChange={(value) => setLegacyForm((previous) => ({ ...previous, soldOn: value }))} required />
                  <Field label="Основание подтверждения старой продажи" value={legacyForm.reason} onChange={(value) => setLegacyForm((previous) => ({ ...previous, reason: value }))} placeholder="Например, чек или запись о переводе" required />
                </div>
                <div className="actions wrap"><button type="submit" className="primary">Сохранить фактическую старую продажу</button><button type="button" onClick={() => setLegacyId(null)}>Отмена подтверждения</button></div>
              </fieldset>
            </form>}
          </article>)}
        </>}
      </section>
    </>}
  </>;
}
