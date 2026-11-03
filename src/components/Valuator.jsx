import React, { useState } from "react";
import { Field, Select, conditions, checks, simOptions } from "./Fields.jsx";
import { initialInput, changeModel } from "../domain/catalog.js";
import { evaluate, money, configKey } from "../domain/valuation.js";
import { purchase, uid } from "../domain/storage.js";
export default function Valuator({ state, commit, notify }) {
  const [input, setInput] = useState(initialInput),
    [priceId, setPriceId] = useState(""),
    [buy, setBuy] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [purchaseToken, setPurchaseToken] = useState("");
  const update = (k, v) => {
    setInput((x) => ({ ...x, [k]: v }));
    setConfirm(false);
  };
  const model = state.catalog.find((m) => m.name === input.model);
  const configs = model?.configs ?? [];
  const prices = state.prices.filter((p) => configKey(p) === configKey(input));
  const price = prices.find((p) => p.id === priceId) ?? prices[0];
  let result, error;
  try {
    result = evaluate(input, price, state.policy);
  } catch (e) {
    error = e.message;
  }
  const run = (fn) => {
    try {
      fn();
    } catch (e) {
      notify(e.message);
    }
  };
  const applicable = Object.entries(input.checks);
  return (
    <div className="columns">
      <section className="panel">
        <h2>Устройство клиента</h2>
        <p className="muted">
          Астана · Сохранённый прайс владельца · Локальный режим
        </p>
        <div className="formgrid">
          <label className="field wide">
            Поиск модели
            <input
              list="models"
              value={input.model}
              onChange={(e) => {
                setInput(changeModel(input, e.target.value, state.catalog));
                setPriceId("");
                setConfirm(false);
              }}
            />
            <datalist id="models">
              {state.catalog.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </label>
          <Select
            label="Конфигурация (физическая память)"
            value={input.storage + "|" + (input.ram ?? "")}
            onChange={(v) => {
              const [storage, ram] = v.split("|");
              setInput((x) => ({
                ...x,
                storage: Number(storage),
                ram: ram ? Number(ram) : null,
              }));
              setConfirm(false);
            }}
            options={
              configs.length
                ? configs.map((c) => [
                    c.storage + "|" + (c.ram ?? ""),
                    `${c.storage} ГБ${c.ram ? " / ОЗУ " + c.ram + " ГБ" : ""}`,
                  ])
                : [["|", "Нет подтверждённых конфигураций"]]
            }
          />
          <Select
            label="SIM (проверить вручную)"
            value={input.sim}
            onChange={(v) => update("sim", v)}
            options={simOptions}
          />
          <Select
            label="Экран"
            value={input.screen}
            onChange={(v) => update("screen", v)}
            options={conditions}
          />
          <Select
            label="Корпус"
            value={input.body}
            onChange={(v) => update("body", v)}
            options={conditions}
          />
          <Field
            label="АКБ, % (пусто = неизвестно)"
            value={input.battery}
            type="number"
            min="0"
            max="100"
            onChange={(v) => update("battery", v)}
          />
          <Field
            label="Циклы (необязательно)"
            value={input.cycles}
            type="number"
            min="0"
            onChange={(v) => update("cycles", v)}
          />
          {["box", "charger"].map((k, i) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                checked={input[k]}
                onChange={(e) => update(k, e.target.checked)}
              />
              {["Коробка", "Зарядное устройство в комплекте"][i]}
            </label>
          ))}
          <Field
            label="Другие принадлежности"
            value={input.accessories}
            onChange={(v) => update("accessories", v)}
          />
          <Select
            label="История ремонта"
            value={input.repairHistory}
            onChange={(v) => update("repairHistory", v)}
            options={[
              ["unknown", "Не проверена"],
              ["none", "Ремонта не было (проверено)"],
              ["repaired", "Был ремонт (проверено)"],
            ]}
          />
          <Field
            label="Заменённые детали"
            value={input.parts}
            onChange={(v) => update("parts", v)}
          />
          {applicable.map(([key, value]) => (
            <Select
              key={key}
              label={
                {
                  sensor: "Сенсор",
                  cameras: "Камеры",
                  network: "Связь",
                  charging: "Зарядка",
                  faceid: "Face ID",
                }[key]
              }
              value={value}
              options={checks}
              onChange={(v) => update("checks", { ...input.checks, [key]: v })}
            />
          ))}
          <Select
            label="Блокировки и аккаунты"
            value={input.locks}
            onChange={(v) => update("locks", v)}
            options={[
              ["unknown", "Не проверено"],
              ["checked", "Проверено вручную"],
              ["problem", "Проблема"],
            ]}
          />
          <fieldset className="wide">
            <legend>Серьёзные дефекты → ручная диагностика</legend>
            {[
              ["glass", "Трещины стекла"],
              ["matrix", "Повреждение матрицы"],
              ["liquid", "Следы жидкости"],
              ["swelling", "Вздутие АКБ"],
            ].map(([k, t]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={input.defects.includes(k)}
                  onChange={(e) =>
                    update(
                      "defects",
                      e.target.checked
                        ? [...input.defects, k]
                        : input.defects.filter((x) => x !== k),
                    )
                  }
                />
                {t}
              </label>
            ))}
          </fieldset>
          <Select
            label="Сценарий"
            value={input.scenario}
            onChange={(v) => update("scenario", v)}
            options={[
              ["asis", "Продать как есть"],
              ["repair", "После ремонта (серьёзные дефекты — диагностика)"],
            ]}
          />
          {input.scenario === "repair" && (
            <Field
              label="Ремонт, ₸"
              value={input.repair}
              type="number"
              min="0"
              onChange={(v) => update("repair", v)}
            />
          )}
          <Field
            label="Прямые расходы продажи, ₸"
            value={input.expenses}
            type="number"
            min="0"
            onChange={(v) => update("expenses", v)}
          />
          <Field
            label="Цена продавца, ₸ (необязательно)"
            value={input.ask}
            type="number"
            min="0"
            onChange={(v) => update("ask", v)}
          />
          <Field
            label="Примечание"
            value={input.note}
            onChange={(v) => update("note", v)}
          />
        </div>
      </section>
      <section className="panel result">
        <h2>Предложение Nomad Mobile</h2>
        {error ? (
          <p role="alert">{error}</p>
        ) : result?.status === "no-data" ? (
          <>
            <p>
              Нет данных для этой конфигурации. Сохраните один раз ориентир в
              разделе «Прайс и источники».
            </p>
            <p>{model?.source}</p>
          </>
        ) : (
          <>
            {prices.length > 1 && (
              <Select
                label="Базовое состояние прайса"
                value={price.id}
                onChange={setPriceId}
                options={prices.map((x) => [
                  x.id,
                  `${x.base.screen}/${x.base.body}, коробка ${x.base.box ? "есть" : "нет"}, АКБ ${x.base.battery ?? "неизвестно"}`,
                ])}
              />
            )}
            <p>
              База: {money(result.base)} · {price.author} · {price.checkedAt}
            </p>
            <p className="muted">
              {price.note}. {result.quality}
            </p>
            {result.restrictions.map((x) => (
              <p className="warning" key={x}>
                {x}
              </p>
            ))}
            <span>Рекомендованная витрина</span>
            <strong>{money(result.showcase)}</strong>
            {[
              ["Продажа с торгом", result.sale],
              ["Быстрая продажа", result.quick],
              ["Рекомендуемая скупка", result.recommendedBuy],
              ["Максимальный закуп", result.maxBuy],
              ["Рассрочка +" + state.policy.markup + "%", result.installment],
              [
                "Прибыль по цене продавца до общих расходов и налогов",
                result.expectedProfit,
              ],
              ["Ломбард", null],
            ].map(([t, v]) => (
              <div className="resultline" key={t}>
                <span>{t}</span>
                <b>{money(v)}</b>
              </div>
            ))}
            {result.status === "diagnosis" && (
              <p className="warning">
                Требуется ручная диагностика. Безопасный максимум закупа не
                рассчитан.
              </p>
            )}
            {result.status === "unprofitable" && (
              <p className="warning">Закуп нецелесообразен при этих условиях</p>
            )}
            <details>
              <summary>Объяснение расчёта · правила {result.version}</summary>
              <p>
                Прайс относится к выбранной памяти и базовому комплекту;
                надбавки за память нет.
              </p>
              {result.adjustments.length ? (
                result.adjustments.map((x) => (
                  <p key={x.reason}>
                    {x.reason}: {money(x.value)}
                  </p>
                ))
              ) : (
                <p>
                  Поправок нет: базовое состояние совпадает либо нет
                  сопоставимых данных АКБ.
                </p>
              )}
              <p>
                Максимум = быстрая продажа − ремонт в сценарии «После ремонта» −
                расходы − {money(state.policy.risk)} резерва риска −{" "}
                {money(state.policy.minProfit)} минимальной прибыли. Это
                политика магазина.
              </p>
              <p>
                Комиссия банка: {state.policy.bankFee}% (настройка владельца).
                Наценка не равна прибыли. Сопоставимых объявлений: 0, диапазон
                рынка: нет данных.
              </p>
            </details>
            <div className="actions wrap">
              <button
                onClick={() =>
                  run(() => {
                    commit((s) => ({
                      ...s,
                      assessments: [
                        ...s.assessments,
                        { id: uid(), ...structuredClone(result) },
                      ],
                    }));
                    notify("Оценка сохранена со снимком прайса");
                  })
                }
              >
                Сохранить оценку
              </button>
              <button
                disabled={result.recommendedBuy == null}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Nomad Mobile, Астана: предварительное предложение ${money(result.recommendedBuy)} за ${input.model} ${input.storage} ГБ. Итоговая сумма после проверки устройства.`,
                    );
                    notify("Предложение скопировано");
                  } catch {
                    notify("Браузер не разрешил копирование");
                  }
                }}
              >
                Скопировать предложение клиенту
              </button>
              <button
                className="primary"
                onClick={() => {
                  setPurchaseToken(uid());
                  setConfirm(true);
                  setBuy(String(result.recommendedBuy ?? ""));
                }}
              >
                Оформить закупку
              </button>
            </div>
            {confirm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => {
                    commit((s) =>
                      purchase(s, { ...result, purchaseToken }, buy, reason),
                    );
                    setConfirm(false);
                    notify("Закупка подтверждена. Устройство на складе.");
                  });
                }}
              >
                <h3>Подтверждение фактической суммы</h3>
                <Field
                  label="Фактический закуп, ₸"
                  value={buy}
                  type="number"
                  min="0"
                  onChange={setBuy}
                />
                <Field
                  label="Причина превышения / принятия рисков"
                  value={reason}
                  onChange={setReason}
                />
                <button type="submit" className="primary">
                  Подтвердить закупку
                </button>
                <button type="button" onClick={() => setConfirm(false)}>
                  Отмена
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
