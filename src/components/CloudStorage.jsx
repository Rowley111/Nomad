import React, { useState } from "react";
import { readState, validateState, KEY } from "../domain/storage.js";
import { ensureRepairState } from "../domain/repairs.js";
const collectionLabels = {
  inventory: "Склад", prices: "Прайс", priceHistory: "История прайса",
  assessments: "Оценки", events: "История склада и продаж", catalog: "Каталог моделей",
  repairOrders: "Ремонты", repairTypes: "Типы ремонта", materialCatalog: "Справочник материалов",
  repairEvents: "История ремонтов", repairLosses: "Убытки", setupImports: "История подключения прайса",
  policy: "Политика магазина",
};
export default function CloudStorage({ remote, onImport, notify, state }) {
  const [preview, setPreview] = useState(null),
    [fileText, setFileText] = useState(""),
    [busy, setBusy] = useState(false),
    [operationId, setOperationId] = useState("");
  async function prepare(local) {
    setBusy(true); setPreview(null);
    try {
      const imported = local ? readState(localStorage) : ensureRepairState(validateState(JSON.parse(fileText)));
      // The original browser data is never replaced by the server response.
      const browserCopy = localStorage.getItem(KEY);
      if (browserCopy !== null) localStorage.setItem(KEY + "-before-cloud-import", browserCopy);
      const result = await remote.request("/import/preview", { method: "POST", body: { state: imported } });
      setPreview(result); setOperationId(crypto.randomUUID());
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel cloud-migration">
      <h2>Общая база и перенос данных</h2>
      <p>Текущая версия базы: {remote.revision}. Склад: {state.inventory.length}, ремонты: {state.repairOrders?.length ?? 0}, убытки: {state.repairLosses?.length ?? 0}.</p>
      <p>Перенос добавляет отсутствующие записи. Совпадения пропускаются, отличающиеся записи с тем же ID требуют проверки и не подменяют серверные данные. До подтверждения база не меняется.</p>
      <p>Этот браузер может читать данные только своего адреса. Для переноса с localhost или другого устройства загрузите полную JSON-копию оттуда. Исходный localStorage не удаляется.</p>
      <fieldset disabled={busy} className="workspace-controls">
        <button onClick={() => prepare(true)}>Предпросмотр данных этого браузера</button>
        <label className="field">JSON-копия для переноса
          <input type="file" accept=".json,application/json" aria-label="JSON-копия для переноса" onChange={async (event) => {
            setPreview(null);
            try {
              const file = event.target.files[0];
              if (!file) return;
              if (file.size > 5e6) throw new Error("Копия больше 5 МБ");
              setFileText(await file.text());
            } catch (error) { notify(error.message); }
          }} />
        </label>
        <button disabled={!fileText} onClick={() => prepare(false)}>Предпросмотр файла для базы</button>
        {preview && <div className="import-preview">
          <h3>Предпросмотр переноса</h3>
          <p>Добавится записей: {preview.report?.totalAdded ?? 0}. Версия базы при проверке: {preview.revision}.</p>
          {Object.entries(preview.report?.added ?? {}).map(([name, count]) => <p key={name}>{collectionLabels[name] ?? name}: +{count}, совпадений {preview.report?.duplicates?.[name] ?? 0}</p>)}
          {!!preview.report?.conflicts?.length && <><p className="warning">Конфликтов: {preview.report.conflicts.length}. Эти записи сохранятся в текущем серверном виде.</p><ul>{preview.report.conflicts.map((conflict, index) => <li key={index}>{collectionLabels[conflict.collection] ?? conflict.collection} · {conflict.id}: {conflict.reason}</li>)}</ul></>}
          <button className="primary" onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const result = await onImport(preview.previewId, operationId);
              setPreview(null); setFileText("");
              notify(`Перенос завершён: добавлено ${result.report?.totalAdded ?? 0}. Исходные данные браузера сохранены.`);
            } catch (error) { notify(error.message); }
            finally { setBusy(false); }
          }}>Подтвердить перенос в общую базу</button>
        </div>}
      </fieldset>
      {busy && <p role="status">Проверяю и сохраняю данные…</p>}
    </section>
  );
}
