import React, { useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { money } from "../domain/valuation.js";
import { repairReport, businessToday } from "../domain/repairs.js";
import { safeCell } from "../domain/imports.js";
function periodDates(preset) {
  const today = businessToday(),
    d = new Date(today + "T12:00:00Z"),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth();
  if (preset === "all") return { from: "", to: "" };
  if (preset === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (preset === "previous-month")
    return {
      from: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  return { from: today.slice(0, 7) + "-01", to: today };
}
function groupByLabel(p) {
  return /^\d{4}-\d{2}$/.test(p.key)
    ? new Intl.DateTimeFormat("ru-RU", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(p.key + "-01T00:00:00Z"))
    : p.from.slice(8) + "." + p.from.slice(5, 7);
}
function RepairChart({ series }) {
  const [selected, setSelected] = useState(null);
  const points = series.slice(-12);
  if (!points.length)
    return (
      <p className="empty">
        За выбранный период операций нет. График появится после оплаты или
        расхода.
      </p>
    );
  const max = Math.max(
      1,
      ...points.flatMap((p) => [p.received, p.expenses, p.profit]),
    ),
    min = Math.min(
      0,
      ...points.flatMap((p) => [p.profit, p.received, p.expenses]),
    ),
    top = 26,
    bottom = 220,
    left = 76,
    right = 940,
    slot = (right - left) / points.length;
  const y = (value) => top + ((max - value) / (max - min)) * (bottom - top);
  const zero = y(0),
    chosen = points.find((p) => p.key === selected) ?? points.at(-1);
  const choose = (p) => setSelected(p.key);
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="chart-income" />
          Получено после возвратов
        </span>
        <span>
          <i className="chart-expense" />
          Материалы, расходы и убытки
        </span>
        <span>
          <i className="chart-profit" />
          Заработок после расходов
        </span>
      </div>
      <div className="repair-chart-scroll">
        <svg
          className="repair-chart"
          viewBox="0 0 960 280"
          role="img"
          aria-label="График доходов и расходов ремонтов"
        >
          <title>
            Фактические поступления, прямые расходы и результат за период
          </title>
          {[max, 0, ...(min < 0 ? [min] : [])].map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={right}
                y1={y(v)}
                y2={y(v)}
                stroke="#344463"
                strokeDasharray={v === 0 ? undefined : "4 6"}
              />
              <text
                x={left - 8}
                y={y(v) + 4}
                textAnchor="end"
                fill="#b9c7df"
                fontSize="12"
              >
                {new Intl.NumberFormat("ru-RU", {
                  maximumFractionDigits: 0,
                }).format(v)}
              </text>
            </g>
          ))}
          {points.map((p, index) => {
            const x = left + slot * (index + 0.5),
              bar = Math.min(24, slot * 0.25);
            return (
              <g
                key={p.key}
                role="button"
                aria-label={`${p.label}: получено ${money(p.received)}, расходы ${money(p.expenses)}, результат ${money(p.profit)}`}
                tabIndex="0"
                onClick={() => choose(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(p);
                  }
                }}
              >
                <title>
                  {p.label}: {money(p.received)} − {money(p.expenses)} ={" "}
                  {money(p.profit)}
                </title>
                <rect
                  x={x - bar - 2}
                  y={Math.min(zero, y(p.received))}
                  width={bar}
                  height={Math.max(1, Math.abs(zero - y(p.received)))}
                  fill="#819aff"
                  rx="3"
                />
                <rect
                  x={x + 2}
                  y={y(p.expenses)}
                  width={bar}
                  height={Math.max(1, zero - y(p.expenses))}
                  fill="#efb46b"
                  rx="3"
                />
                <text
                  x={x}
                  y={250}
                  textAnchor="middle"
                  fill="#becbe0"
                  fontSize="11"
                >
                  {groupByLabel(p)}
                </text>
              </g>
            );
          })}
          <polyline
            pointerEvents="none"
            fill="none"
            stroke="#72d3ab"
            strokeWidth="3"
            points={points
              .map((p, i) => `${left + slot * (i + 0.5)},${y(p.profit)}`)
              .join(" ")}
          />
          {points.map((p, i) => (
            <circle
              key={p.key}
              cx={left + slot * (i + 0.5)}
              cy={y(p.profit)}
              r={chosen?.key === p.key ? 6 : 4}
              fill="#72d3ab"
              pointerEvents="none"
            />
          ))}
        </svg>
      </div>
      <p className="source-note">
        Нажмите на столбец или выберите его клавиатурой.{" "}
        {series.length > 12
          ? "Показаны последние 12 периодов; итоговые суммы учитывают весь выбранный диапазон."
          : ""}
      </p>
      {chosen && (
        <div className="price-summary" role="status">
          <b>{chosen.label}</b>
          <span>
            Получено: {money(chosen.received)} · Расходы:{" "}
            {money(chosen.expenses)} · Результат: {money(chosen.profit)}
          </span>
        </div>
      )}
    </>
  );
}
export default function RepairReport({ state }) {
  const [preset, setPreset] = useState("month"),
    [range, setRange] = useState(() => periodDates("month")),
    [groupBy, setGroupBy] = useState("month");
  let report, error;
  try {
    report = repairReport(state, { ...range, groupBy });
  } catch (e) {
    error = e.message;
  }
  const fields = [
    "key",
    "label",
    "received",
    "refunded",
    "materials",
    "costs",
    "losses",
    "expenses",
    "profit",
  ];
  const csv = report
    ? "\uFEFF" +
      fields.join(";") +
      "\n" +
      report.series
        .map((row) => fields.map((k) => safeCell(row[k])).join(";"))
        .join("\n")
    : "";
  return (
    <>
      <section className="panel">
        <h2>Деньги по ремонтам</h2>
        <p className="source-note">
          Фактические оплаты и возвраты учитываются по дате оплаты, материалы и
          расходы — по дате расхода. Согласованные суммы не считаются
          заработком. Даты — Asia/Almaty; недели с понедельника.
        </p>
        <div className="formgrid report-filters">
          <Select
            label="Период отчёта"
            value={preset}
            onChange={(v) => {
              setPreset(v);
              if (v !== "custom") setRange(periodDates(v));
            }}
            options={[
              ["month", "Этот месяц"],
              ["week", "Эта неделя"],
              ["previous-month", "Прошлый месяц"],
              ["all", "За всё время"],
              ["custom", "Выбрать даты"],
            ]}
          />
          <Select
            label="Группировка"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              ["month", "По месяцам"],
              ["week", "По неделям"],
            ]}
          />
          <Field
            label="С даты"
            type="date"
            value={range.from}
            onChange={(v) => {
              setPreset("custom");
              setRange((x) => ({ ...x, from: v }));
            }}
          />
          <Field
            label="По дату"
            type="date"
            value={range.to}
            onChange={(v) => {
              setPreset("custom");
              setRange((x) => ({ ...x, to: v }));
            }}
          />
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      {report && (
        <>
          <div className="stats repair-stats">
            {[
              ["Получено от клиентов (после возвратов)", report.received],
              ["Стоимость материалов", report.materials],
              ["Другие прямые расходы", report.costs],
              ["Убытки", report.losses ? -report.losses : 0],
              ["Заработок после прямых расходов", report.profit],
              ["Возвращено клиентам", report.refunded],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong className={value < 0 ? "red" : ""}>
                  {money(value)}
                </strong>
              </article>
            ))}
          </div>
          {report.profit < 0 && (
            <p className="warning loss-deficit">
              В минусе: {money(Math.abs(report.profit))} за выбранный период.
            </p>
          )}
          <section className="panel">
            <div className="sectionhead">
              <div>
                <h2>
                  {groupBy === "week"
                    ? "Заработок по неделям"
                    : "Заработок по месяцам"}
                </h2>
                <p>
                  Принято заказов: {report.orderCount} · Выдано:{" "}
                  {report.completedCount}
                </p>
              </div>
              <Download
                name="nomad-repair-report.csv"
                type="text/csv;charset=utf-8"
                data={csv}
              >
                Экспорт отчёта CSV
              </Download>
            </div>
            <RepairChart series={report.series} />
            <p className="source-note">
              Это поступления за вычетом прямых расходов и убытков, включая
              авансы. Налоги и общие расходы магазина не учтены. Статус заказа
              не создаёт оплату и не отменяет реальные расходы.
            </p>
            <div className="repair-period-list">
              {report.series.map((row) => (
                <article key={row.key}>
                  <b>{row.label}</b>
                  <span>Получено: {money(row.received)}</span>
                  <span>
                    Материалы: {money(row.materials)} · Другие расходы:{" "}
                    {money(row.costs)} · Убытки:{" "}
                    {money(row.losses ? -row.losses : 0)}
                  </span>
                  <strong className={row.profit < 0 ? "red" : "green"}>
                    Заработок: {money(row.profit)}
                  </strong>
                </article>
              ))}
            </div>
            {!report.series.length && <p>Записей за этот период пока нет.</p>}
          </section>
        </>
      )}
    </>
  );
}
