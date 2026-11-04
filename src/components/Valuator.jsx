import React, { useState } from "react";
import { Field, Select, conditions, checks, simOptions } from "./Fields.jsx";
import { initialInput, changeModel, deviceProfile } from "../domain/catalog.js";
import { evaluate, money, configKey } from "../domain/valuation.js";
import { purchase, uid } from "../domain/storage.js";
import { findWorkbookPrice } from "../domain/workbook.js";
import WorkbookStatus from "./WorkbookStatus.jsx";
export default function Valuator({ state, commit, notify, storageMode = "local", onManageCatalog, onEditPrice }) {
  const [input, setInput] = useState(() => ({ ...structuredClone(initialInput), model: "", storage: "", ram: null })),
    [priceId, setPriceId] = useState(""),
    [buy, setBuy] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [purchaseToken, setPurchaseToken] = useState(""),
    [brand, setBrand] = useState(""), [kind, setKind] = useState("");
  const update = (k, v) => {
    setInput((x) => ({ ...x, [k]: v }));
    setConfirm(false);
  };
  const model = state.catalog.find((m) => m.name === input.model);
  const configs = model?.configs ?? [];
  const profile = deviceProfile(model ?? input.model);
  const query = input.model.trim().toLocaleLowerCase("ru-RU");
  const suggestions = state.catalog.filter((row) => (!brand || row.brand === brand) && (!kind || (row.deviceType ?? "phone") === kind) &&
    (!query || `${row.brand} ${row.name}`.toLocaleLowerCase("ru-RU").includes(query))).slice(0, 80);
  const chooseFilter = (nextBrand, nextKind) => {
    setBrand(nextBrand); setKind(nextKind);
    if (!model || (nextBrand && model.brand !== nextBrand) || (nextKind && (model.deviceType ?? "phone") !== nextKind))
      setInput(changeModel(input, "", state.catalog));
    setPriceId(""); setConfirm(false);
  };
  const savedPrices = state.prices.filter((p) => configKey(p) === configKey(input));
  const workbookPrice = model ? findWorkbookPrice(input, model) : undefined;
  const prices = workbookPrice ? [...savedPrices, workbookPrice] : savedPrices;
  const price =
    prices.find((p) => p.id === priceId) ??
    prices.find((p) => p.source === "owner-buy") ??
    prices.find((p) => p.source === "owner") ??
    prices.find((p) => p.source === "owner-guide") ??
    workbookPrice;
  const workbook = price?.source === "workbook-reference";
  let result, error;
  try {
    if (model) result = evaluate(input, price, state.policy, undefined, model);
  } catch (e) {
    error = e.message;
  }
  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    }
  };
  const applicable = Object.entries(input.checks);
  return (
    <>
    <div className="columns">
      <section className="panel">
        <h2>Устройство клиента</h2>
        <p className="muted">
          Астана · Ваш справочник скупки · {storageMode === "cloud" ? "Общая база" : "Локальный режим"}
        </p>
        <p className="muted">В каталоге {state.catalog.length} моделей, включая {state.catalog.filter((row) => row.deviceType === "tablet").length} планшетов. Сохранённый прайс имеет приоритет перед черновыми ориентирами Excel.</p>
        <div className="formgrid">
          <Select label="Устройства в подсказках" value={kind} onChange={(v) => chooseFilter(brand, v)} options={[["", "Все устройства"], ["phone", "Смартфоны"], ["tablet", "Планшеты"]]} />
          <Select label="Бренды в подсказках" value={brand} onChange={(v) => chooseFilter(v, kind)} options={[["", "Все бренды"], ...[...new Set(state.catalog.map((row) => row.brand))].sort((a, b) => a.localeCompare(b, "ru"))]} />
          <label className="field wide">
            Поиск модели
            <input
              aria-label="Поиск модели"
              list="models"
              placeholder="Начните вводить модель"
              autoComplete="off"
              spellCheck={false}
              value={input.model}
              onChange={(e) => {
                setInput(changeModel(input, e.target.value, state.catalog));
                setPriceId("");
                setConfirm(false);
              }}
            />
            <datalist id="models">
              {suggestions.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </label>
          {model && <>
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
            options={simOptions.filter(([key]) => profile.simModes.includes(key))}
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
          <details className="wide inspection">
            <summary>Комплект, диагностика и расходы</summary>
            <div className="formgrid">
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
                  onChange={(v) =>
                    update("checks", { ...input.checks, [key]: v })
                  }
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
          </details>
          </>}
        </div>
      </section>
      <section className="panel result">
        <h2>Предложение Nomad Mobile</h2>
        {!model ? (
          <div className="empty"><p>Выберите устройство из подсказок — справа появится расчёт.</p>
            {input.model.trim() && onManageCatalog && <button onClick={onManageCatalog}>Добавить свою модель</button>}
          </div>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : result?.status === "no-data" ? (
          <>
            <p>
              Нет данных для этой конфигурации. Сохраните один раз ориентир в
              разделе «Прайс и источники».
            </p>
            <p>{model?.source}</p>
            <div className="actions wrap">
              {onManageCatalog && <button onClick={onManageCatalog}>{model ? "Указать конфигурацию в конструкторе" : "Добавить свою модель"}</button>}
              {onEditPrice && configs.length > 0 && <button onClick={() => onEditPrice(input.model)}>Задать свои цены</button>}
            </div>
          </>
        ) : (
          <>
            {prices.length > 1 && (
              <Select
                label="Базовое состояние прайса"
                value={price.id}
                onChange={(value) => { setPriceId(value); setConfirm(false); }}
                options={prices.map((x) => [
                  x.id,
                  `${x.source === "workbook-reference" ? "Excel · черновой ориентир" : x.source === "owner-guide" ? "Справочник скупки" : x.source === "owner-buy" ? "Мои цены скупки" : "Ручная витрина"} · ${x.base.screen}/${x.base.body}, коробка ${x.base.box == null ? "не указана" : x.base.box ? "есть" : "нет"}, АКБ ${x.base.battery ?? "неизвестно"}`,
                ])}
              />
            )}
            <p>
              База: {money(result.base)} · {price.author} · {workbook ? `Дата расчёта таблицы: ${price.workbook.calculatedOn}` : price.checkedAt}
            </p>
            {workbook && <div className="notice workbook-basis">
              <strong>Черновой ориентир из Excel — рынок не проверен</strong>
              <p>Диапазон б/у в таблице: {money(price.workbook.usedMin)} – {money(price.workbook.usedMax)}. Это расчётные значения, не диапазон полученных объявлений.</p>
              <p>Проверка цены: {price.workbook.priceCheckedOn ?? "нет подтверждённой даты"}. Память: {price.workbook.memoryStatus}. Характеристики и SIM нужно проверить на устройстве.</p>
            </div>}
            <p className="muted">
              {price.note}. {result.quality}
            </p>
            {!!result.restrictions.length && (
              <details>
                <summary>
                  Что нужно проверить ({result.restrictions.length})
                </summary>
                {result.restrictions.map((x) => (
                  <p className="warning" key={x}>
                    {x}
                  </p>
                ))}
              </details>
            )}
            {result.guide && result.preliminaryMin != null && result.preliminaryMax != null && (
              <div className="offer-hero">
                <span>Предварительная скупка по вашему прайсу</span>
                <strong>
                  {money(result.preliminaryMin)} –{" "}
                  {money(result.preliminaryMax)}
                </strong>
                <p>
                  {workbook ? "Скупка таблицы" : price.source === "owner-buy" ? "Скупка владельца" : "Скупка файла"}: {money(result.basisBuyMin)} –{" "}
                  {money(result.basisBuyMax)}.<br />
                  {price.source === "owner-guide" ? <>Снижение владельца: {money(result.reduction)}</> : workbook ? "Черновой расчёт из Excel" : "Ориентир введён владельцем"}
                  {result.adjustments.length
                    ? ". Дополнительно учтены отличия состояния"
                    : ""}
                  .
                </p>
                {price.source === "owner-buy" && <p>Средний ориентир скупки по вашему диапазону: <b>{money((result.preliminaryMin + result.preliminaryMax) / 2)}</b>. Средний ориентир продажи: <b>{money((result.sale + result.saleMax) / 2)}</b>. Это середина сохранённого диапазона.</p>}
                <p className="source-note">
                  До проверки устройства. Это справочный диапазон, не безопасный
                  максимум закупа.
                </p>
                {result.preliminaryMax === 0 && (
                  <p className="warning">
                    Снижение и расходы исчерпали ориентир: проверьте политику,
                    закуп нецелесообразен.
                  </p>
                )}
              </div>
            )}
            {workbook && !price.workbook.hasBuyRange && <p className="warning">В таблице нет диапазона скупки для этой конфигурации. Нужна ручная оценка после диагностики.</p>}
            <span>{workbook ? "Витрина по таблице" : "Рекомендованная витрина"}</span>
            <strong>{money(result.showcase)}</strong>
            {[
              [workbook ? "Ориентир продажи из таблицы" : "Продажа с торгом (консервативно)", result.sale],
              [workbook ? "Быстрая продажа (расчёт Excel)" : "Быстрая продажа (консервативно)", result.quick],
              ["Рекомендуемая скупка", result.recommendedBuy],
              ["Максимальный закуп", result.maxBuy],
              ["Рассрочка +" + state.policy.markup + "%", result.installment],
              [
                "Прибыль по цене продавца до общих расходов и налогов",
                result.expectedProfit,
              ],
              ...(result.guide
                ? [
                    [
                      "Ожидаемая разница по предварительной скупке до общих расходов и налогов",
                      result.guideProfit,
                    ],
                  ]
                : []),
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
              {result.guide && (
                <>
                  <p>
                    Диапазон продажи после торга: {money(result.sale)} –{" "}
                    {money(result.saleMax)}. Быстрая продажа:{" "}
                    {money(result.quick)} – {money(result.quickMax)}. В расчёте
                    максимума используется нижняя цена быстрой продажи.
                  </p>
                  {price.source === "owner-guide" ? <p>
                    Снижение {money(result.reduction)} применяется один раз к
                    скупке файла, а не к витрине. Предварительная скупка =
                    скупка файла − снижение + отличия состояния − прямые
                    расходы/ремонт по сценарию. Рекомендуемая скупка после
                    диагностики не превышает безопасный максимум.
                  </p> : workbook ? <p>Взяты сохранённые результаты строки Excel. Поправки за память, возраст и ликвидность повторно не применяются. Дата расчёта не подтверждает свежесть рынка; безопасный максимум закупа по этой таблице не выдаётся.</p> : <p>Мои цены скупки не уменьшаются на снижение для импортированного документа. Быстрая продажа рассчитывается по текущей политике магазина; отличия состояния и расходы учитываются отдельно.</p>}
                </>
              )}
              <p>
                Максимум = быстрая продажа − ремонт в сценарии «После ремонта» −
                расходы − {money(state.policy.risk)} резерва риска −{" "}
                {money(state.policy.minProfit)} минимальной прибыли. Это
                политика магазина. Для справочника максимум дополнительно
                ограничен верхней границей предварительной скупки.
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
                  run(async () => {
                    await commit((s) => ({
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
                disabled={result.customerOffer == null}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Nomad Mobile, Астана: ${workbook ? "по справочной таблице " : ""}предварительное предложение ${money(result.customerOffer)} за ${input.model} ${input.storage} ГБ. Итоговая сумма после проверки устройства.`,
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
                  setBuy(
                    String(result.recommendedBuy ?? result.customerOffer ?? ""),
                  );
                }}
              >
                Оформить закупку
              </button>
            </div>
            {confirm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await commit((s) =>
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
    <WorkbookStatus />
    </>
  );
}
