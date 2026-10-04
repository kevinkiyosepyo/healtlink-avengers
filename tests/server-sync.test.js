import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createSyncHandler, userKey } from "../server/sync.js";
import { createApiHandler } from "../server/handlers.js";
import { nodeHandler } from "../server/node.js";
import { SYNC_BODY_LIMIT } from "../server/sync.js";
import { createRecord } from "../frontend/src/lib/records.js";

const config = { origin: "https://microfish.test", secret: "test-secret-value-long-enough" };
const alice = { id: "google-sub-alice", provider: "google" };
const bob = { id: "google-sub-bob", provider: "google" };

function handlerFor(sessionRef) {
  return createSyncHandler({ config, store: createMemoryStore(), authenticate: async () => sessionRef.current, now: () => new Date("2026-10-04T00:00:00Z") });
}
function request(path, { method = "GET", body, origin = config.origin } = {}) {
  return new Request(`${config.origin}${path}`, {
    method,
    headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(handler, path, options) {
  try {
    const response = await handler(request(path, options));
    return { status: response.status, body: await response.json() };
  } catch (error) {
    return { status: error.status, body: { code: error.code } };
  }
}
const sampleRecord = () => createRecord({ runId: "run-1", sessionId: "s1", sessionTitle: "Visits", prompt: "fewer visits", mode: "demo", guardrails: { local: "pass" } });

test("sync requires sign-in and returns nothing until configured", async () => {
  const session = { current: null };
  assert.equal((await call(handlerFor(session), "/api/sync")).status, 401);
  assert.equal(createSyncHandler({ config, store: null, authenticate: async () => alice }), null);
});

test("records round-trip per user and stay invisible to other users", async () => {
  const session = { current: alice };
  const handler = handlerFor(session);
  const record = await sampleRecord();
  const put = await call(handler, "/api/sync/record:run-1", { method: "PUT", body: { data: record } });
  assert.equal(put.status, 200);
  const mine = await call(handler, "/api/sync");
  assert.equal(mine.body.items.length, 1);
  assert.equal(mine.body.items[0].fingerprint, record.fingerprint);
  assert.deepEqual(mine.body.items[0].data, record);
  session.current = bob;
  assert.deepEqual((await call(handler, "/api/sync")).body.items, []);
});

test("tampered, mismatched or malformed records are rejected", async () => {
  const handler = handlerFor({ current: alice });
  const record = await sampleRecord();
  assert.equal((await call(handler, "/api/sync/record:run-1", { method: "PUT", body: { data: { ...record, prompt: "edited after signing" } } })).status, 422);
  assert.equal((await call(handler, "/api/sync/record:other-run", { method: "PUT", body: { data: record } })).status, 400);
  assert.equal((await call(handler, "/api/sync/../../etc", { method: "PUT", body: { data: record } })).status, 400);
  assert.equal((await call(handler, "/api/sync/workspace", { method: "PUT", body: { data: { sessions: "nope" } } })).status, 400);
  assert.equal((await call(handler, "/api/sync/workspace", { method: "PUT", body: { data: { version: 1, sessions: [] } } })).status, 200);
});

test("writes from another origin are refused; deleting everything clears the user", async () => {
  const handler = handlerFor({ current: alice });
  const record = await sampleRecord();
  assert.equal((await call(handler, "/api/sync/record:run-1", { method: "PUT", body: { data: record }, origin: "https://evil.example" })).status, 403);
  await call(handler, "/api/sync/record:run-1", { method: "PUT", body: { data: record } });
  assert.equal((await call(handler, "/api/sync", { method: "DELETE" })).status, 200);
  assert.deepEqual((await call(handler, "/api/sync")).body.items, []);
});

test("storage keys are a salted hash, never the raw account id", () => {
  const key = userKey(alice, config.secret);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes(alice.id));
  assert.notEqual(key, userKey(bob, config.secret));
});


test("shared API exposes configured cloud backup and preserves Google account partitions", async () => {
  const env = { AUTH_URL: config.origin, AUTH_SECRET: "test-secret-value-with-more-than-thirty-two-characters", AUTH_GOOGLE_ID: "client", AUTH_GOOGLE_SECRET: "secret" };
  const session = { ...alice, sid: "login", expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  const store = createMemoryStore();
  const api = createApiHandler({ env, authenticate: async () => session, syncStore: store });
  const account = await (await api(request("/api/account"))).json();
  assert.equal(account.cloudSync, true);
  assert.equal(account.user.provider, "google");
  const data = { version: 1, sessions: [{ id: "saved-chat" }] };
  const response = await api(request("/api/sync/workspace", { method: "PUT", body: { data } }));
  assert.equal(response.status, 200);
  const saved = await store.list(userKey(alice, env.AUTH_SECRET));
  assert.deepEqual(saved[0].data, data);
  assert.deepEqual((await (await api(request("/api/sync"))).json()).items[0].data, data);
  const disabled = createApiHandler({ env, authenticate: async () => session, syncStore: null });
  assert.equal((await disabled(request("/api/sync"))).status, 503);
});

test("Node transport allows cloud snapshots above the generic limit and enforces the sync limit", async () => {
  async function send(size, streamed) {
    let accepted = false;
    const handler = nodeHandler(async incoming => { accepted = true; return Response.json({ size: (await incoming.arrayBuffer()).byteLength }); });
    const body = Buffer.alloc(size);
    const req = { url: "/api/sync/workspace?test=1", method: "PUT", headers: { host: "microfish.test", "content-type": "application/json" }, socket: {}, once() {} };
    if (streamed) req[Symbol.asyncIterator] = async function * () { yield body; };
    else req.body = body;
    let response;
    const res = { statusCode: 200, once() {}, setHeader() {}, end(bytes) { response = new Response(bytes, { status: this.statusCode }); } };
    await handler(req, res);
    return { response, accepted };
  }
  for (const streamed of [false, true]) {
    const allowed = await send(64 * 1024, streamed);
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.accepted, true);
    const denied = await send(SYNC_BODY_LIMIT + 1, streamed);
    assert.equal(denied.response.status, 413);
    assert.equal(denied.accepted, false);
  }
});
