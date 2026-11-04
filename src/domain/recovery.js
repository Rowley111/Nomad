import { KEY, LEGACY, validateState, migrateLegacy, uid, validateItem } from "./storage.js";
import { saleItemSnapshot, getSalesHistory, getSaleRecordKey } from "./sales.js";

export const SALES_JOURNAL = "nomad-sales-journal-v1";
const clone = (value) => structuredClone(value);
const numeric = (value) => value !== "" && value != null && typeof value !== "boolean" && Number.isFinite(Number(value)) && Number(value) >= 0;
const keyOf = (event) => event.type + ":" + String(event.itemId) + ":" + String(event.id);
const finance = (event) => JSON.stringify([event.type,event.itemId,event.at,event.revenue,event.expenses,event.method,event.sale?.id,event.sale?.revenue,event.sale?.at,event.refund]);

function facts(state) {
  const items = new Map(state.inventory.map((row) => [String(row.id), row]));
  for (const event of state.events ?? []) if (event.type === "delete" && event.item?.id != null && !items.has(String(event.item.id))) items.set(String(event.item.id), event.item);
  const events = [], seen = new Set();
  const add = (raw, itemId, snapshot) => {
    if (itemId == null || !raw || !["sale","return"].includes(raw.type)) return;
    const sale = raw.type === "return" ? raw.sale : raw.sale ?? raw;
    if (!sale || !numeric(sale.revenue)) return;
    const id = raw.id ?? sale.id ?? "legacy:" + encodeURIComponent([itemId,sale.at,sale.revenue,sale.expenses,sale.method].join("|"));
    const item = items.get(String(itemId));
    const itemSnapshot = snapshot ?? sale.itemSnapshot ?? (item ? { ...saleItemSnapshot(item), recoveredFrom: "existing-card" } : undefined);
    const event = raw.type === "sale" ? {
      ...clone(sale), id, type:"sale", itemId,
      ...(itemSnapshot ? {itemSnapshot:clone(itemSnapshot)} : {}),
    } : { ...clone(raw), id, itemId, ...(itemSnapshot ? {itemSnapshot:clone(itemSnapshot)} : {}) };
    const key = keyOf(event);
    if (!seen.has(key)) { events.push(event); seen.add(key); }
  };
  for (const event of state.events ?? []) if (["sale","return"].includes(event?.type)) add(event,event.itemId,event.itemSnapshot);
  for (const item of state.inventory) if (item.sale) add({...item.sale,type:"sale"},item.id,item.sale.itemSnapshot);
  return events;
}

function readJournal(raw) {
  if (raw == null) return [];
  const value = JSON.parse(raw);
  if (value?.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.some((row) =>
    !row || !["sale","return"].includes(row.type) || row.id == null || row.itemId == null ||
    !numeric(row.type === "sale" ? row.revenue : row.sale?.revenue)))
    throw new Error("Некорректный резервный журнал продаж");
  return value.events;
}

/** Called after the authoritative workspace write. Failure must not undo its acknowledgement. */
export function mirrorSalesJournal(storage, state) {
  try {
    const previous = readJournal(storage.getItem(SALES_JOURNAL));
    const byKey = new Map(previous.map((row) => [keyOf(row),row]));
    let changed = false;
    for (const event of facts(state)) {
      const old = byKey.get(keyOf(event));
      if (old && finance(old) !== finance(event)) throw new Error("В резервном журнале есть конфликт финансовых записей");
      if (!old) { byKey.set(keyOf(event),event); changed=true; }
    }
    if (changed) storage.setItem(SALES_JOURNAL,JSON.stringify({schemaVersion:1,events:[...byKey.values()]}));
    return "";
  } catch {
    return "Рабочие данные сохранены, но резервный журнал продаж недоступен. Скачайте полную JSON-копию в настройках; исходный журнал не заменён.";
  }
}

const baseline = (state) => JSON.stringify([state.inventory.map((row) => [row.id,row.buy,row.status,row.sale]),state.events]);

export function previewLocalSalesRecovery(storage, state) {
  const sources = [], errors = [], snapshots = [];
  const keys = [KEY,KEY+"-before-write",KEY+"-before-repairs-v1",KEY+"-before-catalog-v1",KEY+"-before-catalog-v2",KEY+"-before-cash-v1",LEGACY,LEGACY+"-backup-before-v2"];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      const value = JSON.parse(raw);
      const snapshot = Array.isArray(value) ? migrateLegacy(value) : validateState(value);
      snapshots.push({source:key,state:snapshot});
      sources.push({name:key,sales:getSalesHistory(snapshot).sales.length});
    } catch (error) { errors.push({source:key,message:error.message}); }
  }
  let journal=[];
  try { journal=readJournal(storage.getItem(SALES_JOURNAL)); if(journal.length)sources.push({name:SALES_JOURNAL,sales:journal.filter((e)=>e.type==="sale").length}); }
  catch(error) { errors.push({source:SALES_JOURNAL,message:error.message}); }
  const existingEvents = new Map(state.events.map((row)=>[String(row.id),row]));
  const known = new Set(getSalesHistory(state).sales.map((row)=>row.saleKey));
  const events=[], conflicts=[], newSales=new Set();
  for (const {source,rows} of [...snapshots.map((s)=>({source:s.source,rows:facts(s.state)})),{source:SALES_JOURNAL,rows:journal}]) {
    for (const event of rows) {
      const old=existingEvents.get(String(event.id));
      if (old) {
        if (old.type!==event.type || finance(old)!==finance(event)) conflicts.push({source,id:event.id,reason:"Сохранена текущая запись с этим ID"});
        continue;
      }
      const sale = event.type==="return"?event.sale:event;
      const saleKey=getSaleRecordKey(sale,event.itemId);
      if(event.type==="sale"&&known.has(saleKey))continue;
      events.push({...clone(event),recoverySource:source}); existingEvents.set(String(event.id),event);
      if(!known.has(saleKey)){newSales.add(saleKey);known.add(saleKey);}
    }
  }
  const inventoryIds=new Set(state.inventory.map((row)=>String(row.id))), legacy=[];
  for (const snapshot of snapshots) for (const row of snapshot.state.inventory) {
    if (row.status!=="Продан" || row.sale || inventoryIds.has(String(row.id))) continue;
    try { validateItem(row); legacy.push({...clone(row),legacy:true,legacySold:true,sale:null}); inventoryIds.add(String(row.id)); }
    catch { /* Original snapshot remains available for export. */ }
  }
  return { id:uid(), baseline:baseline(state), events, legacy, sources, errors, conflicts, newSales:newSales.size };
}

export function applyLocalSalesRecovery(state, preview, includeLegacy=false) {
  if (state.events.some((event)=>event.type==="sales-recovered"&&event.recoveryId===preview.id))return state;
  if(baseline(state)!==preview.baseline)throw new Error("Данные изменились. Повторите проверку локальных копий");
  const extra=includeLegacy?preview.legacy:[];
  if(!preview.events.length&&!extra.length)return state;
  const events=[...state.events,...clone(preview.events)];
  const combined={...state,inventory:[...state.inventory,...clone(extra)],events};
  const history=getSalesHistory(combined);
  combined.inventory=combined.inventory.map((item)=>{
    const active=history.sales.find((row)=>String(row.itemId)===String(item.id)&&!row.returned);
    if(active&&!item.sale){
      const event=preview.events.find((row)=>row.type==="sale"&&String(row.itemId)===String(item.id)&&String(row.id)===String(active.id));
      if(event&&numeric(event.expenses)&&["Наличные","Перевод","Карта","Рассрочка"].includes(event.method)) {
        const sale=clone(event); delete sale.type; delete sale.itemId;
        return {...item,status:"Продан",sale};
      }
    }
    if(item.sale&&history.sales.some((row)=>row.saleKey===getSaleRecordKey(item.sale,item.id)&&row.returned))return {...item,status:"В наличии",sale:null};
    return item;
  });
  combined.events.push({id:uid(),type:"sales-recovered",at:new Date().toISOString(),recoveryId:preview.id,addedEvents:preview.events.length,restoredLegacyCards:extra.length});
  return validateState(combined);
}
