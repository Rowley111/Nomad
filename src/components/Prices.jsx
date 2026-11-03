import React, { useState } from "react";
import { Field, Select, conditions, simOptions, Download } from "./Fields.jsx";
import {
  validatePrice,
  previewPrices,
  mergePrices,
  pricesCSV,
} from "../domain/imports.js";
import { money } from "../domain/valuation.js";
import GuideImport from "./GuideImport.jsx";
const blank = {
  model: "Samsung Galaxy A35 5G",
  storage: 128,
  ram: 8,
  sim: "physical",
  market: "Астана",
  currency: "KZT",
  channel: "store-cash",
  price: "",
  source: "owner",
  checkedAt: new Date().toISOString().slice(0, 10),
  author: "",
  screen: "good",
  body: "good",
  box: true,
  battery: "",
  note: "",
  buyMin: "",
  buyMax: "",
  saleMin: "",
  saleMax: "",
  quickMin: "",
  quickMax: "",
  sourceName: "Ручной справочник владельца",
};
export default function Prices({ state, commit, notify }) {
  const [form, setForm] = useState(blank),
    [search, setSearch] = useState(""),
    [text, setText] = useState(""),
    [format, setFormat] = useState("json"),
    [preview, setPreview] = useState(null);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const model = state.catalog.find((x) => x.name === form.model);
  function save(e) {
    e.preventDefault();
    try {
      const row = validatePrice(form, state.catalog);
      commit((s) => mergePrices(s, [row]));
      notify("Прайс сохранён. Следующая оценка получит цену автоматически.");
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <>
      <GuideImport state={state} commit={commit} notify={notify} />
      <div className="columns">
        <section className="panel">
          <h2>Сохранить ориентир владельца</h2>
          <p>
            Цена относится к точной памяти, состоянию и комплектации. Это не
            медиана OLX.
          </p>
          <form onSubmit={save}>
            <div className="formgrid">
              <Select
                label="Тип прайса"
                value={form.source}
                options={[
                  ["owner", "Ориентир продажи"],
                  ["owner-guide", "Скупка и продажа по справочнику"],
                ]}
                onChange={(v) => set("source", v)}
              />
              {form.source === "owner-guide" && (
                <>
                  <Field
                    label="Название документа-источника"
                    value={form.sourceName}
                    onChange={(v) => set("sourceName", v)}
                    required
                  />
                  {[
                    ["buyMin", "Скупка от, ₸ (до снижения)"],
                    ["buyMax", "Скупка до, ₸ (до снижения)"],
                    ["saleMin", "После торга от, ₸"],
                    ["saleMax", "После торга до, ₸"],
                    ["quickMin", "Быстрая продажа от, ₸"],
                    ["quickMax", "Быстрая продажа до, ₸"],
                  ].map(([k, t]) => (
                    <Field
                      key={k}
                      label={t}
                      value={form[k]}
                      type="number"
                      min="0"
                      required
                      onChange={(v) => set(k, v)}
                    />
                  ))}
                </>
              )}

              <Select
                label="Модель"
                value={form.model}
                options={state.catalog.map((x) => x.name)}
                onChange={(v) => {
                  const c = state.catalog.find((x) => x.name === v)?.configs[0];
                  setForm((x) => ({
                    ...x,
                    model: v,
                    storage: c?.storage ?? "",
                    ram: c?.ram ?? null,
                    sim: v === "iPhone Air" ? "esim" : "physical",
                  }));
                }}
              />
              <Select
                label="Конфигурация"
                value={form.storage + "|" + (form.ram ?? "")}
                options={
                  model?.configs.length
                    ? model.configs.map((c) => [
                        c.storage + "|" + (c.ram ?? ""),
                        c.storage + " ГБ / ОЗУ " + (c.ram ?? "—"),
                      ])
                    : [["|", "Сначала подтвердите конфигурацию в настройках"]]
                }
                onChange={(v) => {
                  const [storage, ram] = v.split("|");
                  setForm((x) => ({
                    ...x,
                    storage: Number(storage),
                    ram: ram ? Number(ram) : null,
                  }));
                }}
              />
              <Select
                label="SIM"
                value={form.sim}
                onChange={(v) => set("sim", v)}
                options={simOptions}
              />
              <Field
                label="Цена витрины, ₸"
                type="number"
                min="0"
                value={form.price}
                onChange={(v) => set("price", v)}
                required
              />
              <Field
                label="Проверено"
                type="date"
                value={form.checkedAt}
                onChange={(v) => set("checkedAt", v)}
                required
              />
              <Field
                label="Автор изменения"
                value={form.author}
                onChange={(v) => set("author", v)}
                required
              />
              <Select
                label="Базовый экран"
                value={form.screen}
                options={conditions}
                onChange={(v) => set("screen", v)}
              />
              <Select
                label="Базовый корпус"
                value={form.body}
                options={conditions}
                onChange={(v) => set("body", v)}
              />
              <Field
                label="Базовая АКБ (пусто = неизвестно)"
                value={form.battery}
                type="number"
                min="0"
                max="100"
                onChange={(v) => set("battery", v)}
              />
              {form.source === "owner-guide" && (
                <Select
                  label="Базовая коробка"
                  value={form.box == null ? "unknown" : String(form.box)}
                  options={[
                    ["unknown", "Не указана"],
                    ["true", "Есть"],
                    ["false", "Нет"],
                  ]}
                  onChange={(v) =>
                    set("box", v === "unknown" ? null : v === "true")
                  }
                />
              )}
              <label className="check">
                <input
                  type="checkbox"
                  disabled={form.source === "owner-guide"}
                  checked={form.box ?? false}
                  onChange={(e) => set("box", e.target.checked)}
                />
                Базовый комплект: коробка
              </label>
              <Field
                label="Пояснение (включая комплект и износ)"
                value={form.note}
                onChange={(v) => set("note", v)}
                required
              />
            </div>
            <button type="submit" className="primary">
              Сохранить прайс
            </button>
          </form>
          <p className="muted">
            Изменения формы не сохранены до нажатия кнопки. Совпадающий ключ
            обновляет запись с историей; иное базовое состояние создаёт
            отдельный ориентир.
          </p>
        </section>
        <section className="panel">
          <h2>Прайс и источники ({state.prices.length})</h2>
          <Field label="Поиск" value={search} onChange={setSearch} />
          {state.prices
            .filter((x) => x.model.toLowerCase().includes(search.toLowerCase()))
            .map((x) => (
              <article className="pricecard" key={x.id}>
                <b>
                  {x.model} · {x.ram ?? "—"}/{x.storage} ГБ · {money(x.price)}
                </b>
                <p>
                  {x.base.screen}/{x.base.body} · коробка{" "}
                  {x.base.box == null
                    ? "не указана"
                    : x.base.box
                      ? "есть"
                      : "нет"}{" "}
                  · {x.checkedAt} · {x.author}
                </p>
                <p>{x.note}</p>
                {x.source === "owner-guide" && (
                  <p>
                    Скупка файла: {money(x.buyMin)} – {money(x.buyMax)} ·{" "}
                    {x.sourceName}
                    <br />
                    Снижение применяется при оценке, исходные цены сохранены.
                  </p>
                )}
                <button
                  onClick={() =>
                    setForm({
                      ...x,
                      base: undefined,
                      ...x.base,
                      battery: x.base.battery ?? "",
                    })
                  }
                >
                  Изменить
                </button>
              </article>
            ))}
          {!state.prices.length && (
            <p>
              Прайс пуст. Можно сохранить контрольный A35: 89 000 ₸, хорошее
              состояние, коробка и следы от чехла. Демо-товар на склад не
              добавляется.
            </p>
          )}
          <div className="actions wrap">
            <Download
              name="nomad-prices.json"
              data={JSON.stringify(state.prices, null, 2)}
            >
              Экспорт JSON
            </Download>
            <Download
              name="nomad-prices.csv"
              type="text/csv;charset=utf-8"
              data={pricesCSV(state.prices)}
            >
              Экспорт CSV
            </Download>
          </div>
          <details>
            <summary>История изменений ({state.priceHistory.length})</summary>
            {state.priceHistory
              .slice()
              .reverse()
              .map((x) => (
                <p key={x.id}>
                  {x.at} · {x.author} · {x.after.model}:{" "}
                  {money(x.before?.price)} → {money(x.after.price)}
                </p>
              ))}
          </details>
          <h3>OLX Казахстан</h3>
          <p>
            Автоматическое получение объявлений не подключено. Последнее
            успешное обновление: отсутствует.
          </p>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.olx.kz/astana/q-samsung-galaxy-a35/"
          >
            Открыть поиск на OLX в Астане
          </a>
          <p className="muted">Поиск в новой вкладке не обновляет прайс.</p>
        </section>
      </div>
      <section className="panel">
        <h2>Импорт прайса с предпросмотром</h2>
        <Select
          label="Формат"
          value={format}
          onChange={(v) => {
            setFormat(v);
            setPreview(null);
          }}
          options={["json", "csv"]}
        />
        <input
          aria-label="Файл прайса"
          type="file"
          accept=".csv,.json"
          onChange={async (e) => {
            try {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 5e6) throw new Error("Файл больше 5 МБ");
              setText(await file.text());
              setFormat(file.name.endsWith(".csv") ? "csv" : "json");
              setPreview(null);
            } catch (e) {
              notify(e.message);
            }
          }}
        />
        <textarea
          aria-label="Данные импорта"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
        <button
          onClick={() => {
            try {
              setPreview(previewPrices(text, format, state.catalog));
            } catch (e) {
              notify(e.message);
            }
          }}
        >
          Проверить импорт
        </button>
        {preview && (
          <>
            <p>
              Корректно: {preview.valid.length}. Ошибок: {preview.errors.length}
              . Склад не изменяется.
            </p>
            {preview.errors.map((x) => (
              <p key={x.row}>
                Строка {x.row}: {x.message}
              </p>
            ))}
            <pre>{JSON.stringify(preview.valid.slice(0, 5), null, 2)}</pre>
            <button
              disabled={!preview.valid.length || !!preview.errors.length}
              onClick={() => {
                try {
                  commit((s) => mergePrices(s, preview.valid));
                  setPreview(null);
                  notify("Импорт завершён без дублирования ключей");
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              Подтвердить импорт прайса
            </button>
          </>
        )}
      </section>
    </>
  );
}
