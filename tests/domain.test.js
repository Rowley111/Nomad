import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  policyDefaults,
  amount,
  priceKey,
} from "../src/domain/valuation.js";
import {
  initialInput,
  changeModel,
  catalogDefaults,
} from "../src/domain/catalog.js";
import {
  emptyState,
  migrateLegacy,
  readState,
  KEY,
  LEGACY,
  purchase,
  recordSale,
  analytics,
  returnSale,
} from "../src/domain/storage.js";
import {
  validatePrice,
  previewPrices,
  mergePrices,
  pricesCSV,
  previewBackup,
  safeCell,
} from "../src/domain/imports.js";
import { refreshProvider, olxProvider } from "../src/domain/providers.js";
const input = {
  ...initialInput,
  locks: "checked",
  repairHistory: "none",
  ask: 50000,
  checks: { sensor: "ok", cameras: "ok", network: "ok", charging: "ok" },
};
const price = {
  model: input.model,
  storage: 128,
  ram: 8,
  sim: "physical",
  market: "Астана",
  currency: "KZT",
  channel: "store-cash",
  price: 89000,
  source: "owner",
  checkedAt: "2026-11-03",
  author: "Владелец",
  base: { screen: "good", body: "good", box: true, battery: null },
  note: "Хорошее состояние, коробка, следы от чехла уже учтены",
};
const calc = (i = input, p = price, policy = policyDefaults) =>
  evaluate(i, p, policy, "2026-11-03T12:00:00Z");
test("A35: прайс → 111250, разница 39000; нет двойной поправки", () => {
  const r = calc();
  assert.equal(r.showcase, 89000);
  assert.equal(r.installment, 111250);
  assert.equal(r.expectedProfit, 39000);
  assert.deepEqual(r.adjustments, []);
  assert.equal(r.status, "ready");
});
test("точная память без данных не получает выдуманную цену", () =>
  assert.equal(calc({ ...input, storage: 256 }).status, "no-data"));
test("неизвестная АКБ не равна нулю", () =>
  assert.equal(
    calc(
      { ...input, battery: "" },
      { ...price, base: { ...price.base, battery: 90 } },
    ).showcase,
    89000,
  ));
test("АКБ 0 является известной; 101 отвергается", () => {
  assert.equal(
    calc(
      { ...input, battery: 0 },
      { ...price, base: { ...price.base, battery: 90 } },
    ).showcase,
    84000,
  );
  assert.throws(() => calc({ ...input, battery: 101 }));
});
test("явный закуп 0 сохраняется; недопустимые суммы отвергаются", () => {
  assert.equal(calc({ ...input, ask: 0 }).expectedProfit, 89000);
  for (const v of [-1, NaN, Infinity, "", null, true])
    assert.throws(() => amount(v));
  assert.equal(amount(0), 0);
});
test("в сценарии ремонта нет одновременно штрафа за трещину и полного ремонта", () => {
  const r = calc({
    ...input,
    scenario: "repair",
    repair: 10000,
    defects: ["glass"],
  });
  assert.equal(r.showcase, 89000);
  assert.equal(r.maxBuy, null);
  assert.equal(r.adjustments.length, 0);
});
test("критические неизвестные скрывают максимум", () => {
  assert.equal(calc({ ...input, locks: "unknown" }).maxBuy, null);
  assert.equal(
    calc({ ...input, checks: { charging: "unknown" } }).maxBuy,
    null,
  );
});
test("отрицательная допустимая закупка → нецелесообразен", () =>
  assert.equal(
    calc(input, price, { ...policyDefaults, minProfit: 100000 }).status,
    "unprofitable",
  ));
test("устаревший прайс не даёт безопасного максимума", () =>
  assert.equal(
    calc(input, { ...price, checkedAt: "2025-01-01" }).maxBuy,
    null,
  ));
test("смена модели сбрасывает несовместимую конфигурацию", () => {
  const x = changeModel(
    { ...input, storage: 1024 },
    "iPhone 11",
    catalogDefaults,
  );
  assert.equal(x.storage, 64);
  assert.equal(x.ram, null);
});
test("старые записи мигрируют без изменения исходного массива и выдуманной продажи", () => {
  const rows = [
    {
      id: 1,
      model: "Старый телефон",
      buy: 0,
      sell: 89000,
      status: "Продан",
      battery: "",
    },
  ];
  const before = JSON.stringify(rows);
  const s = migrateLegacy(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(s.inventory.length, 1);
  assert.equal(s.inventory[0].sale, null);
  assert.equal(analytics(s).revenue, 0);
});
test("backup до миграции; повторный вход идемпотентен; повреждение не подменяется демо", () => {
  const data = new Map([
    [LEGACY, JSON.stringify([{ id: 1, model: "A", buy: 0, sell: 10 }])],
  ]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  readState(storage);
  assert.equal(data.get(LEGACY), data.get(LEGACY + "-backup-before-v2"));
  assert.equal(readState(storage).inventory.length, 1);
  data.set(KEY, "bad");
  assert.throws(() => readState(storage));
});
test("оценка сама не закупка, подтверждение переносит снимок; прайс историю не меняет", () => {
  const s = emptyState(),
    r = calc();
  assert.equal(s.inventory.length, 0);
  const next = purchase(s, r, 0);
  assert.equal(next.inventory[0].buy, 0);
  r.price.price = 1;
  assert.equal(next.inventory[0].snapshot.price.price, 89000);
});
test("превышение максимума требует причины", () => {
  assert.throws(() => purchase(emptyState(), calc(), 100000));
  assert.equal(
    purchase(emptyState(), calc(), 100000, "Решение владельца").inventory
      .length,
    1,
  );
});
test("повторная продажа не удваивает прибыль; возврат сохраняет событие", () => {
  let s = purchase(emptyState(), calc(), 50000);
  const id = s.inventory[0].id;
  s = recordSale(s, id, 89000, 1000, "Наличные");
  assert.equal(analytics(s).profit, 38000);
  assert.throws(() => recordSale(s, id, 89000, 0, "Наличные"));
  s = returnSale(s, id, "Возврат клиента");
  assert.equal(analytics(s).revenue, 0);
  assert.equal(s.events.at(-1).sale.revenue, 89000);
});
test("JSON резервная копия восстанавливается", () => {
  const s = purchase(emptyState(), calc(), 50000);
  assert.deepEqual(previewBackup(JSON.stringify(s)), s);
});
test("импорт валидирует поля и не дублирует запись", () => {
  const rows = previewPrices(JSON.stringify([price]), "json", catalogDefaults);
  assert.equal(rows.errors.length, 0);
  let s = mergePrices(emptyState(), rows.valid);
  s = mergePrices(s, rows.valid);
  assert.equal(s.prices.length, 1);
  assert.equal(s.priceHistory.length, 1);
  assert.equal(priceKey(s.prices[0]), priceKey(price));
  assert.throws(() =>
    validatePrice({ ...price, price: Infinity }, catalogDefaults),
  );
});
test("CSV roundtrip, кавычки и многострочный текст", () => {
  const p = { ...price, note: 'Следы; "чехла"\nКоробка есть' };
  const preview = previewPrices(pricesCSV([p]), "csv", catalogDefaults);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.valid[0].note, p.note);
});
test("CSV защищён от формул", () => {
  assert.equal(safeCell("=1+1"), '"\'=1+1"');
  assert.equal(safeCell(" @SUM(A1)"), '"\' @SUM(A1)"');
});
test("неудача источника не изменяет дату успешного обновления", async () => {
  const r = await refreshProvider(
    olxProvider,
    { lastSuccessAt: "2026-01-01", data: [1] },
    {},
  );
  assert.equal(r.lastSuccessAt, "2026-01-01");
  assert.deepEqual(r.data, [1]);
  assert.ok(r.error);
});

test("повтор подтверждения закупки с тем же токеном отвергается", () => {
  const r = { ...calc(), purchaseToken: "request-1" };
  const s = purchase(emptyState(), r, 50000);
  assert.throws(() => purchase(s, r, 50000));
  assert.equal(s.inventory.length, 1);
});
test("восстановление отвергает повреждённый каталог и прайс", () => {
  assert.throws(() =>
    previewBackup(JSON.stringify({ ...emptyState(), catalog: [{}] })),
  );
  assert.throws(() =>
    previewBackup(
      JSON.stringify({ ...emptyState(), prices: [{ id: "a", price: -1 }] }),
    ),
  );
});

test("справочник iPhone: снижение 30к один раз, витрина и память не меняются", () => {
  const gp = {
    ...price,
    source: "owner-guide",
    sourceName: "Тестовый справочник",
    buyMin: 90000,
    buyMax: 105000,
    price: 155000,
    saleMin: 130000,
    saleMax: 145000,
    quickMin: 120000,
    quickMax: 125000,
    model: "iPhone 13",
    ram: null,
  };
  const gi = {
    ...input,
    model: "iPhone 13",
    ram: null,
    checks: { ...input.checks, faceid: "ok" },
  };
  const r = calc(gi, gp);
  assert.equal(r.preliminaryMin, 60000);
  assert.equal(r.preliminaryMax, 75000);
  assert.equal(r.showcase, 155000);
  assert.equal(r.maxBuy, 75000);
  assert.equal(r.recommendedBuy, 60000);
  assert.equal(r.sale, 130000);
  assert.equal(r.guideProfit, 70000);
  assert.equal(
    calc(gi, gp, { ...policyDefaults, guideIphoneDiscount: 25000 })
      .preliminaryMin,
    65000,
  );
});
test("Android без снижения; неизвестная коробка не штрафует; нулевая скупка не отрицательная", () => {
  const gp = {
    ...price,
    source: "owner-guide",
    sourceName: "Тест",
    buyMin: 10000,
    buyMax: 15000,
    saleMin: 24000,
    saleMax: 27000,
    quickMin: 20000,
    quickMax: 22000,
    base: { ...price.base, box: null },
  };
  const r = calc({ ...input, box: false }, gp);
  assert.equal(r.reduction, 0);
  assert.equal(r.preliminaryMin, 10000);
  assert.equal(r.showcase, 89000);
  assert.equal(
    calc(input, gp, { ...policyDefaults, guideAndroidDiscount: 30000 })
      .preliminaryMax,
    0,
  );
});
test("справочник виден до диагностики, безопасный максимум скрыт; серьёзные дефекты блокируют копирование", () => {
  const gp = {
    ...price,
    source: "owner-guide",
    sourceName: "Тест",
    buyMin: 50000,
    buyMax: 60000,
    saleMin: 80000,
    saleMax: 85000,
    quickMin: 75000,
    quickMax: 80000,
  };
  const r = calc({ ...input, locks: "unknown" }, gp);
  assert.equal(r.maxBuy, null);
  assert.equal(r.preliminaryMin, 50000);
  assert.equal(r.customerOffer, 50000);
  assert.equal(calc({ ...input, defects: ["matrix"] }, gp).customerOffer, null);
});
test("справочник и ручная витрина сосуществуют, повторный импорт не дублирует", () => {
  const gp = {
    ...price,
    source: "owner-guide",
    sourceName: "Тест",
    buyMin: 50000,
    buyMax: 60000,
    saleMin: 80000,
    saleMax: 85000,
    quickMin: 75000,
    quickMax: 80000,
  };
  let s = mergePrices(emptyState(), [price, gp]);
  s = mergePrices(s, [gp]);
  assert.equal(s.prices.length, 2);
  assert.equal(s.priceHistory.length, 2);
  const restored = previewBackup(JSON.stringify(s));
  assert.equal(restored.prices[1].buyMin, 50000);
  assert.deepEqual(
    previewPrices(pricesCSV([gp]), "csv", catalogDefaults).errors,
    [],
  );
});

test("DOCX-таблицы: тысячи/ТБ, eSIM Air, неоднозначные конфигурации, без исторических строк", async () => {
  const { parseGuideTables, previewGuide } = await import(
    "../src/domain/guide.js"
  );
  const header = [
    "Модель",
    "Память,ГБ / ТБ",
    "Скупка",
    "Витрина",
    "После торга",
    "Быстро",
    "Рассрочка+25%",
  ];
  const g = parseGuideTables(
    [
      [
        header,
        ["13", "128", "90–105", "155", "130–145", "120–125", "193,75"],
        ["Air", "1 ТБ", "395–420", "520", "470–500", "445–460", "650"],
      ],
      [
        ["Устройство", "Ваш закуп", "Витрина", "+25%", "Разница"],
        ["Тест", "50 000", "89 000", "111 250", "39 000"],
      ],
    ],
    "test.docx",
    "2026-11-04",
  );
  assert.equal(g.entries.length, 2);
  assert.equal(g.entries[0].buyMin, 90000);
  assert.equal(g.entries[1].storage, 1024);
  assert.equal(g.entries[1].sim, "esim");
  assert.equal(previewGuide(g, catalogDefaults).valid.length, 2);
  assert.throws(() => parseGuideTables([], "invalid.docx", "2026-11-04"));
  assert.throws(() => previewGuide({ entries: [] }, catalogDefaults));
});
