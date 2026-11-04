import React, { useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { money } from "../domain/valuation.js";
import { safeCell } from "../domain/imports.js";
import {
  addRepairLoss,
  voidRepairLoss,
  businessToday,
  ensureRepairState,
} from "../domain/repairs.js";
const uid = () => crypto.randomUUID();
export function RepairLossForm({ state, commit, notify, orderId }) {
  const [form, setForm] = useState({
      amount: "",
      lostOn: businessToday(),
      reason: "",
      orderId: orderId ?? "",
    }),
    [operationId, setOperationId] = useState(uid);
  return (
    <form
      aria-label="Запись убытка"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await commit((s) =>
            addRepairLoss(
              s,
              { ...form, orderId: orderId || form.orderId || undefined },
              operationId,
            ),
          );
          setForm((x) => ({ ...x, amount: "", reason: "" }));
          setOperationId(uid());
          notify("Убыток записан и учтён в результате");
        } catch (error) {
          notify(error.message);
        }
      }}
    >
      <div className="formgrid">
        <Field
          label="Сумма убытка, ₸"
          type="number"
          step="0.01"
          value={form.amount}
          onChange={(v) => setForm((x) => ({ ...x, amount: v }))}
          placeholder="-5000"
          required
        />
        <Field
          label="Дата убытка"
          type="date"
          value={form.lostOn}
          onChange={(v) => setForm((x) => ({ ...x, lostOn: v }))}
          required
        />
        <Field
          label="Причина убытка"
          value={form.reason}
          onChange={(v) => setForm((x) => ({ ...x, reason: v }))}
          required
        />
        {!orderId && (
          <Select
            label="Связать с заказом"
            value={form.orderId}
            options={[
              ["", "Общий убыток / без заказа"],
              ...ensureRepairState(state).repairOrders.map((x) => [
                x.id,
                `${x.device} · ${x.receivedOn}`,
              ]),
            ]}
            onChange={(v) => setForm((x) => ({ ...x, orderId: v }))}
          />
        )}
      </div>
      <p className="source-note">
        Можно ввести −5000 или 5000: запишется убыток −5 000 ₸. Он уменьшит
        результат по своей дате. Не дублируйте здесь материалы, расходы и
        возвраты, уже добавленные в заказ.
      </p>
      <button className="primary" type="submit">
        Записать убыток
      </button>
    </form>
  );
}
export function RepairLossRows({ state, commit, notify, orderId }) {
  const rows = (state.repairLosses ?? [])
    .filter((x) => !orderId || x.orderId === orderId)
    .slice()
    .sort(
      (a, b) =>
        b.lostOn.localeCompare(a.lostOn) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <div className="loss-list">
      {rows.map((row) => {
        const order = (state.repairOrders ?? []).find(
          (x) => x.id === row.orderId,
        );
        return (
          <article
            className={"loss-row " + (row.voided ? "loss-voided" : "")}
            key={row.id}
          >
            <div>
              <b className="red">{money(row.amount)}</b>
              <p>
                {row.lostOn} · {row.reason}
              </p>
              <small>
                {order ? `Заказ: ${order.device}` : "Общий убыток / без заказа"}
              </small>
              {row.voided && <p>Запись исключена: {row.voidReason}</p>}
            </div>
            {!row.voided && (
              <button
                onClick={async () => {
                  const reason = window.prompt(
                    "Причина исправления. Запись останется в истории.",
                  );
                  if (!reason) return;
                  try {
                    await commit((s) => voidRepairLoss(s, row.id, reason));
                    notify(
                      "Ошибочная запись исключена из расчёта с сохранением истории",
                    );
                  } catch (error) {
                    notify(error.message);
                  }
                }}
              >
                Исправить запись
              </button>
            )}
          </article>
        );
      })}
      {!rows.length && <p>Убытков пока не записано.</p>}
    </div>
  );
}
export default function RepairLosses({ state, commit, notify }) {
  const rows = state.repairLosses ?? [],
    sum = rows
      .filter((x) => !x.voided)
      .reduce((total, x) => total + x.amount, 0);
  const cols = [
    "id",
    "lostOn",
    "amount",
    "reason",
    "orderId",
    "voided",
    "voidReason",
  ];
  const csv =
    "\uFEFF" +
    cols.join(";") +
    "\n" +
    rows.map((x) => cols.map((k) => safeCell(x[k])).join(";")).join("\n");
  return (
    <section className="panel loss-ledger">
      <div className="sectionhead">
        <div>
          <h2>Учёт убытков</h2>
          <p>
            Потеряли деньги на работе, испортили деталь или возникли другие
            потери — запишите сумму, дату и причину.
          </p>
        </div>
        <Download
          name="nomad-repair-losses.csv"
          type="text/csv;charset=utf-8"
          data={csv}
        >
          Экспорт убытков CSV
        </Download>
      </div>
      <div className="price-summary">
        <span>Записанные убытки за всё время</span>
        <strong className="red">{money(sum)}</strong>
      </div>
      <p className="source-note">
        Это сумма отдельных потерь. Фактический плюс или минус с учётом всех
        оплат и расходов смотрите в «Отчёте по ремонтам».
      </p>
      <RepairLossForm state={state} commit={commit} notify={notify} />
      <h3>Список записей</h3>
      <RepairLossRows state={state} commit={commit} notify={notify} />
    </section>
  );
}
