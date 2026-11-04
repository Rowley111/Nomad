import test from "node:test";
import assert from "node:assert/strict";
import {emptyState,recordSale,returnSale,KEY,LEGACY,analytics} from "../src/domain/storage.js";
import {getSalesHistory} from "../src/domain/sales.js";
import {mirrorSalesJournal,SALES_JOURNAL,previewLocalSalesRecovery,applyLocalSalesRecovery} from "../src/domain/recovery.js";
const initial=()=>({...emptyState(),inventory:[{id:"a35",model:"Samsung Galaxy A35 5G",storage:128,ram:8,buy:50000,sell:89000,status:"В наличии",sale:null}]});
const storage=(entries=[])=>{const map=new Map(entries);return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
test("sales mirror survives an older restored workspace and recovers exact actual facts once",()=>{
  const before=initial(),sold=recordSale(before,"a35",87000,1000,"Наличные","2026-11-03"),store=storage();
  assert.equal(mirrorSalesJournal(store,sold),"");
  const saved=store.getItem(SALES_JOURNAL);
  mirrorSalesJournal(store,sold);assert.equal(store.getItem(SALES_JOURNAL),saved);
  const preview=previewLocalSalesRecovery(store,before);
  assert.equal(preview.newSales,1);
  assert.equal(before.inventory[0].sale,null);
  const recovered=applyLocalSalesRecovery(before,preview);
  assert.equal(getSalesHistory(recovered).sales[0].day,"2026-11-03");
  assert.equal(analytics(recovered).revenue,87000);
  assert.equal(analytics(recovered).profit,36000);
  assert.equal(recovered.inventory[0].status,"Продан");
  assert.equal(applyLocalSalesRecovery(recovered,preview),recovered);
});
test("recovery retains return history without resurrecting an active sale",()=>{
  const before=initial(),sold=recordSale(before,"a35",89000,1000,"Наличные","2026-11-02");
  const returned=returnSale(sold,"a35","Клиент вернул","2026-11-03"),store=storage();
  mirrorSalesJournal(store,returned);
  const result=applyLocalSalesRecovery(before,previewLocalSalesRecovery(store,before));
  assert.equal(getSalesHistory(result).sales.length,1);
  assert.equal(getSalesHistory(result).sales[0].returned,true);
  assert.equal(analytics(result).revenue,0);
  assert.equal(analytics(result).profit,-1000);
  assert.equal(result.inventory[0].sale,null);
});
test("old sold status has no fabricated amount/date; missing card can be restored only explicitly",()=>{
  const current=emptyState(),legacy=[{id:"old",model:"Samsung Galaxy A35 5G",buy:50000,sell:89000,status:"Продан"}];
  const store=storage([[LEGACY,JSON.stringify(legacy)]]),preview=previewLocalSalesRecovery(store,current);
  assert.equal(preview.newSales,0);assert.equal(preview.legacy.length,1);
  assert.equal(applyLocalSalesRecovery(current,preview),current);
  const result=applyLocalSalesRecovery(current,preview,true);
  assert.equal(getSalesHistory(result).sales.length,0);
  assert.equal(getSalesHistory(result).unconfirmed.length,1);
  assert.equal(result.inventory[0].sale,null);
});
test("corrupt journal is kept intact and backup scanning never replaces current finance",()=>{
  const sold=recordSale(initial(),"a35",89000,0,"Карта","2026-11-03"),store=storage([[SALES_JOURNAL,"broken"]]);
  assert.match(mirrorSalesJournal(store,sold),/недоступен/);
  assert.equal(store.getItem(SALES_JOURNAL),"broken");
  store.setItem(KEY+"-before-write",JSON.stringify(sold));
  const preview=previewLocalSalesRecovery(store,sold);
  assert.equal(preview.newSales,0);assert.ok(preview.errors.length);
  assert.equal(analytics(sold).revenue,89000);
});
test("quota failure in optional mirror leaves authoritative saved sale intact",()=>{
  const sold=recordSale(initial(),"a35",89000,0,"Наличные","2026-11-03");
  const store={getItem:()=>null,setItem:()=>{throw new Error("quota");}};
  assert.match(mirrorSalesJournal(store,sold),/Рабочие данные сохранены/);
  assert.equal(analytics(sold).sold,1);
});
test("sale present only in the cash migration backup is restored without duplicating other copies",()=>{
  const current=initial(),sold=recordSale(current,"a35",87000,1000,"Карта","2026-11-03");
  const store=storage([[KEY+"-before-cash-v1",JSON.stringify(sold)],[KEY+"-before-catalog-v2",JSON.stringify(sold)]]);
  const preview=previewLocalSalesRecovery(store,current);
  assert.ok(preview.sources.some((source)=>source.name===KEY+"-before-cash-v1"));
  assert.equal(preview.newSales,1);
  const restored=applyLocalSalesRecovery(current,preview);
  assert.equal(getSalesHistory(restored).sales.length,1);
  assert.equal(analytics(restored).revenue,87000);
});
