import React, { useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { recordSale, returnSale, uid } from "../domain/storage.js";
import { amount, money, businessDate } from "../domain/valuation.js";
import { safeCell } from "../domain/imports.js";
import Sales from "./Sales.jsx";
import { getSalesHistory, saleToday } from "../domain/sales.js";
const statuses = ["В наличии", "На диагностике/ремонте", "Резерв"];
export default function Inventory({ state, commit, notify, sales = false, storageMode = "local", onRecoverSales }) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [revenue, setRevenue] = useState(""),
    [expenses, setExpenses] = useState("0"),
    [method, setMethod] = useState("Наличные"),
    [soldOn, setSoldOn] = useState(saleToday()),
    [editing, setEditing] = useState(null);
  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    }
  };
  const rows = state.inventory.filter(
    (x) =>
      (!sales || x.status === "Продан") &&
      x.model.toLowerCase().includes(search.toLowerCase()),
  );
  const cols = [
    "id",
    "model",
    "storage",
    "ram",
    "buy",
    "sell",
    "status",
    "date",
    "note",
  ];
  if (sales) return <Sales state={state} commit={commit} notify={notify} onRecoverSales={onRecoverSales} />;
  const recovered = new Set(getSalesHistory(state).sales.filter((row) => !row.returned).map((row) => String(row.itemId)));
  return (
    <section className="panel">
      <div className="sectionhead">
        <h2>
          {sales ? "Продажи" : "Склад"} ({rows.length})
        </h2>
        <div className="actions wrap">
          <Field label="Поиск модели" value={search} onChange={setSearch} />
          <Download
            name="nomad-inventory.csv"
            type="text/csv;charset=utf-8"
            data={
              "\uFEFF" +
              cols.join(";") +
              "\n" +
              rows
                .map((x) => cols.map((k) => safeCell(x[k])).join(";"))
                .join("\n")
            }
          >
            Экспорт CSV
          </Download>
        </div>
      </div>
      {rows.map((x) => (
        <article className="stockcard" key={x.id}>
          <div>
            <h3>
              {x.model} · {x.ram ?? "—"}/{x.storage} ГБ
            </h3>
            <p>
              {x.condition ?? ({ideal:'Идеальное',good:'Хорошее',worn:'Заметный износ'}[x.body])} · {x.box ? "Коробка есть" : "Без коробки"}{" "}
              · {x.note}
            </p>
            <p>
              Закуп: {money(Number(x.buy))} · План: {money(Number(x.sell))}
            </p>
            <p>
              Дата закупа: {businessDate(x.date)} · Дней на складе:{" "}
              {x.date && Number.isFinite(Date.parse(x.date))
                ? Math.max(
                    0,
                    Math.floor(
                      ((x.sale ? Date.parse(x.sale.at) : Date.now()) -
                        Date.parse(x.date)) /
                        86400000,
                    ),
                  )
                : "Нет данных"}
            </p>
            <p>{x.status}</p>
            {!x.sale && recovered.has(String(x.id)) && <p className="warning">Подтверждённая продажа найдена в журнале. Она сохранена в разделе «Продажи»; повторную сделку создавать не нужно.</p>}
            {x.sale ? (
              <p>
                Фактическая выручка: {money(x.sale.revenue)} · Расходы:{" "}
                {money(x.sale.expenses)} · Результат до общих расходов и
                налогов:{" "}
                {money(x.sale.revenue - Number(x.buy) - x.sale.expenses)} ·{" "}
                {x.sale.method} · {businessDate(x.sale.at)}
              </p>
            ) : x.status === "Продан" ? (
              <p className="warning">
                Старый статус «Продан»: фактическая сумма и дата не
                подтверждены; в реализованный результат не включён.
              </p>
            ) : null}
          </div>
          <div className="actions wrap">
            {!x.sale && x.status !== "Продан" && !recovered.has(String(x.id)) && (
              <>
                <Select
                  label="Статус"
                  value={x.status}
                  options={statuses}
                  onChange={(v) =>
                    run(async () =>
                      await commit((s) => ({
                        ...s,
                        inventory: s.inventory.map((i) =>
                          i.id === x.id ? { ...i, status: v } : i,
                        ),
                        events: [
                          ...s.events,
                          {
                            id: uid(),
                            type: "status",
                            itemId: x.id,
                            before: x.status,
                            after: v,
                            at: new Date().toISOString(),
                          },
                        ],
                      })),
                    )
                  }
                />
                <button
                  onClick={() => {
                    setSelected(x.id);
                    setRevenue("");
                    setExpenses("0");
                    setSoldOn(saleToday());
                  }}
                >
                  Зарегистрировать продажу
                </button>
                <button onClick={() => setEditing({ ...x })}>
                  Изменить карточку
                </button>
              </>
            )}
            {x.sale && (
              <button
                onClick={() => {
                  const reason = window.prompt(
                    "Причина возврата (будет сохранена в истории)",
                  );
                  if (reason)
                    run(async () => commit((s) => returnSale(s, x.id, reason)));
                }}
              >
                Оформить возврат
              </button>
            )}
            <button
              className="danger"
              disabled={!!x.sale || storageMode === "cloud"}
              title={storageMode === "cloud" ? "В общей базе удаление запрещено: история закупки сохраняется" : undefined}
              onClick={() => {
                if (
                  window.confirm(
                    "Удалить карточку? Резервная копия текущего состояния будет сохранена.",
                  )
                )
                  run(async () =>
                    await commit((s) => ({
                      ...s,
                      inventory: s.inventory.filter((i) => i.id !== x.id),
                      events: [
                        ...s.events,
                        {
                          id: uid(),
                          type: "delete",
                          item: x,
                          at: new Date().toISOString(),
                        },
                      ],
                    })),
                  );
              }}
            >
              Удалить
            </button>
          </div>
          {selected === x.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await commit((s) => recordSale(s, x.id, revenue, expenses, method, soldOn));
                  setSelected(null);
                  notify("Продажа зарегистрирована");
                });
              }}
            >
              <h3>Подтверждение продажи</h3>
              <div className="formgrid">
                <Field label="Фактическая дата продажи" value={soldOn} type="date" max={saleToday()} onChange={setSoldOn} required />
                <Field
                  label="Фактическая выручка, ₸"
                  value={revenue}
                  type="number"
                  min="0"
                  onChange={setRevenue}
                  required
                />
                <Field
                  label="Прямые расходы сделки, ₸ (включая комиссию банка)"
                  value={expenses}
                  type="number"
                  min="0"
                  onChange={setExpenses}
                  required
                />
                <Select
                  label="Способ оплаты"
                  value={method}
                  onChange={setMethod}
                  options={["Наличные", "Перевод", "Карта", "Рассрочка"]}
                />
              </div>
              <button type="submit" className="primary">
                Подтвердить продажу
              </button>
              <button type="button" onClick={() => setSelected(null)}>
                Отмена
              </button>
            </form>
          )}
          {editing?.id === x.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  amount(editing.sell);
                  await commit((s) => ({
                    ...s,
                    inventory: s.inventory.map((i) =>
                      i.id === x.id
                        ? {
                            ...i,
                            sell: Number(editing.sell),
                            note: editing.note,
                          }
                        : i,
                    ),
                    events: [
                      ...s.events,
                      {
                        id: uid(),
                        type: "edit",
                        itemId: x.id,
                        before: x,
                        after: editing,
                        at: new Date().toISOString(),
                      },
                    ],
                  }));
                  setEditing(null);
                });
              }}
            >
              <Field
                label="Плановая цена"
                type="number"
                min="0"
                value={editing.sell}
                onChange={(v) => setEditing((i) => ({ ...i, sell: v }))}
              />
              <Field
                label="Примечание"
                value={editing.note}
                onChange={(v) => setEditing((i) => ({ ...i, note: v }))}
              />
              <button type="submit">Сохранить</button>
              <button type="button" onClick={() => setEditing(null)}>
                Отмена
              </button>
              <p>
                Закуп и история сделки сохраняются; исправление продажи
                оформляется возвратом и новой продажей.
              </p>
            </form>
          )}
          {x.snapshot && (
            <details>
              <summary>Снимок оценки при закупке</summary>
              <pre>{JSON.stringify(x.snapshot, null, 2)}</pre>
            </details>
          )}
        </article>
      ))}
      {!rows.length && (
        <p className="empty">
          Устройств пока нет. Оформите закупку в оценщике.
        </p>
      )}
      <details>
        <summary>Журнал событий ({state.events.length})</summary>
        <pre>{JSON.stringify(state.events, null, 2)}</pre>
      </details>
    </section>
  );
}
