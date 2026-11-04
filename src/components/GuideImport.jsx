import React, { useState } from "react";
import { readDocxGuide, previewGuide } from "../domain/guide.js";
import { mergePrices, validatePrice } from "../domain/imports.js";
import { Field, Download } from "./Fields.jsx";
import { money } from "../domain/valuation.js";
import { catalogForGuide } from "../domain/catalog.js";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function GuideImport({ state, commit, notify, storageMode = "local" }) {
  const [preview, setPreview] = useState(null),
    [loading, setLoading] = useState(false),
    [date, setDate] = useState(today()),
    [raw, setRaw] = useState(null);
  const count = state.prices.filter((p) => p.source === "owner-guide").length;
  return (
    <section className="panel guide-banner">
      <div>
        <span className="price-badge">БЕЗ OLX · ВАШ ПРАЙС</span>
        <h2>
          {count
            ? `Справочник скупки: ${count} конфигураций`
            : "Подключите ваш прайс телефонов"}
        </h2>
        <p>
          {count
            ? "Прайс уже сохранён. Выберите модель и память — оценка появится автоматически."
            : storageMode === "cloud"
              ? "Загрузите DOCX один раз. После подтверждения цены сохранятся в общей базе."
              : "Загрузите DOCX один раз. Сайт сохранит цены в этом браузере и будет оценивать выбранный телефон автоматически."}{" "}
          iPhone: снижение {money(state.policy.guideIphoneDiscount ?? 30000)};
          Android: {money(state.policy.guideAndroidDiscount ?? 0)}. Изменить
          можно в настройках.
        </p>
      </div>
      {!!state.setupImports?.at(-1)?.pendingRows?.length && (
        <details>
          <summary>
            Конфигурации для уточнения (
            {state.setupImports.at(-1).pendingRows.length})
          </summary>
          {state.setupImports.at(-1).pendingRows.map((row, i) => (
            <p key={i}>
              {row.model ?? "Строка документа"} {row.storage ?? ""}:{" "}
              {row.message}
            </p>
          ))}
        </details>
      )}
      <details open={!count}>
        <summary>
          {count
            ? "Обновить справочник из файла"
            : "Загрузить DOCX / JSON с предпросмотром"}
        </summary>
        <p className="source-note">
          Это справочные цены из переписки, не онлайн-мониторинг рынка. Файл
          обрабатывается на устройстве, без отправки сторонним сервисам. Дата
          редакции не становится датой проверки рынка.
        </p>
        <Field
          label="Дата редакции документа"
          value={date}
          type="date"
          onChange={(v) => {
            setDate(v);
            setPreview(null);
          }}
        />
        <input
          aria-label="Загрузить справочник DOCX или JSON"
          type="file"
          accept=".docx,.json"
          disabled={loading}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setLoading(true);
            setPreview(null);
            try {
              if (f.size > 5e6) throw new Error("Файл больше 5 МБ");
              const guide = f.name.toLowerCase().endsWith(".docx")
                ? readDocxGuide(await f.arrayBuffer(), f.name, date)
                : JSON.parse(await f.text());
              const catalog = catalogForGuide(state.catalog);
              const report = previewGuide(guide, catalog);
              const valid = [],
                errors = [];
              for (const row of report.valid) {
                try {
                  valid.push(validatePrice(row, catalog));
                } catch (err) {
                  errors.push({ model: row.model, message: err.message });
                }
              }
              setPreview({
                ...report,
                valid,
                pending: [...report.pending, ...errors],
              });
              setRaw(guide);
            } catch (err) {
              notify(err.message);
            } finally {
              setLoading(false);
              e.target.value = "";
            }
          }}
        />
        {loading && <p role="status">Читаю таблицы прайса…</p>}
        {preview && (
          <>
            <h3>
              Предпросмотр: {preview.sourceName} · {preview.documentDate}
            </h3>
            <p>
              Готово к сохранению: {preview.valid.length}. Требуют уточнения /
              пропущены: {preview.pending.length}. Склад и прежние оценки не
              меняются. Существующий ручной прайс остаётся отдельно; повторная
              загрузка обновит те же ключи.
            </p>
            <div className="guide-grid">
              {preview.valid.slice(0, 6).map((x) => (
                <div key={x.id} className="guide-row">
                  <b>
                    {x.model} · {x.storage} ГБ
                  </b>
                  <span>
                    Скупка файла: {money(x.buyMin)}–{money(x.buyMax)}
                  </span>
                  <span>Витрина: {money(x.price)}</span>
                </div>
              ))}
            </div>
            <details>
              <summary>
                Все строки, требующие уточнения ({preview.pending.length})
              </summary>
              {preview.pending.map((x, i) => (
                <p key={i}>
                  {x.model ?? "Строка " + x.row} {x.storage ?? ""}: {x.message}
                </p>
              ))}
            </details>
            <div className="actions wrap">
              <button
                className="primary"
                disabled={!preview.valid.length}
                onClick={async () => {
                  try {
                    await commit((s) =>
                      mergePrices(
                        { ...s, catalog: catalogForGuide(s.catalog) },
                        preview.valid,
                      ),
                    );
                    setPreview(null);
                    notify(
                      "Справочник подключён. Выберите модель в оценщике — цена подставится автоматически.",
                    );
                  } catch (err) {
                    notify(err.message);
                  }
                }}
              >
                Подтвердить сохранение справочника
              </button>
              {raw && (
                <Download
                  name="nomad-owner-price-guide.json"
                  data={JSON.stringify(raw, null, 2)}
                >
                  Скачать распознанный JSON
                </Download>
              )}
            </div>
          </>
        )}
      </details>
    </section>
  );
}
