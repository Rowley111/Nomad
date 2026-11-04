import { deviceProfile } from "./catalog.js";
export const VERSION = "1.2.0";
export const policyDefaults = {
  bargain: 0,
  quick: 5,
  minProfit: 15000,
  risk: 3000,
  negotiation: 2000,
  markup: 25,
  bankFee: 0,
  maxAge: 30,
  screenWear: 3000,
  bodyWear: 2000,
  box: 2000,
  battery: 5000,
};
export const money = (n) =>
  n == null ? "Нет данных" : new Intl.NumberFormat("ru-RU").format(n) + " ₸";
export function amount(value, name = "Сумма") {
  if (value === "" || value == null || typeof value === "boolean")
    throw new Error(name + ": требуется число");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(name + ": требуется конечное неотрицательное число");
  return n;
}
export function configKey(x) {
  return [x.model, x.storage, x.ram ?? "", x.sim ?? "physical"].join("|");
}
export function priceKey(x) {
  return [
    configKey(x),
    x.market,
    x.currency,
    x.channel,
    x.base.screen,
    x.base.body,
    x.base.box,
    x.base.battery ?? "unknown",
    ...(["owner-guide", "owner-buy"].includes(x.source) ? [x.source] : []),
  ].join("|");
}
export function evaluate(
  input,
  price,
  policy = policyDefaults,
  now = new Date().toISOString(),
  model,
) {
  const profile = deviceProfile(model ?? input.model);
  if (!profile.simModes.includes(input.sim ?? "physical"))
    throw new Error("Выбранный вариант SIM не соответствует устройству");
  const p = { ...policyDefaults, ...policy };
  Object.entries(p).forEach(([k, v]) => amount(v, k));
  if (p.bargain > 100 || p.quick > 100 || p.bankFee > 100)
    throw new Error("Проценты скидки/комиссии должны быть 0–100");
  if (
    !["ideal", "good", "worn"].includes(input.screen) ||
    !["ideal", "good", "worn"].includes(input.body)
  )
    throw new Error("Некорректное состояние");
  const repair = amount(input.repair ?? 0),
    expenses = amount(input.expenses ?? 0);
  const battery =
    input.battery === "" || input.battery == null
      ? null
      : amount(input.battery, "АКБ");
  if (battery > 100) throw new Error("АКБ должна быть 0–100%");
  const restrictions = [];
  if (input.locks !== "checked")
    restrictions.push(
      "Блокировки и аккаунты не проверены или обнаружена проблема",
    );
  const requiredChecks = [
    "sensor",
    "cameras",
    "network",
    "charging",
    ...(profile.faceid ? ["faceid"] : []),
  ];
  if (requiredChecks.some((k) => input.checks?.[k] !== "ok"))
    restrictions.push("Функции устройства требуют диагностики");
  if (
    (input.defects ?? []).some((x) =>
      ["glass", "matrix", "liquid", "swelling"].includes(x),
    )
  )
    restrictions.push("Серьёзный дефект: требуется ручная диагностика");
  if (!["none", "repaired"].includes(input.repairHistory))
    restrictions.push("История ремонта не проверена");
  if (!price || configKey(price) !== configKey(input))
    return {
      version: VERSION,
      input: structuredClone(input),
      restrictions: [...restrictions, "Нет прайса для точной конфигурации"],
      status: "no-data",
    };
  const base = amount(price.price, "Цена прайса");
  const guide = ["owner-guide", "owner-buy"].includes(price.source);
  const age = (Date.parse(now) - Date.parse(price.checkedAt)) / 86400000;
  if (!Number.isFinite(age) || age < -1)
    throw new Error("Некорректная дата прайса");
  if (age > p.maxAge) restrictions.push("Прайс устарел: подтвердите ориентир");
  const adjustments = [];
  const add = (reason, value) => {
    if (value) adjustments.push({ reason, value });
  };
  // No storage/RAM adjustment: price belongs to this exact configuration.
  const rank = { ideal: 0, good: 1, worn: 2 };
  add(
    "Экран относительно базового состояния",
    -(rank[input.screen] - rank[price.base.screen]) * p.screenWear,
  );
  add(
    "Корпус относительно базового состояния",
    -(rank[input.body] - rank[price.base.body]) * p.bodyWear,
  );
  add(
    "Коробка относительно базового комплекта",
    price.base.box == null
      ? 0
      : (Number(input.box) - Number(price.base.box)) * p.box,
  );
  if (
    battery != null &&
    price.base.battery != null &&
    battery < 80 &&
    price.base.battery >= 80
  )
    add("АКБ ниже 80%, базовая АКБ не ниже 80%", -p.battery);
  const showcase = Math.max(
    0,
    base + adjustments.reduce((a, x) => a + x.value, 0),
  );
  const totalAdjustment = adjustments.reduce((a, x) => a + x.value, 0);
  const sale = guide
    ? Math.max(0, amount(price.saleMin) + totalAdjustment)
    : Math.round(showcase * (1 - p.bargain / 100));
  const ownBuy = price.source === "owner-buy";
  const quick = ownBuy ? Math.floor(sale * (1 - p.quick / 100)) : guide
    ? Math.max(0, amount(price.quickMin) + totalAdjustment)
    : Math.round(sale * (1 - p.quick / 100));
  const costs = expenses + (input.scenario === "repair" ? repair : 0);
  const ceiling = Math.floor(quick - costs - p.risk - p.minProfit);
  const manual = restrictions.length > 0;
  const reduction = price.source === "owner-guide" ? guideReduction(input.model, p) : 0;
  const preliminaryMin = guide
    ? Math.max(0, amount(price.buyMin) - reduction + totalAdjustment - costs)
    : null;
  const preliminaryMax = guide
    ? Math.max(0, amount(price.buyMax) - reduction + totalAdjustment - costs)
    : null;
  const maxBuy =
    manual || ceiling < 0
      ? null
      : guide
        ? Math.min(ceiling, preliminaryMax)
        : ceiling;
  const hardRisk =
    (input.defects ?? []).length > 0 ||
    input.locks === "problem" ||
    Object.values(input.checks ?? {}).some((v) => v === "broken");
  const buy =
    input.ask === "" || input.ask == null
      ? null
      : amount(input.ask, "Цена продавца");
  return {
    version: VERSION,
    at: now,
    input: structuredClone(input),
    price: structuredClone(price),
    policy: structuredClone(p),
    status: manual ? "diagnosis" : ceiling < 0 ? "unprofitable" : "ready",
    base,
    adjustments,
    restrictions,
    showcase,
    sale,
    quick,
    maxBuy,
    recommendedBuy:
      maxBuy == null
        ? null
        : guide
          ? Math.min(preliminaryMin, maxBuy)
          : Math.max(0, maxBuy - p.negotiation),
    guide,
    reduction,
    preliminaryMin,
    preliminaryMax,
    customerOffer: hardRisk
      ? null
      : guide
        ? preliminaryMin
        : maxBuy == null
          ? null
          : Math.max(0, maxBuy - p.negotiation),
    guideProfit: guide ? sale - preliminaryMin - costs : null,
    basisBuyMin: guide ? price.buyMin : null,
    basisBuyMax: guide ? price.buyMax : null,
    saleMax: guide ? Math.max(0, price.saleMax + totalAdjustment) : sale,
    quickMax: ownBuy ? Math.floor(Math.max(0, price.saleMax + totalAdjustment) * (1 - p.quick / 100)) : guide ? Math.max(0, price.quickMax + totalAdjustment) : quick,
    installment: Math.round(showcase * (1 + p.markup / 100)),
    expectedProfit: buy == null ? null : sale - buy - costs,
    installmentBankCost: Math.round(
      (showcase * (1 + p.markup / 100) * p.bankFee) / 100,
    ),
    quality: price.source === "owner-buy" ? "Скупочный прайс владельца; не рыночная статистика" : guide
      ? "Справочный прайс из переписки; не свежий рынок, часть цен расчётная"
      : "Ручной ориентир владельца; не рыночная статистика",
    pawn: null,
  };
}

export function businessDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Нет данных";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split("-").reverse().join(".");
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export const guidePolicyDefaults = {
  guideIphoneDiscount: 30000,
  guideAndroidDiscount: 0,
};
export function guideReduction(model, policy) {
  const key = model.startsWith("iPhone")
    ? "guideIphoneDiscount"
    : "guideAndroidDiscount";
  return amount(policy[key] ?? guidePolicyDefaults[key]);
}
