import test from "node:test";
import assert from "node:assert/strict";
import { createRemote, ApiError } from "../src/domain/remote.js";
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
test("API URL rejects credentials, insecure public origins and query strings", () => {
  for (const address of ["http://nomad.example", "https://user:password@nomad.example", "https://nomad.example?token=secret"])
    assert.throws(() => createRemote(address));
  assert.ok(createRemote("http://127.0.0.1:8000"));
});
test("unknown save outcome reuses exactly the same operation and revision", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  let fail = true;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/auth/login")) return response({ token: "opaque-test-token", user: { username: "staff", role: "staff" } });
    if (fail) { fail = false; throw new TypeError("offline"); }
    return response({ state: { inventory: [] }, revision: 8 });
  };
  try {
    const remote = createRemote("https://nomad-api.example");
    await remote.login("staff", "test password");
    remote.revision = 7;
    await assert.rejects(remote.write({ inventory: [] }), (error) => error instanceof ApiError && error.status === 0);
    const operation = structuredClone(remote.pending);
    await assert.rejects(remote.write({ inventory: ["another action"] }), /Сначала повторите/);
    const result = await remote.retry();
    assert.equal(result.revision, 8);
    assert.equal(remote.pending, null);
    const saves = requests.filter((request) => request.options.method === "PUT");
    assert.equal(saves.length, 2);
    assert.deepEqual(JSON.parse(saves[0].options.body), operation);
    assert.equal(saves[0].options.body, saves[1].options.body);
    assert.equal(saves[0].options.headers.Authorization, "Bearer opaque-test-token");
    assert.equal(saves[0].options.credentials, "omit");
    assert.equal(remote.revision, 8);
  } finally { globalThis.fetch = previousFetch; }
});
test("revision conflict does not advance client version or retain a blind retry", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ detail: "База изменена другим сотрудником" }, 409);
  try {
    const remote = createRemote("https://nomad-api.example"); remote.revision = 2;
    await assert.rejects(remote.write({ inventory: [] }), (error) => error.status === 409);
    assert.equal(remote.revision, 2);
    assert.equal(remote.pending, null);
  } finally { globalThis.fetch = previousFetch; }
});
test("gateway failure preserves the operation because the server may have committed", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(options.body);
    return bodies.length === 1 ? response({ detail: "gateway failed after commit" }, 503)
      : response({ state: { inventory: [] }, revision: 2 });
  };
  try {
    const remote = createRemote("https://nomad-api.example");
    remote.revision = 1;
    await assert.rejects(remote.write({ inventory: [] }), (error) => error.status === 503);
    assert.ok(remote.pending);
    await remote.retry();
    assert.equal(bodies[0], bodies[1]);
    assert.equal(remote.revision, 2);
  } finally { globalThis.fetch = previousFetch; }
});
test("logout clears the in-memory session even when network is unavailable", async () => {
  const previousFetch = globalThis.fetch;
  let offline = false;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(options);
    if (offline) throw new TypeError("offline");
    return response({ token: "opaque-test-token", user: { role: "admin" } });
  };
  try {
    const remote = createRemote("https://nomad-api.example"); await remote.login("owner", "test password");
    offline = true; await assert.rejects(remote.logout());
    assert.equal(remote.user, null);
    offline = false; await remote.request("/auth/me");
    assert.equal(requests.at(-1).headers.Authorization, undefined);
  } finally { globalThis.fetch = previousFetch; }
});
