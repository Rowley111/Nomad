import { catalogForGuide } from "./catalog.js";
import { previewGuide } from "./guide.js";
import { mergePrices, validatePrice } from "./imports.js";
import { priceKey, configKey, guidePolicyDefaults } from "./valuation.js";

const ID_PATTERN = /^[a-f0-9]{32}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PREFIX = "#nomad-setup=";
const MAX_BYTES = 400000;
export function captureSetupRequest(location, history) {
  if (!location.hash.startsWith(PREFIX)) return null;
  const value = location.hash.slice(PREFIX.length);
  // The fragment is not sent to the server; remove it before starting requests.
  history.replaceState(history.state, "", location.pathname + location.search);
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !ID_PATTERN.test(parts[0]) ||
    !KEY_PATTERN.test(parts[1])
  )
    return {
      error:
        "Ссылка настройки повреждена. Используйте полную ссылку из сообщения.",
    };
  return { id: parts[0], key: parts[1] };
}
function decode64(value) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function decryptSetup(
  envelope,
  request,
  cryptoApi = globalThis.crypto,
) {
  if (!ID_PATTERN.test(request.id) || !KEY_PATTERN.test(request.key))
    throw new Error("Некорректная ссылка настройки");
  if (
    envelope?.version !== 1 ||
    envelope.algorithm !== "AES-256-GCM" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    envelope.ciphertext.length > MAX_BYTES
  )
    throw new Error("Неподдерживаемый файл настройки");
  const iv = decode64(envelope.iv),
    keyBytes = decode64(request.key),
    ciphertext = decode64(envelope.ciphertext);
  if (iv.length !== 12 || keyBytes.length !== 32 || ciphertext.length < 16)
    throw new Error("Повреждённый файл настройки");
  try {
    const key = await cryptoApi.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const bytes = await cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(
          "nomad-owner-setup:v1:" + request.id,
        ),
      },
      key,
      ciphertext,
    );
    if (bytes.byteLength > MAX_BYTES) throw new Error("Слишком большой прайс");
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(
      "Не удалось открыть прайс: ссылка неполная или файл повреждён.",
    );
  }
}
export async function loadSetupGuide(
  request,
  { fetcher = globalThis.fetch, cryptoApi = globalThis.crypto, signal } = {},
) {
  if (!ID_PATTERN.test(request.id) || !KEY_PATTERN.test(request.key))
    throw new Error("Некорректная ссылка настройки");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher("/setup/" + request.id + ".json", {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        "Прайс пока недоступен. Откройте ссылку ещё раз после обновления сайта.",
      );
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw new Error("Файл настройки слишком большой");
    // Bound streamed responses too, including those without Content-Length.
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Файл настройки слишком большой");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let pos = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, pos);
      pos += chunk.byteLength;
    }
    let envelope;
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(
        "Сайт ещё обновляется. Повторите открытие ссылки настройки.",
      );
    }
    return await decryptSetup(envelope, request, cryptoApi);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export function applySetupGuide(
  state,
  guide,
  id,
  now = new Date().toISOString(),
) {
  if (!ID_PATTERN.test(id))
    throw new Error("Некорректный идентификатор настройки");
  const previous = (state.setupImports ?? []).find((x) => x.id === id);
  if (previous) return { state, report: { ...previous, alreadyApplied: true } };
  const catalog = catalogForGuide(state.catalog),
    preview = previewGuide(guide, catalog);
  const rows = preview.valid.map((x) => validatePrice(x, catalog));
  if (!rows.length)
    throw new Error("В прайсе нет подтверждённых конфигураций для оценки");
  const existing = new Set(state.prices.map(priceKey));
  const existingGuides = new Set(
    state.prices.filter((row) => row.source === "owner-guide").map(configKey),
  );
  const missing = rows.filter(
    (row) =>
      !existing.has(priceKey(row)) && !existingGuides.has(configKey(row)),
  );
  const merged = mergePrices({ ...state, catalog }, missing);
  const report = {
    id,
    at: now,
    added: missing.length,
    kept: rows.length - missing.length,
    pending: preview.pending.length,
    pendingRows: preview.pending.map((x) => ({
      model: x.model ?? null,
      storage: x.storage ?? null,
      message: x.message,
    })),
  };
  return {
    state: {
      ...merged,
      policy: { ...guidePolicyDefaults, ...state.policy },
      setupImports: [...(state.setupImports ?? []), report].slice(-100),
    },
    report,
  };
}
