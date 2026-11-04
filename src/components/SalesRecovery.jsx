import React, { useState } from "react";
import { Download } from "./Fields.jsx";
import { previewLocalSalesRecovery, applyLocalSalesRecovery, SALES_JOURNAL } from "../domain/recovery.js";

export default function SalesRecovery({state,commit,notify}) {
  const [preview,setPreview]=useState(null),[legacy,setLegacy]=useState(false),[busy,setBusy]=useState(false);
  return <section className="panel sales-recovery">
    <h2>Проверка сохранности продаж</h2>
    <p>Подтверждённые продажи дополнительно копируются в отдельный локальный журнал. Если история стала пустой, проверьте журнал и сохранённые копии этого браузера. Данные другого адреса, ноутбука или iPhone автоматически недоступны.</p>
    <button disabled={busy} onClick={()=>{
      try {setPreview(previewLocalSalesRecovery(localStorage,state));setLegacy(false);}
      catch(error){notify(error.message);}
    }}>Проверить локальные копии продаж</button>
    {preview&&<div className="import-preview">
      <p>Найдено дополнительных подтверждённых продаж: <b>{preview.newSales}</b>. Событий для восстановления: {preview.events.length}. Старых карточек без подтверждённой суммы/даты: {preview.legacy.length}.</p>
      <p>Записи с тем же ID сохранятся в текущем виде. Изменение выполняется только после подтверждения.</p>
      <details><summary>Проверенные копии ({preview.sources.length})</summary>{preview.sources.map((row)=><p key={row.name}>{row.name}: {row.sales} продаж</p>)}</details>
      {preview.errors.map((row)=><p className="warning" key={row.source}>{row.source}: {row.message}. Исходные данные сохранены.</p>)}
      {!!preview.conflicts.length&&<p className="warning">Конфликтов: {preview.conflicts.length}. Текущие финансовые записи не заменяются.</p>}
      {!!preview.legacy.length&&<label className="check"><input type="checkbox" checked={legacy} onChange={(e)=>setLegacy(e.target.checked)}/>Вернуть старые карточки «Продан» для ручного уточнения суммы и даты</label>}
      <button className="primary" disabled={busy||(!preview.events.length&&!(legacy&&preview.legacy.length))} onClick={async()=>{
        setBusy(true);
        try {await commit((current)=>applyLocalSalesRecovery(current,preview,legacy));setPreview(null);notify("История восстановлена из доступных копий. Неподтверждённые суммы и даты не добавлялись.");}
        catch(error){notify(error.message);}
        finally{setBusy(false);}
      }}>Подтвердить восстановление истории</button>
    </div>}
    {localStorage.getItem(SALES_JOURNAL)&&<Download name="nomad-sales-journal.json" data={localStorage.getItem(SALES_JOURNAL)}>Скачать резервный журнал продаж</Download>}
  </section>;
}
