import React, { useState } from "react";
import { Field, Download } from "./Fields.jsx";
import { previewBackup } from "../domain/imports.js";
import { amount, guidePolicyDefaults } from "../domain/valuation.js";
const labels = {
  guideIphoneDiscount: "Снижение скупки iPhone из справочника, ₸",
  guideAndroidDiscount: "Снижение скупки Android из справочника, ₸",
  bargain: "Резерв торга, %",
  quick: "Скидка быстрой продажи, %",
  minProfit: "Минимальная прибыль, ₸",
  risk: "Резерв риска, ₸",
  negotiation: "Переговорный запас, ₸",
  markup: "Наценка рассрочки, %",
  bankFee: "Комиссия банка, % (0 = не задана)",
  maxAge: "Актуальность прайса, дней",
  screenWear: "Шаг износа экрана, ₸",
  bodyWear: "Шаг износа корпуса, ₸",
  box: "Коробка, ₸",
  battery: "АКБ ниже 80%, ₸",
};
export default function Settings({ state, commit, notify }) {
  const [policy, setPolicy] = useState({
      ...guidePolicyDefaults,
      ...state.policy,
    }),
    [catalog, setCatalog] = useState(JSON.stringify(state.catalog, null, 2)),
    [backup, setBackup] = useState(null),
    [restoreText, setRestoreText] = useState("");
  const run = (fn) => {
    try {
      fn();
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <>
      <section className="panel">
        <h2>Политика магазина</h2>
        <p>
          Настройки владельца, не объективные рыночные поправки. Комиссия банка
          задаётся отдельно по фактическим условиям.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              const p = Object.fromEntries(
                Object.entries(policy).map(([k, v]) => [k, amount(v, k)]),
              );
              if (p.bargain > 100 || p.quick > 100 || p.bankFee > 100)
                throw new Error("Проценты скидок и комиссии: 0–100");
              commit((s) => ({ ...s, policy: p }));
              notify("Политика сохранена");
            });
          }}
        >
          <div className="formgrid">
            {Object.entries(labels).map(([k, t]) => (
              <Field
                key={k}
                label={t}
                value={policy[k]}
                type="number"
                min="0"
                onChange={(v) => setPolicy((x) => ({ ...x, [k]: v }))}
              />
            ))}
          </div>
          <button type="submit">Сохранить политику</button>
        </form>
      </section>
      <section className="panel">
        <h2>Каталог моделей и конфигураций</h2>
        <p>
          Локальный владелец может редактировать справочник без изменения кода.
          Конфигурации Android без подтверждения оставлены пустыми: проверьте
          маркировку и официальный источник, разделите 4G и 5G. ram — только
          физическая ОЗУ. Изменения не сохранены до нажатия кнопки.
        </p>
        <textarea
          aria-label="Редактор каталога JSON"
          className="codeeditor"
          value={catalog}
          onChange={(e) => setCatalog(e.target.value)}
        />
        <button
          onClick={() =>
            run(() => {
              const data = JSON.parse(catalog);
              if (!Array.isArray(data) || !data.length)
                throw new Error("Нужен непустой массив моделей");
              const names = new Set();
              for (const m of data) {
                if (
                  !m.name?.trim() ||
                  !m.brand?.trim() ||
                  !m.source?.trim() ||
                  !Array.isArray(m.configs) ||
                  names.has(m.name)
                )
                  throw new Error(
                    "Нужны уникальное имя, бренд, источник и configs",
                  );
                names.add(m.name);
                const keys = new Set();
                for (const c of m.configs) {
                  if (
                    amount(c.storage) <= 0 ||
                    (c.ram != null && amount(c.ram) <= 0)
                  )
                    throw new Error("Память должна быть положительной");
                  const key = c.storage + "|" + (c.ram ?? "");
                  if (keys.has(key)) throw new Error("Дубликат конфигурации");
                  keys.add(key);
                }
              }
              for (const p of state.prices) {
                if (
                  !data.some(
                    (m) =>
                      m.name === p.model &&
                      m.configs.some(
                        (c) => c.storage === p.storage && c.ram === p.ram,
                      ),
                  )
                )
                  throw new Error(
                    "Нельзя удалить конфигурацию, используемую прайсом",
                  );
              }
              commit((s) => ({ ...s, catalog: data }));
              notify("Каталог сохранён");
            })
          }
        >
          Сохранить каталог
        </button>
      </section>
      <section className="panel">
        <h2>Полная резервная копия</h2>
        <p>
          Хранение только в этом браузере. Для переноса с localhost или другого
          устройства экспортируйте JSON и импортируйте его на нужном адресе.
          Автоматической синхронизации нет.
        </p>
        <Download
          name={
            "nomad-backup-" + new Date().toISOString().slice(0, 10) + ".json"
          }
          data={JSON.stringify(state, null, 2)}
        >
          Скачать полную копию JSON
        </Download>
        <input
          type="file"
          aria-label="Файл резервной копии"
          accept=".json"
          onChange={async (e) => {
            try {
              const f = e.target.files[0];
              if (!f) return;
              if (f.size > 10e6) throw new Error("Файл больше 10 МБ");
              setRestoreText(await f.text());
              setBackup(null);
            } catch (e) {
              notify(e.message);
            }
          }}
        />
        <textarea
          aria-label="JSON резервной копии"
          value={restoreText}
          onChange={(e) => {
            setRestoreText(e.target.value);
            setBackup(null);
          }}
        />
        <button
          onClick={() => run(() => setBackup(previewBackup(restoreText)))}
        >
          Предпросмотр восстановления
        </button>
        {backup && (
          <>
            <p>
              Будет заменено локальное рабочее пространство: склад{" "}
              {backup.inventory.length}, прайс {backup.prices.length}, оценки{" "}
              {backup.assessments.length}, события {backup.events.length}.
              Ремонты: {backup.repairOrders?.length ?? 0}, оплаты:{" "}
              {(backup.repairOrders ?? []).reduce(
                (a, x) => a + x.payments.length,
                0,
              )}
              , материалы в заказах:{" "}
              {(backup.repairOrders ?? []).reduce(
                (a, x) => a + x.materials.length,
                0,
              )}
              . Сейчас сохранено ремонтов: {state.repairOrders?.length ?? 0}.
              Восстановление полностью заменит эти записи данными из копии,
              включая ремонты. Текущая версия сохраняется в
              nomad-workspace-v2-before-write. Старый ключ v1 не меняется.
            </p>
            {!backup.repairSchemaVersion && !!state.repairOrders?.length && (
              <p className="warning">
                В этой старой копии нет раздела ремонтов. При подтверждении
                текущие ремонты будут заменены пустым разделом. Сначала скачайте
                полную копию текущих данных.
              </p>
            )}
            <button
              onClick={() =>
                run(() => {
                  commit(() => backup);
                  setBackup(null);
                  notify("Копия восстановлена");
                })
              }
            >
              Подтвердить замену из копии
            </button>
          </>
        )}
      </section>
    </>
  );
}
