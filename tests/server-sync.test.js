import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createSyncHandler, userKey } from "../server/sync.js";
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
