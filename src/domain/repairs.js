// Repair cash accounting is independent of inventory and price valuation.
// Quotes are plans; only dated payments and direct expenses affect reports.
const SCHEMA_KEYS = [
  "repairSchemaVersion",
  "repairOrders",
  "repairTypes",
  "materialCatalog",
  "repairEvents",
];
const STATUSES = ["accepted", "in_progress", "ready", "issued", "cancelled"];
const METHODS = ["cash", "transfer", "card", "installment"];
const EVENT_TYPES = [
  "repair-created",
  "repair-updated",
  "repair-status",
  "repair-material",
  "repair-cost",
  "repair-payment",
  "repair-refund",
  "repair-expense-voided",
  "repair-type-saved",
  "repair-material-template-saved",
  "repair-loss",
  "repair-loss-voided",
];
const uid = () => globalThis.crypto.randomUUID();
const clone = (value) => structuredClone(value);
const round = (value) => {
  const result = Math.round((value + Number.EPSILON) * 100) / 100;
  if (
    !Number.isFinite(result) ||
    !Number.isSafeInteger(Math.round(result * 100))
  )
    throw new Error("Сумма слишком велика");
  return result;
};
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function text(value, label, optional = false) {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > 10000
  )
    throw new Error("Некорректное поле: " + label);
  return value.trim();
}
function money(value, label = "Сумма") {
  if (
    !["number", "string"].includes(typeof value) ||
    (typeof value === "string" &&
      (!value.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim()))) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  )
    throw new Error(label + ": требуется неотрицательное конечное число");
  return round(Number(value));
}
function numeric(value, label) {
  if (typeof value !== "number")
    throw new Error("Некорректное число: " + label);
  return money(value, label);
}
function materialQuantity(value) {
  if (
    !["number", "string"].includes(typeof value) ||
    (typeof value === "string" &&
      (!value.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim()))) ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  )
    throw new Error("Количество материала должно быть больше нуля");
  return Number(value);
}
function date(value, label = "Дата") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(label + ": используйте ГГГГ-ММ-ДД");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(label + ": такой даты нет");
  return value;
}
function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("Некорректная дата события ремонта");
}
function identifier(value) {
  return text(value, "идентификатор");
}
function assertUnique(rows, label) {
  if (!Array.isArray(rows)) throw new Error("Нет массива: " + label);
  const ids = new Set();
  for (const row of rows) {
    if (!isRecord(row)) throw new Error("Некорректная запись: " + label);
    identifier(row.id);
    if (ids.has(row.id)) throw new Error("Повтор идентификатора: " + label);
    ids.add(row.id);
  }
  return ids;
}
function optionalText(value, label) {
  if (value !== undefined) text(value, label, true);
}
function validateVoid(line) {
  if (line.voided !== undefined && typeof line.voided !== "boolean")
    throw new Error("Некорректная отмена расхода");
  if (line.voided) {
    text(line.voidReason, "причина исправления");
    timestamp(line.voidedAt);
  }
}
function validateOrder(order, typeIds, materialIds) {
  text(order.device, "устройство");
  text(order.repairTypeName, "вид ремонта");
  if (!typeIds.has(order.repairTypeId))
    throw new Error("Неизвестный вид ремонта в заказе");
  text(order.description, "описание", true);
  date(order.receivedOn);
  timestamp(order.createdAt);
  if (!STATUSES.includes(order.status))
    throw new Error("Неизвестный статус ремонта");
  if (order.plannedRevenue !== null)
    numeric(order.plannedRevenue, "Плановая сумма");
  if (order.issuedOn !== undefined) date(order.issuedOn);
  if (order.status === "issued" && !order.issuedOn)
    throw new Error("Нет даты выдачи ремонта");
  if (order.updatedAt !== undefined) timestamp(order.updatedAt);
  assertUnique(order.materials, "материалы заказа");
  assertUnique(order.costs, "расходы заказа");
  assertUnique(order.payments, "платежи заказа");
  for (const line of order.materials) {
    text(line.name, "материал");
    text(line.unit, "единица материала");
    if (
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0
    )
      throw new Error("Количество материала должно быть больше нуля");
    numeric(line.unitCost, "Стоимость материала");
    numeric(line.total, "Сумма материалов");
    if (line.total !== round(line.quantity * line.unitCost))
      throw new Error("Некорректная сумма материалов");
    if (line.materialId !== undefined && !materialIds.has(line.materialId))
      throw new Error("Неизвестный материал справочника");
    date(line.spentOn);
    timestamp(line.createdAt);
    validateVoid(line);
  }
  for (const line of order.costs) {
    text(line.name, "назначение расхода");
    numeric(line.amount);
    date(line.spentOn);
    timestamp(line.createdAt);
    validateVoid(line);
  }
  let received = 0;
  let refunded = 0;
  for (const line of order.payments) {
    numeric(line.amount);
    date(line.paidOn);
    timestamp(line.createdAt);
    if (
      !["payment", "refund"].includes(line.kind) ||
      !METHODS.includes(line.method)
    )
      throw new Error("Некорректный платёж ремонта");
    optionalText(line.reason, "причина платежа");
    if (line.kind === "refund") {
      text(line.reason, "причина возврата");
      refunded = round(refunded + line.amount);
    } else received = round(received + line.amount);
  }
  if (refunded > received)
    throw new Error("Возвраты превышают полученные платежи");
}

export function repairDefaults() {
  return {
    repairSchemaVersion: 1,
    repairOrders: [],
    repairTypes: [
      { id: "diagnostic", name: "Диагностика", archived: false },
      { id: "display", name: "Замена дисплея", archived: false },
      { id: "battery", name: "Замена аккумулятора", archived: false },
      { id: "charging", name: "Ремонт зарядки", archived: false },
      { id: "liquid", name: "Чистка после влаги", archived: false },
      { id: "other", name: "Другой ремонт", archived: false },
    ],
    materialCatalog: [],
    repairEvents: [],
  };
}

export function validateRepairState(state) {
  if (!isRecord(state)) throw new Error("Некорректное хранилище ремонта");
  const present = SCHEMA_KEYS.filter((key) => Object.hasOwn(state, key));
  if (!present.length) {
    if (Object.hasOwn(state, "repairLosses"))
      throw new Error("Убытки требуют полного раздела ремонтов");
    return state;
  }
  if (present.length !== SCHEMA_KEYS.length || state.repairSchemaVersion !== 1)
    throw new Error("Неполная или неподдерживаемая схема ремонта");
  const types = assertUnique(state.repairTypes, "виды ремонта");
  const materials = assertUnique(
    state.materialCatalog,
    "справочник материалов",
  );
  for (const item of state.repairTypes) {
    text(item.name, "вид ремонта");
    if (typeof item.archived !== "boolean")
      throw new Error("Некорректный архив вида ремонта");
  }
  for (const item of state.materialCatalog) {
    text(item.name, "название материала");
    text(item.unit, "единица материала");
    numeric(item.unitCost, "Стоимость материала");
    if (typeof item.archived !== "boolean")
      throw new Error("Некорректный архив материала");
  }
  const orders = assertUnique(state.repairOrders, "заказы ремонта");
  for (const order of state.repairOrders)
    validateOrder(order, types, materials);
  if (Object.hasOwn(state, "repairLosses")) {
    assertUnique(state.repairLosses, "убытки");
    for (const loss of state.repairLosses) {
      if (
        typeof loss.amount !== "number" ||
        !Number.isFinite(loss.amount) ||
        loss.amount >= 0 ||
        loss.amount !== round(loss.amount)
      )
        throw new Error("Убыток должен быть отрицательной конечной суммой");
      text(loss.reason, "причина убытка");
      date(loss.lostOn, "Дата убытка");
      timestamp(loss.createdAt);
      if (loss.orderId !== undefined && !orders.has(loss.orderId))
        throw new Error("Убыток ссылается на неизвестный ремонт");
      validateVoid(loss);
    }
  }
  assertUnique(state.repairEvents, "история ремонта");
  const operations = new Set();
  for (const event of state.repairEvents) {
    timestamp(event.at);
    if (!EVENT_TYPES.includes(event.type))
      throw new Error("Неизвестное событие ремонта");
    if (event.orderId !== undefined && !orders.has(event.orderId))
      throw new Error("Событие ссылается на неизвестный ремонт");
    if (
      !Object.hasOwn(event, "before") ||
      !Object.hasOwn(event, "after") ||
      (event.before !== null && !isRecord(event.before)) ||
      !isRecord(event.after)
    )
      throw new Error("Нет снимка события ремонта");
    optionalText(event.reason, "причина события");
    if (event.operationId !== undefined) {
      identifier(event.operationId);
      if (operations.has(event.operationId))
        throw new Error("Повтор операции ремонта");
      operations.add(event.operationId);
    }
  }
  return state;
}

export function ensureRepairState(state) {
  validateRepairState(state);
  return Object.hasOwn(state, "repairSchemaVersion")
    ? state
    : { ...state, ...repairDefaults() };
}

export function businessToday(instant = new Date()) {
  const value = new Date(instant);
  if (!Number.isFinite(value.getTime()))
    throw new Error("Некорректный момент времени");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (kind) => parts.find((part) => part.type === kind).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function operationSeen(state, operationId, type, orderId) {
  if (operationId === undefined) return false;
  identifier(operationId);
  const old = state.repairEvents.find(
    (event) => event.operationId === operationId,
  );
  if (!old) return false;
  if (old.type !== type || old.orderId !== orderId)
    throw new Error(
      "Этот идентификатор уже использован другой операцией ремонта",
    );
  return true;
}
function appendEvent(state, type, before, after, extra = {}) {
  return {
    ...state,
    repairEvents: [
      ...state.repairEvents,
      {
        id: uid(),
        type,
        at: new Date().toISOString(),
        before: clone(before),
        after: clone(after),
        ...extra,
      },
    ],
  };
}
function findOrder(state, id) {
  const order = state.repairOrders.find((item) => item.id === id);
  if (!order) throw new Error("Ремонт не найден");
  return order;
}
function changeOrder(state, before, after, type, extra = {}) {
  const updated = { ...after, updatedAt: new Date().toISOString() };
  return appendEvent(
    {
      ...state,
      repairOrders: state.repairOrders.map((item) =>
        item.id === before.id ? updated : item,
      ),
    },
    type,
    before,
    updated,
    { orderId: before.id, ...extra },
  );
}
function operationExtra(operationId) {
  return operationId === undefined ? {} : { operationId };
}

export function createRepair(state, input, operationId) {
  const current = ensureRepairState(state);
  if (operationId !== undefined) {
    identifier(operationId);
    const old = current.repairEvents.find(
      (event) => event.operationId === operationId,
    );
    if (old?.type === "repair-created") return current;
    if (old)
      throw new Error(
        "Этот идентификатор уже использован другой операцией ремонта",
      );
  }
  const type = current.repairTypes.find(
    (item) => item.id === input.repairTypeId && !item.archived,
  );
  if (!type) throw new Error("Выберите действующий вид ремонта");
  const order = {
    id: uid(),
    device: text(input.device, "устройство"),
    repairTypeId: type.id,
    repairTypeName: type.name,
    description: text(input.description ?? "", "описание", true),
    receivedOn: date(input.receivedOn),
    status: "accepted",
    plannedRevenue:
      input.plannedRevenue === null ||
      input.plannedRevenue === undefined ||
      input.plannedRevenue === ""
        ? null
        : money(input.plannedRevenue, "Плановая сумма"),
    materials: [],
    costs: [],
    payments: [],
    createdAt: new Date().toISOString(),
  };
  return appendEvent(
    { ...current, repairOrders: [...current.repairOrders, order] },
    "repair-created",
    null,
    order,
    { orderId: order.id, ...operationExtra(operationId) },
  );
}

export function setRepairStatus(state, id, status, reason = "") {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  if (!STATUSES.includes(status)) throw new Error("Неизвестный статус ремонта");
  const why = text(reason, "причина статуса", true);
  if (before.status === status) return current;
  // issuedOn is retained in snapshots; reopening clears only the current completion marker.
  const after = { ...before, status };
  if (status === "issued") after.issuedOn = businessToday();
  else delete after.issuedOn;
  return changeOrder(current, before, after, "repair-status", { reason: why });
}

export function updateRepair(state, id, input, reason = "") {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  const typeId = input.repairTypeId ?? before.repairTypeId;
  const type = current.repairTypes.find(
    (item) =>
      item.id === typeId && (!item.archived || item.id === before.repairTypeId),
  );
  if (!type) throw new Error("Выберите действующий вид ремонта");
  const after = {
    ...before,
    device: text(input.device ?? before.device, "устройство"),
    repairTypeId: type.id,
    repairTypeName:
      type.id === before.repairTypeId ? before.repairTypeName : type.name,
    description: text(
      input.description ?? before.description,
      "описание",
      true,
    ),
    receivedOn: date(input.receivedOn ?? before.receivedOn),
    plannedRevenue:
      input.plannedRevenue === undefined
        ? before.plannedRevenue
        : input.plannedRevenue === null || input.plannedRevenue === ""
          ? null
          : money(input.plannedRevenue, "Плановая сумма"),
  };
  return changeOrder(current, before, after, "repair-updated", {
    reason: text(reason, "причина изменения", true),
  });
}

export function addRepairMaterial(state, id, input, operationId) {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  if (operationSeen(current, operationId, "repair-material", id))
    return current;
  const template =
    input.materialId === undefined
      ? null
      : current.materialCatalog.find(
          (item) => item.id === input.materialId && !item.archived,
        );
  if (input.materialId !== undefined && !template)
    throw new Error("Материал справочника не найден или архивирован");
  const quantity = materialQuantity(input.quantity);
  const unitCost = money(
    input.unitCost ?? template?.unitCost,
    "Стоимость материала",
  );
  const line = {
    id: uid(),
    name: text(input.name ?? template?.name, "материал"),
    quantity,
    unit: text(input.unit ?? template?.unit, "единица материала"),
    unitCost,
    total: round(quantity * unitCost),
    spentOn: date(input.spentOn),
    createdAt: new Date().toISOString(),
    ...(template ? { materialId: template.id } : {}),
  };
  return changeOrder(
    current,
    before,
    { ...before, materials: [...before.materials, line] },
    "repair-material",
    operationExtra(operationId),
  );
}

export function addRepairCost(state, id, input, operationId) {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  if (operationSeen(current, operationId, "repair-cost", id)) return current;
  const line = {
    id: uid(),
    name: text(input.name, "назначение расхода"),
    amount: money(input.amount),
    spentOn: date(input.spentOn),
    createdAt: new Date().toISOString(),
  };
  return changeOrder(
    current,
    before,
    { ...before, costs: [...before.costs, line] },
    "repair-cost",
    operationExtra(operationId),
  );
}

export function addRepairPayment(state, id, input, operationId) {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  const kind = input.kind ?? "payment";
  if (!["payment", "refund"].includes(kind))
    throw new Error("Неизвестный вид платежа");
  const type = kind === "refund" ? "repair-refund" : "repair-payment";
  if (operationSeen(current, operationId, type, id)) return current;
  if (!METHODS.includes(input.method))
    throw new Error("Выберите способ оплаты");
  const amount = money(input.amount);
  const reason = text(
    input.reason ?? "",
    "причина возврата",
    kind !== "refund",
  );
  if (kind === "refund" && amount > repairOrderTotals(before).received)
    throw new Error("Возврат превышает полученную сумму");
  const line = {
    id: uid(),
    amount,
    paidOn: date(input.paidOn),
    method: input.method,
    kind,
    reason,
    createdAt: new Date().toISOString(),
  };
  return changeOrder(
    current,
    before,
    { ...before, payments: [...before.payments, line] },
    type,
    operationExtra(operationId),
  );
}

export function voidRepairExpense(state, id, kind, lineId, reason) {
  const current = ensureRepairState(state);
  const before = findOrder(current, id);
  if (!["material", "cost"].includes(kind))
    throw new Error("Неизвестный вид расхода");
  const key = kind === "material" ? "materials" : "costs";
  const line = before[key].find((item) => item.id === lineId);
  if (!line) throw new Error("Расход не найден");
  if (line.voided) throw new Error("Расход уже исправлен");
  const why = text(reason, "причина исправления");
  return changeOrder(
    current,
    before,
    {
      ...before,
      [key]: before[key].map((item) =>
        item.id === lineId
          ? {
              ...item,
              voided: true,
              voidReason: why,
              voidedAt: new Date().toISOString(),
            }
          : item,
      ),
    },
    "repair-expense-voided",
    { reason: why, expenseKind: kind, lineId },
  );
}

function lossAmount(value) {
  const normalized =
    typeof value === "string" ? value.trim().replace(/^−/, "-") : value;
  if (
    !["number", "string"].includes(typeof normalized) ||
    (typeof normalized === "string" && !/^-?\d+(?:\.\d+)?$/.test(normalized)) ||
    !Number.isFinite(Number(normalized)) ||
    Number(normalized) === 0
  )
    throw new Error("Укажите ненулевую сумму убытка, например -5000");
  const amount = -money(Math.abs(Number(normalized)), "Убыток");
  if (amount === 0) throw new Error("Убыток должен быть не меньше 0,01 ₸");
  return amount;
}

export function addRepairLoss(state, input, operationId) {
  const current = ensureRepairState(state);
  const orderId =
    input.orderId === "" || input.orderId == null ? undefined : input.orderId;
  if (orderId !== undefined) findOrder(current, orderId);
  if (operationSeen(current, operationId, "repair-loss", orderId))
    return current;
  const loss = {
    id: uid(),
    amount: lossAmount(input.amount),
    lostOn: date(input.lostOn, "Дата убытка"),
    reason: text(input.reason, "причина убытка"),
    createdAt: new Date().toISOString(),
    ...(orderId === undefined ? {} : { orderId }),
  };
  return appendEvent(
    { ...current, repairLosses: [...(current.repairLosses ?? []), loss] },
    "repair-loss",
    null,
    loss,
    {
      reason: loss.reason,
      ...(orderId === undefined ? {} : { orderId }),
      ...operationExtra(operationId),
    },
  );
}

export function voidRepairLoss(state, id, reason) {
  const current = ensureRepairState(state);
  const before = (current.repairLosses ?? []).find((loss) => loss.id === id);
  if (!before) throw new Error("Убыток не найден");
  if (before.voided) throw new Error("Убыток уже исправлен");
  const why = text(reason, "причина исправления убытка");
  const after = {
    ...before,
    voided: true,
    voidReason: why,
    voidedAt: new Date().toISOString(),
  };
  return appendEvent(
    {
      ...current,
      repairLosses: current.repairLosses.map((loss) =>
        loss.id === id ? after : loss,
      ),
    },
    "repair-loss-voided",
    before,
    after,
    {
      reason: why,
      lossId: id,
      ...(before.orderId === undefined ? {} : { orderId: before.orderId }),
    },
  );
}

function saveTemplate(state, input, key, type) {
  const current = ensureRepairState(state);
  const before =
    input.id === undefined
      ? null
      : current[key].find((item) => item.id === input.id);
  if (input.id !== undefined && !before)
    throw new Error("Запись справочника не найдена");
  const name = text(input.name ?? before?.name, "название");
  if (input.archived !== undefined && typeof input.archived !== "boolean")
    throw new Error("Некорректный признак архива");
  const archived = input.archived ?? before?.archived ?? false;
  const normalize = (value) => value.trim().toLocaleLowerCase("ru-RU");
  if (
    !archived &&
    current[key].some(
      (item) =>
        item.id !== before?.id &&
        !item.archived &&
        normalize(item.name) === normalize(name),
    )
  )
    throw new Error("Такая запись справочника уже есть");
  const after = { id: before?.id ?? uid(), name, archived };
  if (key === "materialCatalog") {
    after.unit = text(input.unit ?? before?.unit, "единица материала");
    after.unitCost = money(
      input.unitCost ?? before?.unitCost,
      "Стоимость материала",
    );
  }
  return appendEvent(
    {
      ...current,
      [key]: before
        ? current[key].map((item) => (item.id === before.id ? after : item))
        : [...current[key], after],
    },
    type,
    before,
    after,
  );
}
export function saveRepairType(state, input) {
  return saveTemplate(state, input, "repairTypes", "repair-type-saved");
}
export function saveRepairMaterialTemplate(state, input) {
  return saveTemplate(
    state,
    input,
    "materialCatalog",
    "repair-material-template-saved",
  );
}

export function repairOrderTotals(order, lossRows = []) {
  const sum = (rows, value) =>
    rows.reduce((total, line) => round(total + value(line)), 0);
  const grossReceived = sum(
    order.payments.filter((line) => line.kind === "payment"),
    (line) => line.amount,
  );
  const refunded = sum(
    order.payments.filter((line) => line.kind === "refund"),
    (line) => line.amount,
  );
  const received = round(grossReceived - refunded);
  const materials = sum(
    order.materials.filter((line) => !line.voided),
    (line) => line.total,
  );
  const costs = sum(
    order.costs.filter((line) => !line.voided),
    (line) => line.amount,
  );
  const losses = sum(
    lossRows.filter((loss) => !loss.voided && loss.orderId === order.id),
    (loss) => -loss.amount,
  );
  const expenses = round(materials + costs + losses);
  const plannedRevenue = order.plannedRevenue;
  return {
    received,
    grossReceived,
    refunded,
    materials,
    costs,
    losses,
    expenses,
    profit: round(received - expenses),
    plannedRevenue,
    balance:
      plannedRevenue === null
        ? null
        : round(Math.max(0, plannedRevenue - received)),
  };
}

function shiftDay(value, days) {
  const parsed = new Date(value + "T00:00:00.000Z");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
function periodOf(day, groupBy) {
  if (groupBy === "month") {
    const from = day.slice(0, 7) + "-01";
    const next = new Date(from + "T00:00:00.000Z");
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = shiftDay(next.toISOString().slice(0, 10), -1);
    return {
      key: day.slice(0, 7),
      from,
      to,
      label: new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(from + "T00:00:00.000Z")),
    };
  }
  const weekday = new Date(day + "T00:00:00.000Z").getUTCDay();
  const from = shiftDay(day, -((weekday + 6) % 7));
  const to = shiftDay(from, 6);
  const thursday = shiftDay(from, 3);
  const year = thursday.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const week = Math.ceil(
    ((Date.parse(thursday) - Date.parse(yearStart)) / 86400000 + 1) / 7,
  );
  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    from,
    to,
    label: `${from.slice(8)}.${from.slice(5, 7)}–${to.slice(8)}.${to.slice(5, 7)}.${to.slice(0, 4)}`,
  };
}
function blankTotals() {
  return {
    received: 0,
    grossReceived: 0,
    refunded: 0,
    materials: 0,
    costs: 0,
    losses: 0,
    expenses: 0,
    profit: 0,
  };
}

export function repairReport(
  state,
  { from = "", to = "", groupBy = "month" } = {},
) {
  const current = ensureRepairState(state);
  if (from) date(from);
  if (to) date(to);
  if (from && to && from > to)
    throw new Error("Начало периода позже окончания");
  if (!["week", "month"].includes(groupBy))
    throw new Error("Неизвестная группировка отчёта");
  const inPeriod = (day) => (!from || day >= from) && (!to || day <= to);
  const entries = [];
  for (const order of current.repairOrders) {
    for (const line of order.payments)
      entries.push({
        orderId: order.id,
        day: line.paidOn,
        field: line.kind === "refund" ? "refunded" : "grossReceived",
        amount: line.amount,
      });
    for (const line of order.materials.filter((row) => !row.voided))
      entries.push({
        orderId: order.id,
        day: line.spentOn,
        field: "materials",
        amount: line.total,
      });
    for (const line of order.costs.filter((row) => !row.voided))
      entries.push({
        orderId: order.id,
        day: line.spentOn,
        field: "costs",
        amount: line.amount,
      });
  }
  for (const loss of (current.repairLosses ?? []).filter(
    (row) => !row.voided,
  )) {
    entries.push({
      orderId: loss.orderId,
      day: loss.lostOn,
      field: "losses",
      amount: -loss.amount,
    });
  }
  const selected = entries.filter((entry) => inPeriod(entry.day));
  const dates = [
    ...selected.map((entry) => entry.day),
    ...current.repairOrders
      .filter((order) => inPeriod(order.receivedOn))
      .map((order) => order.receivedOn),
  ].sort();
  const lower = from || dates[0] || to;
  const upper = to || dates.at(-1) || from;
  const buckets = new Map();
  if (lower && upper && lower <= upper) {
    let cursor = periodOf(lower, groupBy).from;
    const last = periodOf(upper, groupBy).from;
    let count = 0;
    while (cursor <= last) {
      if (++count > 20000) throw new Error("Слишком большой период отчёта");
      const period = periodOf(cursor, groupBy);
      buckets.set(period.key, { ...period, ...blankTotals() });
      cursor = shiftDay(period.to, 1);
    }
  }
  const totals = blankTotals();
  for (const entry of selected) {
    totals[entry.field] = round(totals[entry.field] + entry.amount);
    const key = periodOf(entry.day, groupBy).key;
    const bucket = buckets.get(key);
    if (bucket) bucket[entry.field] = round(bucket[entry.field] + entry.amount);
  }
  const finish = (item) => ({
    ...item,
    received: round(item.grossReceived - item.refunded),
    expenses: round(item.materials + item.costs + item.losses),
    profit: round(
      item.grossReceived -
        item.refunded -
        item.materials -
        item.costs -
        item.losses,
    ),
  });
  return {
    ...finish(totals),
    from,
    to,
    groupBy,
    orderCount: current.repairOrders.filter((order) =>
      inPeriod(order.receivedOn),
    ).length,
    completedCount: current.repairOrders.filter(
      (order) => order.status === "issued" && inPeriod(order.issuedOn),
    ).length,
    totalOrderCount: current.repairOrders.length,
    totalCompletedCount: current.repairOrders.filter(
      (order) => order.status === "issued",
    ).length,
    transactionOrderCount: new Set(
      selected.map((entry) => entry.orderId).filter((id) => id !== undefined),
    ).size,
    series: [...buckets.values()].map(finish),
  };
}
