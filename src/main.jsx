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
import CloudAccess from "./components/CloudAccess.jsx";
import CloudStorage from "./components/CloudStorage.jsx";
import { API_URL } from "./domain/remote.js";
import { ensureRepairState } from "./domain/repairs.js";
import { readState, emptyState, KEY, analytics, validateState } from "./domain/storage.js";
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
function Workspace({ remote, cloudInitial, onExit }) {
  const cloud = Boolean(remote);
  const admin = !cloud || remote.user.role === "admin";
  const [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [remoteChanged, setRemoteChanged] = useState(false),
    [connectionError, setConnectionError] = useState(""),
    [viewEpoch, setViewEpoch] = useState(0);
  const busyRef = useRef(false), dirtyRef = useRef(false);
  const [setupRequest, setSetupRequest] = useState(startupSetupRequest);
  const [settingUp, setSettingUp] = useState(
    Boolean(setupRequest && !setupRequest.error),
  );
  const [initial] = useState(() => {
    try {
      return { state: cloud ? ensureRepairState(validateState(cloudInitial.state ?? emptyState())) : readState(localStorage) };
    } catch (e) {
      return { error: e.message };
    }
  });
  const [state, setState] = useState(initial.state),
    [tab, setTab] = useState("valuator"),
    [message, setMessage] = useState(""),
    [analyticsView, setAnalyticsView] = useState("repairs");
  const [priceModel, setPriceModel] = useState("");
  const current = useRef(state);
  function applyRemote(result) {
    const next = ensureRepairState(validateState(result.state));
    remote.revision = result.revision;
    current.current = next;
    setState(next);
    dirtyRef.current = false;
    setUncertain(false);
    setRemoteChanged(false);
    setConnectionError("");
  }
  function remoteFailure(error) {
    if (error.status === 409) setRemoteChanged(true);
    if (error.status === 401) onExit();
    setUncertain(Boolean(remote?.pending));
  }
  async function commit(fn) {
    if (busyRef.current) throw new Error("Дождитесь завершения сохранения");
    if (cloud && (remoteChanged || remote.pending))
      throw new Error(remoteChanged ? "База изменена другим сотрудником. Загрузите новую версию перед сохранением." : "Сначала повторите незавершённое сохранение");
    const previous = current.current;
    const next = ensureRepairState(validateState(fn(previous)));
    if (cloud) {
      busyRef.current = true; setSaving(true);
      try { applyRemote(await remote.write(next)); }
      catch (error) { remoteFailure(error); throw error; }
      finally { busyRef.current = false; setSaving(false); }
      return;
    }
    const persisted = localStorage.getItem(KEY);
    if (persisted !== null && persisted !== JSON.stringify(previous))
      throw new Error("Данные изменены в другой вкладке. Перезагрузите страницу перед сохранением.");
    localStorage.setItem(KEY + "-before-write", JSON.stringify(previous));
    localStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setState(next);
  }
  async function refreshRemote() {
    if (busyRef.current || remote.pending) return;
    if (!window.confirm("Загрузить текущую версию базы? Несохранённые поля будут очищены.")) return;
    setSaving(true); busyRef.current = true;
    try {
      const result = await remote.load();
      if (!result.state) throw new Error("Рабочее пространство не найдено");
      applyRemote(result); setViewEpoch((x) => x + 1);
      setMessage("Загружена текущая версия общей базы");
    } catch (error) { remoteFailure(error); setMessage(error.message); }
    finally { setSaving(false); busyRef.current = false; }
  }
  async function importRemote(previewId, operationId) {
    if (busyRef.current || remote.pending) throw new Error("Дождитесь завершения текущей операции");
    busyRef.current = true; setSaving(true);
    try {
      const result = await remote.request("/import/commit", { method: "POST", body: { previewId, operationId } });
      applyRemote(result); return result;
    } catch (error) { remoteFailure(error); throw error; }
    finally { busyRef.current = false; setSaving(false); }
  }
  useEffect(() => {
    if (!remote) return;
    let active = true;
    const check = async () => {
      if (busyRef.current || remote.pending) return;
      const expectedRevision = remote.revision;
      try {
        const result = await remote.request("/workspace");
        if (!active || busyRef.current || remote.revision !== expectedRevision) return;
        setConnectionError("");
        if (result.revision !== expectedRevision) setRemoteChanged(true);
      } catch (error) {
        if (!active) return;
        if (error.status === 401) onExit();
        else setConnectionError("Общая база недоступна. Показана последняя загруженная версия; новые изменения требуют подтверждения сервера.");
      }
    };
    const timer = setInterval(check, 15000);
    const beforeUnload = (event) => {
      if (dirtyRef.current || remote.pending || busyRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { active = false; clearInterval(timer); window.removeEventListener("beforeunload", beforeUnload); };
  }, [remote, onExit]);
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
    if (!setupRequest || !initial.state || !admin) {
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
        if (cloud && !window.confirm("Подключить прайс из приватной ссылки к общей базе магазина?")) return;
        let report;
        await commit((state) => {
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
  ].filter(([key]) => admin || !["prices", "settings"].includes(key));
  const props = { state, commit, notify: setMessage, storageMode: cloud ? "cloud" : "local",
    onEditPrice: admin ? (model) => { setPriceModel(model); setTab("prices"); } : undefined,
    onManageCatalog: admin ? () => setTab("settings") : undefined };
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
              disabled={saving || uncertain}
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
          {cloud ? `Общая база · ${remote.user.username}` : "Локальный режим · без синхронизации"}
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">NOMAD MOBILE / АСТАНА</span>
            <h1>{tabs.find(([k]) => k === tab)?.[1]}</h1>
          </div>
          {cloud && <div className="cloud-account"><span>{remote.user.role === "admin" ? "Администратор" : "Сотрудник"} · версия {remote.revision}</span><button disabled={saving} onClick={async () => {
            if ((dirtyRef.current || remote.pending) && !window.confirm("Завершить сеанс с несохранёнными данными?")) return;
            try { await remote.logout(); } catch { /* Local memory is still cleared. */ }
            onExit();
          }}>Выйти</button></div>}
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
        {cloud && connectionError && <p className="warning" role="alert">{connectionError}</p>}
        {cloud && remoteChanged && <div className="notice" role="alert">База изменена другим сотрудником. Несохранённые поля сохранены на экране. Перед новой записью загрузите текущую версию.<button disabled={saving} onClick={refreshRemote}>Загрузить текущую версию базы</button></div>}
        {cloud && uncertain && <div className="notice" role="alert">Сервер не подтвердил сохранение. Повтор использует тот же номер операции.<button disabled={saving} onClick={async () => {
          busyRef.current = true; setSaving(true);
          try { applyRemote(await remote.retry()); setMessage("Сохранение подтверждено сервером"); }
          catch (error) { remoteFailure(error); setMessage(error.message); }
          finally { busyRef.current = false; setSaving(false); }
        }}>Повторить сохранение</button></div>}
        {saving && <p role="status">Сохраняю в общую базу…</p>}
        <fieldset key={viewEpoch} className="workspace-controls" disabled={saving || uncertain || remoteChanged} onChangeCapture={() => { if (cloud) dirtyRef.current = true; }}>
        {tab === "valuator" && (
          <>
            {admin && <GuideImport {...props} />}
            <Valuator {...props} />
          </>
        )}
        {tab === "prices" && <Prices {...props} initialModel={priceModel} />}
        {tab === "stock" && <Inventory {...props} />}
        {tab === "sales" && <Inventory {...props} sales />}
        {tab === "settings" && admin && <><Settings {...props} />{cloud && <CloudStorage {...props} remote={remote} onImport={importRemote} />}</>}
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
        </fieldset>
        <footer>
          {cloud ? "Nomad Mobile · Общая база · Записи сохраняются после подтверждения сервера" : "Nomad Mobile · Данные в этом браузере · Регулярно сохраняйте полную копию JSON в настройках."}
        </footer>
      </main>
    </div>
  );
}
export function App() {
  return API_URL ? <CloudAccess apiUrl={API_URL}>{(remote, seed, onExit) => <Workspace remote={remote} cloudInitial={seed} onExit={onExit} />}</CloudAccess> : <Workspace />;
}
createRoot(document.getElementById("root")).render(<App />);
