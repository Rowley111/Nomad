import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import Valuator from "./components/Valuator.jsx";
import Prices from "./components/Prices.jsx";
import Inventory from "./components/Inventory.jsx";
import Settings from "./components/Settings.jsx";
import GuideImport from "./components/GuideImport.jsx";
import Repairs from "./components/Repairs.jsx";
import RepairReport from "./components/RepairReport.jsx";
import { ensureRepairState } from "./domain/repairs.js";
import { readState, KEY, analytics, validateState } from "./domain/storage.js";
import { money } from "./domain/valuation.js";
import { Download } from "./components/Fields.jsx";
import {
  captureSetupRequest,
  loadSetupGuide,
  applySetupGuide,
} from "./domain/setup.js";
const startupSetupRequest = captureSetupRequest(
  window.location,
  window.history,
);
export function App() {
  const [setupRequest, setSetupRequest] = useState(startupSetupRequest);
  const [settingUp, setSettingUp] = useState(
    Boolean(setupRequest && !setupRequest.error),
  );
  const [initial] = useState(() => {
    try {
      return { state: readState(localStorage) };
    } catch (e) {
      return { error: e.message };
    }
  });
  const [state, setState] = useState(initial.state),
    [tab, setTab] = useState("valuator"),
    [message, setMessage] = useState(""),
    [analyticsView, setAnalyticsView] = useState("repairs");
  const current = useRef(state);
  function commit(fn) {
    const previous = current.current;
    const persisted = localStorage.getItem(KEY);
    if (persisted !== null && persisted !== JSON.stringify(previous))
      throw new Error(
        "Данные изменены в другой вкладке. Перезагрузите страницу перед сохранением.",
      );
    const next = ensureRepairState(validateState(fn(previous)));
    localStorage.setItem(KEY + "-before-write", JSON.stringify(previous));
    localStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setState(next);
  }
  useEffect(() => {
    const receiveSetup = () => {
      const request = captureSetupRequest(window.location, window.history);
      if (request) {
        setMessage("");
        setSettingUp(!request.error);
        setSetupRequest(request);
      }
    };
    window.addEventListener("hashchange", receiveSetup);
    return () => window.removeEventListener("hashchange", receiveSetup);
  }, []);
  useEffect(() => {
    if (!setupRequest || !initial.state) {
      setSettingUp(false);
      return;
    }
    if (setupRequest.error) {
      setMessage(setupRequest.error);
      return;
    }
    const controller = new AbortController();
    const request = { ...setupRequest };
    (async () => {
      try {
        const existing = (current.current.setupImports ?? []).find(
          (x) => x.id === setupRequest.id,
        );
        if (existing) {
          setMessage("Этот прайс уже подключён. Выберите модель для оценки.");
          return;
        }
        const guide = await loadSetupGuide(request, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        let report;
        commit((state) => {
          const result = applySetupGuide(state, guide, setupRequest.id);
          report = result.report;
          return result.state;
        });
        setMessage(
          `Готово! Прайс подключён: добавлено ${report.added}, прежних цен сохранено ${report.kept}. Требуют уточнения: ${report.pending}. Выберите модель и память — оценка появится автоматически.`,
        );
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error.message);
      } finally {
        request.key = "";
        if (!controller.signal.aborted) {
          setupRequest.key = "";
          setSettingUp(false);
        }
      }
    })();
    return () => controller.abort();
  }, [initial, setupRequest]);
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
    ["repairs", "Ремонты"],
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
        {settingUp && (
          <div className="notice" role="status">
            Подключаю ваш прайс автоматически…
          </div>
        )}
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
        {tab === "repairs" && <Repairs {...props} />}
        {tab === "analytics" && (
          <>
            <div className="actions wrap repair-tabs">
              <button
                className={analyticsView === "repairs" ? "primary" : ""}
                onClick={() => setAnalyticsView("repairs")}
              >
                Ремонты за период
              </button>
              <button
                className={analyticsView === "trade" ? "primary" : ""}
                onClick={() => setAnalyticsView("trade")}
              >
                Склад и продажи
              </button>
            </div>
            {analyticsView === "repairs" ? (
              <RepairReport state={state} />
            ) : (
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
                    Подтверждённых продаж: {totals.sold}. Старые записи со
                    статусом «Продан» без фактических сумм исключены. Налоги и
                    общие расходы не учтены. Рабочий склад не заполняется
                    демоданными.
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
