import React, { useState } from "react";
import { Field, Select, Download } from "./Fields.jsx";
import { money, businessDate } from "../domain/valuation.js";
import { safeCell } from "../domain/imports.js";
import {
  ensureRepairState,
  businessToday,
  createRepair,
  setRepairStatus,
  updateRepair,
  addRepairMaterial,
  addRepairCost,
  addRepairPayment,
  voidRepairExpense,
  saveRepairType,
  saveRepairMaterialTemplate,
  repairOrderTotals,
} from "../domain/repairs.js";
import RepairReport from "./RepairReport.jsx";
const statuses = [
  ["accepted", "Принят"],
  ["in_progress", "В работе"],
  ["ready", "Готов"],
  ["issued", "Выдан"],
  ["cancelled", "Отменён"],
];
const methods = [
  ["cash", "Наличные"],
  ["transfer", "Перевод"],
  ["card", "Карта"],
  ["installment", "Рассрочка"],
];
const uid = () => crypto.randomUUID();
const eventNames = {
  "repair-created": "Заказ создан",
  "repair-updated": "Данные заказа изменены",
  "repair-status": "Статус изменён",
  "repair-material": "Материал добавлен",
  "repair-cost": "Расход добавлен",
  "repair-payment": "Оплата получена",
  "repair-refund": "Возврат клиенту",
  "repair-expense-voided": "Ошибка расхода исправлена",
};
const newMaterial = () => ({
  materialId: "",
  name: "",
  quantity: "1",
  unit: "шт.",
  unitCost: "",
  spentOn: businessToday(),
});
function OrderDetail({ order, data, commit, notify }) {
  const [material, setMaterial] = useState(newMaterial),
    [cost, setCost] = useState({
      name: "",
      amount: "",
      spentOn: businessToday(),
    }),
    [payment, setPayment] = useState({
      amount: "",
      paidOn: businessToday(),
      method: "cash",
      kind: "payment",
      reason: "",
    });
  const [materialOp, setMaterialOp] = useState(uid),
    [costOp, setCostOp] = useState(uid),
    [paymentOp, setPaymentOp] = useState(uid);
  const totals = repairOrderTotals(order);
  const [edit, setEdit] = useState(null);
  const run = (fn, after) => {
    try {
      commit(fn);
      after?.();
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <section className="panel repair-detail" aria-label="Карточка ремонта">
      <div className="sectionhead">
        <div>
          <span className="price-badge">
            ЗАКАЗ {String(order.id).slice(0, 8).toUpperCase()}
          </span>
          <h2>{order.device}</h2>
          <p>
            {order.repairTypeName} · Принят {order.receivedOn}
          </p>
        </div>
        <Select
          label="Статус ремонта"
          value={order.status}
          options={statuses}
          onChange={(status) => {
            const reason =
              status === "cancelled"
                ? window.prompt(
                    "Причина отмены. Оплаты и расходы останутся в учёте.",
                  )
                : "";
            if (status === "cancelled" && !reason) return;
            run((s) => setRepairStatus(s, order.id, status, reason));
          }}
        />
      </div>
      <p>{order.description || "Описание не указано"}</p>
      <button
        onClick={() =>
          setEdit({ ...order, plannedRevenue: order.plannedRevenue ?? "" })
        }
      >
        Изменить заказ
      </button>
      {edit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => updateRepair(s, order.id, edit),
              () => {
                setEdit(null);
                notify("Данные заказа обновлены");
              },
            );
          }}
        >
          <div className="formgrid">
            <Field
              label="Устройство в заказе"
              value={edit.device}
              onChange={(v) => setEdit((x) => ({ ...x, device: v }))}
              required
            />
            <Select
              label="Тип ремонта в заказе"
              value={edit.repairTypeId}
              options={data.repairTypes
                .filter((x) => !x.archived || x.id === order.repairTypeId)
                .map((x) => [x.id, x.name])}
              onChange={(v) => setEdit((x) => ({ ...x, repairTypeId: v }))}
            />
            <Field
              label="Дата приёма в заказе"
              type="date"
              value={edit.receivedOn}
              onChange={(v) => setEdit((x) => ({ ...x, receivedOn: v }))}
              required
            />
            <Field
              label="Согласованная стоимость заказа, ₸"
              type="number"
              min="0"
              step="0.01"
              value={edit.plannedRevenue}
              onChange={(v) => setEdit((x) => ({ ...x, plannedRevenue: v }))}
            />
            <Field
              label="Описание заказа"
              value={edit.description}
              onChange={(v) => setEdit((x) => ({ ...x, description: v }))}
            />
          </div>
          <button type="submit">Сохранить изменения заказа</button>
          <button type="button" onClick={() => setEdit(null)}>
            Отмена изменений
          </button>
        </form>
      )}
      {order.status === "issued" && totals.balance > 0 && (
        <p className="warning">
          Устройство выдано, но по смете осталось получить{" "}
          {money(totals.balance)}. Статус не означает полную оплату.
        </p>
      )}
      {order.status === "cancelled" && (
        <p className="warning">
          Заказ отменён. Реальные оплаты и расходы сохранены; возврат клиенту
          оформляется отдельной операцией.
        </p>
      )}
      <div className="repair-totals">
        {[
          ["Согласовано", order.plannedRevenue],
          ["Получено от клиента", totals.received],
          ["Материалы", totals.materials],
          ["Другие расходы", totals.costs],
          ["Заработок после прямых расходов", totals.profit],
          ["Осталось получить по смете", totals.balance],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong
              className={
                label.startsWith("Заработок") && value < 0 ? "red" : ""
              }
            >
              {money(value)}
            </strong>
          </div>
        ))}
      </div>
      <p className="source-note">
        Согласованная стоимость — план. Заработок здесь: реальные оплаты −
        возвраты − материалы − прямые расходы. Налоги и общие расходы магазина
        не включены.
      </p>
      <details open>
        <summary>Оплаты клиента и возвраты ({order.payments.length})</summary>
        {order.payments.map((p) => (
          <p key={p.id}>
            {p.paidOn} · {p.kind === "refund" ? "Возврат клиенту" : "Оплата"} ·{" "}
            {money(p.amount)} · {methods.find(([k]) => k === p.method)?.[1]}
            {p.reason ? " · " + p.reason : ""}
          </p>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => addRepairPayment(s, order.id, payment, paymentOp),
              () => {
                setPayment((x) => ({ ...x, amount: "", reason: "" }));
                setPaymentOp(uid());
                notify("Операция оплаты сохранена");
              },
            );
          }}
        >
          <div className="formgrid">
            <Select
              label="Операция оплаты"
              value={payment.kind}
              options={[
                ["payment", "Получили от клиента"],
                ["refund", "Вернули клиенту"],
              ]}
              onChange={(v) => setPayment((x) => ({ ...x, kind: v }))}
            />
            <Field
              label="Сумма оплаты, ₸"
              type="number"
              min="0"
              step="0.01"
              value={payment.amount}
              onChange={(v) => setPayment((x) => ({ ...x, amount: v }))}
              required
            />
            <Field
              label="Дата оплаты"
              type="date"
              value={payment.paidOn}
              onChange={(v) => setPayment((x) => ({ ...x, paidOn: v }))}
              required
            />
            <Select
              label="Способ оплаты"
              value={payment.method}
              options={methods}
              onChange={(v) => setPayment((x) => ({ ...x, method: v }))}
            />
            {payment.kind === "refund" && (
              <Field
                label="Причина возврата"
                value={payment.reason}
                onChange={(v) => setPayment((x) => ({ ...x, reason: v }))}
                required
              />
            )}
          </div>
          <button className="primary" type="submit">
            Подтвердить оплату
          </button>
        </form>
      </details>
      <details>
        <summary>
          Материалы и запчасти (
          {order.materials.filter((x) => !x.voided).length})
        </summary>
        {order.materials.map((m) => (
          <div className="repair-line" key={m.id}>
            <div>
              <b>{m.name}</b>
              <p>
                {m.quantity} {m.unit} × {money(m.unitCost)} = {money(m.total)} ·{" "}
                {m.spentOn}
                {m.voided ? " · Исправлено / исключено" : ""}
              </p>
            </div>
            {!m.voided && (
              <button
                onClick={() => {
                  const reason = window.prompt(
                    "Причина исправления расхода. Запись останется в журнале.",
                  );
                  if (reason)
                    run((s) =>
                      voidRepairExpense(s, order.id, "material", m.id, reason),
                    );
                }}
              >
                Исправить расход
              </button>
            )}
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) =>
                addRepairMaterial(
                  s,
                  order.id,
                  { ...material, materialId: material.materialId || undefined },
                  materialOp,
                ),
              () => {
                setMaterial(newMaterial());
                setMaterialOp(uid());
                notify("Материал добавлен в заказ");
              },
            );
          }}
        >
          <div className="formgrid">
            <Select
              label="Из справочника материалов"
              value={material.materialId}
              options={[
                ["", "Ввести материал вручную"],
                ...data.materialCatalog
                  .filter((x) => !x.archived)
                  .map((m) => [m.id, m.name]),
              ]}
              onChange={(id) => {
                const m = data.materialCatalog.find((x) => x.id === id);
                setMaterial((x) => ({
                  ...x,
                  materialId: id,
                  name: m?.name ?? "",
                  unit: m?.unit ?? "шт.",
                  unitCost: m?.unitCost ?? "",
                }));
              }}
            />
            <Field
              label="Материал / запчасть"
              value={material.name}
              onChange={(v) =>
                setMaterial((x) => ({ ...x, name: v, materialId: "" }))
              }
              required
            />
            <Field
              label="Количество"
              type="number"
              min="0.001"
              step="any"
              value={material.quantity}
              onChange={(v) => setMaterial((x) => ({ ...x, quantity: v }))}
              required
            />
            <Field
              label="Единица материала"
              value={material.unit}
              onChange={(v) => setMaterial((x) => ({ ...x, unit: v }))}
              required
            />
            <Field
              label="Цена за единицу, ₸"
              type="number"
              min="0"
              step="0.01"
              value={material.unitCost}
              onChange={(v) => setMaterial((x) => ({ ...x, unitCost: v }))}
              required
            />
            <Field
              label="Дата расхода"
              type="date"
              value={material.spentOn}
              onChange={(v) => setMaterial((x) => ({ ...x, spentOn: v }))}
              required
            />
          </div>
          <button type="submit">Добавить материал</button>
        </form>
        <p className="source-note">
          Добавляйте реально использованный материал. Справочник хранит названия
          и себестоимость, остатки запчастей автоматически не списываются.
        </p>
      </details>
      <details>
        <summary>
          Другие прямые расходы ({order.costs.filter((x) => !x.voided).length})
        </summary>
        {order.costs.map((c) => (
          <div key={c.id} className="repair-line">
            <p>
              {c.name} · {money(c.amount)} · {c.spentOn}
              {c.voided ? " · Исправлено / исключено" : ""}
            </p>
            {!c.voided && (
              <button
                onClick={() => {
                  const reason = window.prompt("Причина исправления расхода");
                  if (reason)
                    run((s) =>
                      voidRepairExpense(s, order.id, "cost", c.id, reason),
                    );
                }}
              >
                Исправить расход
              </button>
            )}
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => addRepairCost(s, order.id, cost, costOp),
              () => {
                setCost({ name: "", amount: "", spentOn: businessToday() });
                setCostOp(uid());
                notify("Прямой расход добавлен");
              },
            );
          }}
        >
          <div className="formgrid">
            <Field
              label="Название расхода"
              value={cost.name}
              onChange={(v) => setCost((x) => ({ ...x, name: v }))}
              required
            />
            <Field
              label="Сумма расхода, ₸"
              type="number"
              min="0"
              step="0.01"
              value={cost.amount}
              onChange={(v) => setCost((x) => ({ ...x, amount: v }))}
              required
            />
            <Field
              label="Дата прямого расхода"
              type="date"
              value={cost.spentOn}
              onChange={(v) => setCost((x) => ({ ...x, spentOn: v }))}
              required
            />
          </div>
          <button type="submit">Добавить расход</button>
        </form>
      </details>
      <details>
        <summary>История заказа</summary>
        {data.repairEvents
          .filter((e) => e.orderId === order.id)
          .slice()
          .reverse()
          .map((e) => (
            <details key={e.id}>
              <summary>
                {businessDate(e.at)} · {eventNames[e.type] ?? "Заказ изменён"}
              </summary>
              {e.reason && <p>{e.reason}</p>}
              {e.before?.payments &&
                e.after?.payments &&
                (() => {
                  const before = repairOrderTotals(e.before),
                    after = repairOrderTotals(e.after);
                  return (
                    <>
                      <p>
                        Получено: {money(before.received)} →{" "}
                        {money(after.received)}
                      </p>
                      <p>
                        Материалы: {money(before.materials)} →{" "}
                        {money(after.materials)} · Другие расходы:{" "}
                        {money(before.costs)} → {money(after.costs)}
                      </p>
                      <p>
                        Смета: {money(e.before.plannedRevenue)} →{" "}
                        {money(e.after.plannedRevenue)}
                      </p>
                    </>
                  );
                })()}
            </details>
          ))}
      </details>
    </section>
  );
}
function RepairDictionaries({ data, commit, notify }) {
  const [type, setType] = useState({ name: "" }),
    [material, setMaterial] = useState({ name: "", unit: "шт.", unitCost: "" });
  const run = (fn, done) => {
    try {
      commit(fn);
      done?.();
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="columns">
      <section className="panel">
        <h2>Типы ремонта</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => saveRepairType(s, type),
              () => {
                setType({ name: "" });
                notify("Тип ремонта сохранён");
              },
            );
          }}
        >
          <Field
            label="Название типа ремонта"
            value={type.name}
            onChange={(v) => setType((x) => ({ ...x, name: v }))}
            required
          />
          <div className="actions wrap">
            <button type="submit">Сохранить тип ремонта</button>
            {type.id && (
              <button type="button" onClick={() => setType({ name: "" })}>
                Отмена редактирования
              </button>
            )}
          </div>
        </form>
        {data.repairTypes.map((t) => (
          <div key={t.id} className="repair-line">
            <span>
              {t.name}
              {t.archived ? " · Архив" : ""}
            </span>
            <div className="actions wrap">
              <button onClick={() => setType({ ...t })}>Изменить</button>
              <button
                onClick={() =>
                  run((s) => saveRepairType(s, { ...t, archived: !t.archived }))
                }
              >
                {t.archived ? "Восстановить" : "В архив"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Справочник материалов</h2>
        <p className="source-note">
          Шаблоны для быстрого добавления в заказ. Изменение цены шаблона не
          меняет уже учтённые расходы.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => saveRepairMaterialTemplate(s, material),
              () => {
                setMaterial({ name: "", unit: "шт.", unitCost: "" });
                notify("Материал сохранён");
              },
            );
          }}
        >
          <div className="formgrid">
            <Field
              label="Название материала"
              value={material.name}
              onChange={(v) => setMaterial((x) => ({ ...x, name: v }))}
              required
            />
            <Field
              label="Единица измерения"
              value={material.unit}
              onChange={(v) => setMaterial((x) => ({ ...x, unit: v }))}
              required
            />
            <Field
              label="Себестоимость единицы, ₸"
              type="number"
              min="0"
              step="0.01"
              value={material.unitCost}
              onChange={(v) => setMaterial((x) => ({ ...x, unitCost: v }))}
              required
            />
          </div>
          <div className="actions wrap">
            <button type="submit">Сохранить материал в справочник</button>
            {material.id && (
              <button
                type="button"
                onClick={() =>
                  setMaterial({ name: "", unit: "шт.", unitCost: "" })
                }
              >
                Отмена редактирования
              </button>
            )}
          </div>
        </form>
        {data.materialCatalog.map((m) => (
          <div className="repair-line" key={m.id}>
            <span>
              {m.name} · {money(m.unitCost)}/{m.unit}
              {m.archived ? " · Архив" : ""}
            </span>
            <div className="actions wrap">
              <button onClick={() => setMaterial({ ...m })}>Изменить</button>
              <button
                onClick={() =>
                  run((s) =>
                    saveRepairMaterialTemplate(s, {
                      ...m,
                      archived: !m.archived,
                    }),
                  )
                }
              >
                {m.archived ? "Восстановить" : "В архив"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
export default function Repairs({ state, commit, notify }) {
  const data = ensureRepairState(state);
  const [view, setView] = useState("orders"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedId, setSelectedId] = useState(null),
    [showNew, setShowNew] = useState(!data.repairOrders.length),
    [op, setOp] = useState(uid);
  const [form, setForm] = useState({
    device: "",
    repairTypeId: data.repairTypes.find((x) => !x.archived)?.id ?? "",
    description: "",
    receivedOn: businessToday(),
    plannedRevenue: "",
  });
  const activeTypeId =
    data.repairTypes.find((x) => x.id === form.repairTypeId && !x.archived)
      ?.id ??
    data.repairTypes.find((x) => !x.archived)?.id ??
    "";
  const filtered = data.repairOrders
    .filter(
      (x) =>
        (filter === "all" || x.status === filter) &&
        `${x.device} ${x.repairTypeName} ${x.description} ${x.id}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice()
    .reverse();
  const selected = filtered.find((x) => x.id === selectedId) ?? filtered[0];
  const cols = [
    "id",
    "device",
    "repairTypeName",
    "receivedOn",
    "status",
    "plannedRevenue",
    "received",
    "materials",
    "costs",
    "profit",
  ];
  const csv =
    "\uFEFF" +
    cols.join(";") +
    "\n" +
    filtered
      .map((x) => {
        const totals = repairOrderTotals(x);
        return cols
          .map((k) =>
            safeCell(
              ["received", "materials", "costs", "profit"].includes(k)
                ? totals[k]
                : x[k],
            ),
          )
          .join(";");
      })
      .join("\n");
  return (
    <>
      <div className="sectionhead">
        <div className="actions wrap repair-tabs">
          {[
            ["orders", "Заказы"],
            ["report", "Отчёт по ремонтам"],
            ["dictionaries", "Справочники"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "primary" : ""}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="source-note">
          В этом браузере · Полная копия в настройках
        </span>
      </div>
      {view === "report" ? (
        <RepairReport state={state} />
      ) : view === "dictionaries" ? (
        <RepairDictionaries data={data} commit={commit} notify={notify} />
      ) : (
        <>
          <section className="panel">
            <div className="sectionhead">
              <div>
                <h2>Заказы на ремонт</h2>
                <p className="source-note">
                  Телефон → материалы → фактическая оплата → результат.
                </p>
              </div>
              <button className="primary" onClick={() => setShowNew((x) => !x)}>
                Новый ремонт
              </button>
            </div>
            {showNew && (
              <form
                aria-label="Новый заказ ремонта"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    let created;
                    commit((s) => {
                      const next = createRepair(
                        s,
                        { ...form, repairTypeId: activeTypeId },
                        op,
                      );
                      created = next.repairOrders.find(
                        (x) =>
                          !ensureRepairState(s).repairOrders.some(
                            (y) => y.id === x.id,
                          ),
                      );
                      return next;
                    });
                    setSelectedId(created?.id ?? null);
                    setForm((x) => ({
                      ...x,
                      device: "",
                      description: "",
                      plannedRevenue: "",
                    }));
                    setOp(uid());
                    setShowNew(false);
                    setSearch("");
                    setFilter("all");
                    notify("Заказ ремонта создан");
                  } catch (err) {
                    notify(err.message);
                  }
                }}
              >
                <div className="formgrid">
                  <Field
                    label="Устройство / модель"
                    value={form.device}
                    onChange={(v) => setForm((x) => ({ ...x, device: v }))}
                    list="repair-models"
                    required
                  />
                  <datalist id="repair-models">
                    {state.catalog.map((x) => (
                      <option key={x.name} value={x.name} />
                    ))}
                  </datalist>
                  <Select
                    label="Тип ремонта"
                    value={activeTypeId}
                    options={data.repairTypes
                      .filter((x) => !x.archived)
                      .map((x) => [x.id, x.name])}
                    onChange={(v) =>
                      setForm((x) => ({ ...x, repairTypeId: v }))
                    }
                  />
                  <Field
                    label="Дата приёма"
                    type="date"
                    value={form.receivedOn}
                    onChange={(v) => setForm((x) => ({ ...x, receivedOn: v }))}
                    required
                  />
                  <Field
                    label="Согласованная стоимость, ₸ (необязательно)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.plannedRevenue}
                    onChange={(v) =>
                      setForm((x) => ({ ...x, plannedRevenue: v }))
                    }
                  />
                  <Field
                    label="Описание неисправности"
                    value={form.description}
                    onChange={(v) => setForm((x) => ({ ...x, description: v }))}
                  />
                </div>
                <button
                  className="primary"
                  type="submit"
                  disabled={!data.repairTypes.some((x) => !x.archived)}
                >
                  Создать заказ
                </button>
              </form>
            )}
          </section>
          <div className="repair-workspace">
            <section className="panel">
              <div className="formgrid">
                <Field
                  label="Поиск ремонта"
                  value={search}
                  onChange={setSearch}
                />
                <Select
                  label="Фильтр статуса ремонта"
                  value={filter}
                  onChange={setFilter}
                  options={[["all", "Все статусы"], ...statuses]}
                />
              </div>
              <Download
                name="nomad-repairs.csv"
                type="text/csv;charset=utf-8"
                data={csv}
              >
                Экспорт заказов CSV
              </Download>
              {!filtered.length && (
                <p className="empty">
                  Заказов пока нет. Добавьте первый ремонт.
                </p>
              )}
              <div className="repair-order-list">
                {filtered.map((order) => {
                  const t = repairOrderTotals(order);
                  return (
                    <button
                      className={
                        "repair-order-card " +
                        (selected?.id === order.id ? "selected" : "")
                      }
                      key={order.id}
                      onClick={() => setSelectedId(order.id)}
                    >
                      <b>{order.device}</b>
                      <span>
                        {order.repairTypeName} · {order.receivedOn}
                      </span>
                      <span>
                        {statuses.find(([key]) => key === order.status)?.[1]}
                      </span>
                      <span>
                        Получено: {money(t.received)} · Материалы:{" "}
                        {money(t.materials)}
                      </span>
                      <strong>Результат: {money(t.profit)}</strong>
                    </button>
                  );
                })}
              </div>
            </section>
            {selected && (
              <OrderDetail
                key={selected.id}
                order={selected}
                data={data}
                commit={commit}
                notify={notify}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
