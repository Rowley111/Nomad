// This is a public API address. DATABASE_URL must never enter the frontend.
export const API_URL = (import.meta.env?.VITE_API_URL ?? "").trim().replace(/\/$/, "");
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
export function createRemote(apiUrl = API_URL) {
  const url = new URL(apiUrl);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
    throw new Error("Адрес API должен быть HTTPS без паролей и параметров");
  let token = "";
  const remote = {
    revision: 0,
    user: null,
    pending: null,
    async request(path, { method = "GET", body, signal } = {}) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 30000);
      try {
        const response = await fetch(apiUrl.replace(/\/$/, "") + "/api" + path, {
          method,
          headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
        });
        const result = await response.json();
        if (!response.ok) {
          const detail = typeof result.detail === "string" ? result.detail : "Сервер отклонил запрос";
          throw new ApiError(detail, response.status);
        }
        return result;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("Нет подтверждения сервера. Проверьте связь; данные браузера не заменены.");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
    async login(username, password) {
      const result = await remote.request("/auth/login", { method: "POST", body: { username, password } });
      token = result.token;
      remote.user = result.user;
      return remote.user;
    },
    async logout() {
      try { await remote.request("/auth/logout", { method: "POST" }); }
      finally { token = ""; remote.user = null; remote.pending = null; }
    },
    async load() {
      const result = await remote.request("/workspace");
      remote.revision = result.revision;
      return result;
    },
    async write(state) {
      if (remote.pending) throw new ApiError("Сначала повторите незавершённое сохранение");
      remote.pending = { state, revision: remote.revision, operationId: crypto.randomUUID() };
      return remote.retry();
    },
    async retry() {
      if (!remote.pending) throw new Error("Нет незавершённого сохранения");
      try {
        const result = await remote.request("/workspace", { method: "PUT", body: remote.pending });
        remote.revision = result.revision;
        remote.pending = null;
        return result;
      } catch (error) {
        // A transport failure has an unknown outcome. Replay the same operation,
        // never create another sale/payment with a newly generated identifier.
        // A gateway may fail after commit. Replay the same operation on 5xx.
        if (error.status >= 400 && error.status < 500 && error.status !== 408)
          remote.pending = null;
        throw error;
      }
    },
  };
  return remote;
}
