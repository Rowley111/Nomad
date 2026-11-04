import React, { useEffect, useState } from "react";
import { Field, Select, conditions } from "./Fields.jsx";
import { mergePrices } from "../domain/imports.js";
import { buildOwnerPrice, ownerPriceSummary } from "../domain/price-builder.js";
import { businessToday } from "../domain/repairs.js";
import { money } from "../domain/valuation.js";
import { deviceProfile } from "../domain/catalog.js";

function simModes(model) {
  return deviceProfile(model).simModes;
}
const simNames = { physical: "Физическая SIM", esim: "Только eSIM", other: "Другой подтверждённый вариант", wifi: "Без SIM · Wi-Fi" };
function initialForm(catalog, name) {
  const model = catalog.find((row) => row.name === name) ?? catalog.find((row) => row.name === "Samsung Galaxy A35 5G") ?? catalog[0];
  const config = model?.configs[0];
  return {
    model: model?.name ?? "", storage: config?.storage ?? "", ram: config?.ram ?? null,
    sim: simModes(model)[0], buyMin: "", buyMax: "", saleMin: "", saleMax: "",
    author: "", checkedAt: businessToday(), screen: "good", body: "good", box: true, battery: "", note: "",
  };
}

export default function QuickPrice({ state, commit, notify, initialModel, initialPrice }) {
  const [form, setForm] = useState(() => initialForm(state.catalog, initialModel)),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialModel) setForm(initialForm(state.catalog, initialModel));
  }, [initialModel]);
  useEffect(() => {
    if (initialPrice) setForm({ ...initialPrice, ...initialPrice.base, battery: initialPrice.base.battery ?? "" });
  }, [initialPrice]);
  const model = state.catalog.find((row) => row.name === form.model);
  const configs = model?.configs ?? [];
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  function changeModel(name) {
    const next = state.catalog.find((row) => row.name === name);
    setForm((previous) => ({
      ...previous, model: name, storage: next?.configs[0]?.storage ?? "", ram: next?.configs[0]?.ram ?? null,
      sim: simModes(next)[0], buyMin: "", buyMax: "", saleMin: "", saleMax: "",
    }));
  }
  let preview;
  try {
    const row = buildOwnerPrice(form, state);
    preview = { ...ownerPriceSummary(row), quickMin: row.quickMin, quickMax: row.quickMax };
  } catch { /* Required fields may still be empty; saving reports their exact error. */ }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const row = buildOwnerPrice(form, state);
      await commit((previous) => mergePrices(previous, [row]));
      notify("Скупочный прайс сохранён. Эта конфигурация теперь оценивается автоматически.");
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }
  return <section className="panel quick-price">
    <h2>Мои цены скупки и продажи</h2>
    <p>Один раз укажите свой ориентир для точной конфигурации. Следующие оценки используют сохранённую цену. Это ваш прайс, а не средняя цена OLX.</p>
    <form onSubmit={save}>
      <fieldset disabled={busy} className="workspace-controls">
        <div className="formgrid">
          <label className="field">Модель скупочного прайса
            <input aria-label="Модель скупочного прайса" list="quick-price-models" value={form.model} onChange={(event) => changeModel(event.target.value)} />
            <datalist id="quick-price-models">{state.catalog.map((row) => <option key={row.name} value={row.name} />)}</datalist>
          </label>
          <Select label="Конфигурация скупочного прайса" value={form.storage + "|" + (form.ram ?? "")} onChange={(value) => {
            const [storage, ram] = value.split("|");
            setForm((previous) => ({ ...previous, storage: Number(storage), ram: ram ? Number(ram) : null }));
          }} options={configs.length ? configs.map((config) => [config.storage + "|" + (config.ram ?? ""), `${config.storage} ГБ${config.ram == null ? "" : ` / ОЗУ ${config.ram} ГБ`}`]) : [["|", "Добавьте конфигурацию в конструкторе"]]} />
          <Select label="SIM скупочного прайса" value={form.sim} onChange={(value) => update("sim", value)} options={simModes(model).map((mode) => [mode, simNames[mode] ?? mode])} />
          <Field label="Скупка от, ₸" type="number" min="0" step="any" value={form.buyMin} onChange={(value) => update("buyMin", value)} required />
          <Field label="Скупка до, ₸ (необязательно)" type="number" min="0" step="any" value={form.buyMax} onChange={(value) => update("buyMax", value)} placeholder="Пусто = цена «от»" />
          <Field label="Продажа от, ₸" type="number" min="0" step="any" value={form.saleMin} onChange={(value) => update("saleMin", value)} required />
          <Field label="Продажа до, ₸ (необязательно)" type="number" min="0" step="any" value={form.saleMax} onChange={(value) => update("saleMax", value)} placeholder="Пусто = цена «от»" />
          <Field label="Автор скупочного прайса" value={form.author} onChange={(value) => update("author", value)} required />
          <Field label="Дата проверки скупочного прайса" type="date" value={form.checkedAt} onChange={(value) => update("checkedAt", value)} required />
        </div>
        {!configs.length && <p className="warning">Нет подтверждённой памяти. Сначала добавьте её в «Настройки → Каталог моделей»; физическая ОЗУ не включает виртуальное расширение.</p>}
        <details>
          <summary>Базовое состояние и комплект этого прайса</summary>
          <p>По умолчанию: хороший экран и корпус, коробка есть, АКБ неизвестна. Выбранное состояние уже включено в цену и не вычитается повторно.</p>
          <div className="formgrid">
            <Select label="Базовый экран скупочного прайса" value={form.screen} onChange={(value) => update("screen", value)} options={conditions} />
            <Select label="Базовый корпус скупочного прайса" value={form.body} onChange={(value) => update("body", value)} options={conditions} />
            <label className="field check"><input type="checkbox" checked={form.box} onChange={(event) => update("box", event.target.checked)} />Коробка в базовом комплекте прайса</label>
            <Field label="Базовая АКБ скупочного прайса, %" type="number" min="0" max="100" value={form.battery} onChange={(value) => update("battery", value)} placeholder="Неизвестно" />
            <Field label="Примечание к скупочному прайсу" value={form.note} onChange={(value) => update("note", value)} />
          </div>
        </details>
        <p className="muted">Быстрая продажа: нижняя/верхняя цена продажи − {state.policy.quick}% по политике магазина. Снижение из импортированного документа к собственным ценам не применяется.</p>
        {preview && <div className="notice">
          <strong>Средний ориентир по вашему прайсу</strong>
          <p>Скупка: {money(preview.buyMiddle)} · Продажа: {money(preview.saleMiddle)}.</p>
          <p>Разница до ремонта, расходов и налогов: {money(preview.profitMiddle)}. Быстрая продажа: {money(preview.quickMin)} – {money(preview.quickMax)}.</p>
          <p>Середина введённого диапазона — арифметический ориентир. Максимум закупа дополнительно проверяется оценщиком по политике и состоянию устройства.</p>
        </div>}
        <button className="primary" type="submit" disabled={!configs.length}>{busy ? "Сохраняю прайс…" : "Сохранить мои цены"}</button>
      </fieldset>
    </form>
  </section>;
}
