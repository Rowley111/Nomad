import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import Valuator from "./components/Valuator.jsx";
import Prices from "./components/Prices.jsx";
import Inventory from "./components/Inventory.jsx";
import Settings from "./components/Settings.jsx";
import GuideImport from "./components/GuideImport.jsx";
import { readState, KEY, analytics, validateState } from "./domain/storage.js";
import { money } from "./domain/valuation.js";
import { Download } from "./components/Fields.jsx";
export function App() {
  const [initial] = useState(() => {
    try {
      return { state: readState(localStorage) };
    } catch (e) {
      return { error: e.message };
    }
  });
  const [state, setState] = useState(initial.state),
    [tab, setTab] = useState("valuator"),
    [message, setMessage] = useState("");
  const current = useRef(state);
  function commit(fn) {
    const previous = current.current;
    const persisted = localStorage.getItem(KEY);
    if (persisted !== null && persisted !== JSON.stringify(previous))
      throw new Error(
        "Данные изменены в другой вкладке. Перезагрузите страницу перед сохранением.",
      );
    const next = validateState(fn(previous));
    localStorage.setItem(KEY + "-before-write", JSON.stringify(previous));
    localStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setState(next);
  }
  if (initial.error)
    return (
      <main>
        <h1>Хранилище требует проверки</h1>
        <p role="alert">{initial.error}</p>
        <p>
          Данные не заменены стартовыми товарами. Сохраните исходные ключи и
          исправьте копию перед повторным открытием.
        </p>
        <Download
          name="nomad-storage-recovery.json"
          data={JSON.stringify(
            {
              v1: localStorage.getItem("nomad-inventory-v1"),
              v2: localStorage.getItem(KEY),
            },
            null,
            2,
          )}
        >
          Скачать исходные данные
        </Download>
      </main>
    );
  const totals = analytics(state);
  const tabs = [
    ["valuator", "Оценщик"],
    ["prices", "Прайс и источники"],
    ["stock", "Склад"],
    ["sales", "Продажи"],
    ["analytics", "Аналитика"],
    ["settings", "Настройки"],
  ];
  const props = { state, commit, notify: setMessage };
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <img
            className="brand-logo"
            src="/nomad-logo.svg"
            alt="Логотип Nomad Mobile"
            width="58"
            height="37"
          />
          <div>
            <strong>Nomad Mobile</strong>
            <small>Скупка и перепродажа</small>
          </div>
        </div>
        <nav>
          {tabs.map(([k, t]) => (
            <button
              key={k}
              className={tab === k ? "active" : ""}
              onClick={() => {
                setTab(k);
                setMessage("");
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="asidefoot">
          Астана · KZT · Asia/Almaty
          <br />
          Локальный режим · без синхронизации
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">NOMAD MOBILE / АСТАНА</span>
            <h1>{tabs.find(([k]) => k === tab)?.[1]}</h1>
          </div>
        </header>
        {message && (
          <div className="notice" role="status">
            {message}
            <button
              onClick={() => setMessage("")}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        )}
        {tab === "valuator" && (
          <>
            <GuideImport {...props} />
            <Valuator {...props} />
          </>
        )}
        {tab === "prices" && <Prices {...props} />}
        {tab === "stock" && <Inventory {...props} />}
        {tab === "sales" && <Inventory {...props} sales />}
        {tab === "settings" && <Settings {...props} />}
        {tab === "analytics" && (
          <>
            <div className="stats">
              {[
                ["Остаток", totals.stock + " устройств"],
                ["Вложено", money(totals.invested)],
                ["Ожидаемая разница до расходов", money(totals.expected)],
                ["Фактическая выручка", money(totals.revenue)],
                ["Результат после прямых расходов", money(totals.profit)],
              ].map(([t, v]) => (
                <article key={t}>
                  <span>{t}</span>
                  <strong>{v}</strong>
                </article>
              ))}
            </div>
            <section className="panel">
              <p>
                Подтверждённых продаж: {totals.sold}. Старые записи со статусом
                «Продан» без фактических сумм исключены. Налоги и общие расходы
                не учтены. Рабочий склад не заполняется демоданными.
              </p>
              <h2>Сохранённые оценки ({state.assessments.length})</h2>
              {state.assessments.map((x) => (
                <details key={x.id}>
                  <summary>
                    {x.input.model} · {x.at} · {money(x.showcase)}
                  </summary>
                  <pre>{JSON.stringify(x, null, 2)}</pre>
                </details>
              ))}
            </section>
          </>
        )}
        <footer>
          Nomad Mobile · Данные в этом браузере · Регулярно сохраняйте полную
          копию JSON в настройках.
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
