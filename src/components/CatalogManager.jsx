import React, { useRef, useState } from "react";
import { Field, Select } from "./Fields.jsx";
import { saveCatalogModel, upgradeCatalog, CATALOG_REVISION } from "../domain/catalog-management.js";

const kindLabel = (model) => model.deviceType === "tablet" ? "Планшет" : "Смартфон";
const configLabel = (config) => `${config.storage} ГБ${config.ram == null ? "" : ` / ОЗУ ${config.ram} ГБ`}`;
const freshRow = () => ({ storage: "", ram: "", key: crypto.randomUUID() });
const blank = () => ({ name: "", brand: "", deviceType: "phone", connectivity: "phone", biometric: "unknown", source: "", configs: [freshRow()] });
const asForm = (model) => ({
  ...model,
  deviceType: model.deviceType ?? "phone",
  connectivity: model.connectivity ?? "phone",
  biometric: model.biometric ?? (model.name.startsWith("iPhone") ? "faceid" : "unknown"),
  configs: model.configs.length ? model.configs.map((row) => ({ ...row, key: crypto.randomUUID() })) : [freshRow()],
});

export default function CatalogManager({ state, commit, notify, onEditPrice }) {
  const formRef = useRef(null);
  const [search, setSearch] = useState(""), [brand, setBrand] = useState(""), [kind, setKind] = useState(""),
    [limit, setLimit] = useState(24), [form, setForm] = useState(null),
    [originalName, setOriginalName] = useState(null), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const brands = [...new Set(state.catalog.map((model) => model.brand))].sort((a, b) => a.localeCompare(b, "ru"));
  const normalized = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = state.catalog.filter((model) =>
    (!brand || model.brand === brand) && (!kind || (model.deviceType ?? "phone") === kind) &&
    (!normalized || `${model.brand} ${model.name}`.toLocaleLowerCase("ru-RU").includes(normalized)));
  const apple = form?.brand.trim().toLocaleLowerCase("en-US") === "apple";
  const update = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setDirty(true); };
  function selectModel(model) {
    if (dirty && !window.confirm("Есть несохранённые поля модели. Открыть другую модель и очистить их?")) return;
    setOriginalName(model?.name ?? null); setForm(model ? asForm(model) : blank()); setDirty(false);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function updateConfig(key, field, value) {
    setForm((previous) => ({ ...previous, configs: previous.configs.map((row) => row.key === key ? { ...row, [field]: value } : row) }));
    setDirty(true);
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const value = { ...form, source: form.source.trim() || "Конфигурация подтверждена владельцем", configs: form.configs.map(({ storage, ram }) => ({ storage, ram: apple ? null : ram })) };
      await commit((previous) => saveCatalogModel(previous, originalName, value));
      setOriginalName(value.name.trim()); setForm((previous) => ({ ...previous, name: value.name.trim() })); setDirty(false);
      notify("Модель и конфигурации сохранены. Цену можно задать в разделе «Прайс и источники».");
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel catalog-manager">
      <div className="catalog-heading">
        <div><h2>Каталог моделей и конфигураций</h2><p className="muted">Моделей: {state.catalog.length}. Смартфоны и планшеты. Собственные модели добавляются без изменения кода.</p></div>
        <button type="button" className="primary" onClick={() => selectModel(null)}>Добавить модель</button>
      </div>
      <p>Название и наличие модели в каталоге не подтверждают её цену. Укажите точную модификацию 4G/5G, память и физическую ОЗУ; виртуальное расширение ОЗУ не добавляйте.</p>
      {(state.catalogRevision ?? 0) < CATALOG_REVISION && <div className="notice">
        <p>Доступен расширенный каталог популярных смартфонов и планшетов. Ваши записи и цены сохранятся.</p>
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await commit(upgradeCatalog); notify("Расширенный каталог сохранён"); }
          catch (error) { notify(error.message); }
          finally { setBusy(false); }
        }}>Добавить готовый каталог</button>
      </div>}
      {form && <form ref={formRef} onSubmit={save} className="catalog-form">
        <h3>{originalName ? `Модель: ${originalName}` : "Новая модель"}</h3>
        <fieldset className="workspace-controls" disabled={busy}>
          <div className="formgrid">
            <Field label="Марка/бренд" value={form.brand} list="catalog-brands" required onChange={(value) => {
              setForm((previous) => ({ ...previous, brand: value, configs: previous.configs.map((row) => ({ ...row, ram: value.trim().toLowerCase() === "apple" ? null : row.ram ?? "" })) })); setDirty(true);
            }} />
            <datalist id="catalog-brands">{brands.map((name) => <option key={name} value={name} />)}</datalist>
            <Field label="Название модели" value={form.name} required placeholder="Например, OPPO A78 4G" onChange={(value) => update("name", value)} />
            <Select label="Тип устройства" value={form.deviceType} options={[["phone", "Смартфон"], ["tablet", "Планшет"]]} onChange={(value) => {
              setForm((previous) => ({ ...previous, deviceType: value, connectivity: value === "tablet" ? "wifi" : "phone" })); setDirty(true);
            }} />
            <Select label="Подключение" value={form.connectivity} options={form.deviceType === "tablet" ? [["wifi", "Только Wi-Fi, без SIM"], ["cellular", "Сотовая связь / Cellular"]] : [["phone", "Сотовая связь"]]} onChange={(value) => update("connectivity", value)} />
            <Select label="Биометрия" value={form.biometric} options={[["unknown", "Не уточнено"], ["faceid", "Face ID"], ["fingerprint", "Отпечаток / Touch ID"], ["none", "Нет"]]} onChange={(value) => update("biometric", value)} />
            <Field label="Источник конфигураций" value={form.source} placeholder="Официальная страница или проверка владельцем" onChange={(value) => update("source", value)} />
          </div>
          <h3>Варианты памяти</h3>
          <p className="muted">Добавляйте только существующие пары памяти и ОЗУ. Для Apple достаточно встроенной памяти.</p>
          <div className="catalog-configs">
            {form.configs.map((row, index) => <div className="catalog-config" key={row.key}>
              <span className="catalog-config-number">{index + 1}</span>
              <Field label="Встроенная память, ГБ" value={row.storage} type="number" min="1" step="1" required onChange={(value) => updateConfig(row.key, "storage", value)} />
              {!apple && <Field label="Физическая ОЗУ, ГБ" value={row.ram} type="number" min="1" step="1" required onChange={(value) => updateConfig(row.key, "ram", value)} />}
              <button type="button" className="danger" aria-label={`Убрать конфигурацию ${index + 1}`} onClick={() => { setForm((previous) => ({ ...previous, configs: previous.configs.filter((config) => config.key !== row.key) })); setDirty(true); }}>Убрать</button>
            </div>)}
          </div>
          {!form.configs.length && <p className="warning">Память пока не добавлена. Модель можно сохранить без конфигураций, но для оценки сначала потребуется подтвердить память.</p>}
          <div className="actions wrap">
            <button type="button" onClick={() => { setForm((previous) => ({ ...previous, configs: [...previous.configs, freshRow()] })); setDirty(true); }}>Добавить конфигурацию</button>
            <button type="submit" className="primary">{busy ? "Сохраняю…" : "Сохранить модель"}</button>
            <button type="button" onClick={() => { if (!dirty || window.confirm("Закрыть форму без сохранения?")) { setForm(null); setDirty(false); } }}>Закрыть форму</button>
          </div>
          <p className="muted">{dirty ? "Есть несохранённые изменения." : "Изменения сохраняются по кнопке «Сохранить модель»."} Используемые прайсом конфигурации и исторические данные защищены от удаления.</p>
        </fieldset>
      </form>}
      <div className="catalog-filters">
        <Field label="Поиск в каталоге" value={search} placeholder="Модель или бренд" onChange={(value) => { setSearch(value); setLimit(24); }} />
        <Select label="Бренд каталога" value={brand} options={[["", "Все бренды"], ...brands]} onChange={(value) => { setBrand(value); setLimit(24); }} />
        <Select label="Тип каталога" value={kind} options={[["", "Все устройства"], ["phone", "Смартфоны"], ["tablet", "Планшеты"]]} onChange={(value) => { setKind(value); setLimit(24); }} />
      </div>
      <p className="muted">Найдено: {filtered.length}</p>
      <div className="catalog-list">
        {filtered.slice(0, limit).map((model) => {
          const prices = state.prices.filter((price) => price.model === model.name).length;
          return <article className="catalog-card" key={model.name}>
            <div><span className="catalog-kind">{model.brand} · {kindLabel(model)}{model.connectivity === "wifi" ? " · Wi-Fi" : model.connectivity === "cellular" ? " · Cellular" : ""}</span><h3>{model.name}</h3></div>
            <p>{model.configs.length ? model.configs.map(configLabel).join("; ") : "Конфигурации требуется подтвердить"}</p>
            <p className="muted">{prices ? `Записей прайса: ${prices}` : "Прайс не задан"}</p>
            <details><summary>Источник конфигураций</summary><p className="muted">{model.verified ? "Данные производителя" : "Конфигурация владельца или данные на уточнение"}: {model.source}</p></details>
            <div className="actions wrap"><button type="button" aria-label={`Редактировать модель ${model.name}`} onClick={() => selectModel(model)}>Редактировать</button>{onEditPrice && <button type="button" onClick={() => {
              if (dirty && !window.confirm("Открыть прайс? Несохранённые поля модели будут очищены.")) return;
              onEditPrice(model.name);
            }}>Настроить прайс</button>}</div>
          </article>;
        })}
      </div>
      {!filtered.length && <p>Совпадений нет. Нажмите «Добавить модель», чтобы внести свой вариант.</p>}
      {filtered.length > limit && <button type="button" onClick={() => setLimit((previous) => previous + 24)}>Показать ещё 24</button>}
    </section>
  );
}
