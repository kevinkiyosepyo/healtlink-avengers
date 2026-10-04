import test from "node:test";
import assert from "node:assert/strict";
import { nodeHandler } from "../server/node.js";
import { createPublicInstitutionPreviewHandler } from "../server/publicInstitution.js";
import { createApiHandler } from "../server/handlers.js";

async function throughNode(handler, { env = {}, origin = "https://research.example", protocol = "https", encrypted = false, forwardedHost, method = "POST" } = {}) {
  const incoming = {
    url: "/api/institution-preview", method,
    headers: { host: "research.example", origin, "content-type": "application/json", ...(protocol === null ? {} : { "x-forwarded-proto": protocol }), ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}) },
    socket: { encrypted }, body: { university: "harvard" }, once() {},
  };
  let response;
  const outgoingHeaders = new Headers();
  const outgoing = {
    statusCode: 200, once() {}, setHeader(name, value) { outgoingHeaders.set(name, value); },
    end(bytes) { response = new Response(bytes, { status: this.statusCode, headers: outgoingHeaders }); },
  };
  await nodeHandler(handler, { env })(incoming, outgoing);
  return response;
}

const publicPreview = () => createPublicInstitutionPreviewHandler({ fetchSource: () => assert.fail("An unsupported direct university never fetches a website") });

test("Vercel TLS termination preserves the browser's HTTPS origin for public preview requests", async () => {
  const response = await throughNode(publicPreview(), { env: { VERCEL: "1" } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.university.id, "harvard");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("trusted forwarded HTTPS still rejects cross-origin and malformed protocol headers", async () => {
  for (const origin of ["https://attacker.example", "https://sub.research.example", "http://research.example"]) {
    const response = await throughNode(publicPreview(), { env: { VERCEL: "1" }, origin });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "origin_rejected");
  }
  for (const protocol of ["https,http", "https, http", "HTTPS", "ftp", "https://", ""]) {
    const response = await throughNode(() => assert.fail("Malformed forwarding must reject before the API handler"), { env: { VERCEL: "1" }, protocol });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "invalid_forwarded_protocol");
  }
});

test("local transport ignores forwarded scheme and host while respecting actual TLS", async () => {
  for (const env of [{}, { VERCEL: "0" }, { VERCEL: "true" }]) {
    assert.equal((await throughNode(publicPreview(), { env })).status, 403);
    assert.equal((await throughNode(publicPreview(), { env, origin: "http://research.example", protocol: "https, http" })).status, 200);
  }
  assert.equal((await throughNode(publicPreview(), { encrypted: true })).status, 200);
  assert.equal((await throughNode(publicPreview(), { env: { VERCEL: "1" }, protocol: "http" })).status, 403);
  assert.equal((await throughNode(publicPreview(), { env: { VERCEL: "1" }, protocol: null })).status, 403);
  assert.equal((await throughNode(publicPreview(), { env: { VERCEL: "1" }, forwardedHost: "attacker.example", origin: "https://attacker.example" })).status, 403);
});

test("forwarded HTTPS does not bypass authenticated API origin checks", async () => {
  const env = { AUTH_URL: "https://research.example", AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters", AUTH_GOOGLE_ID: "test-client", AUTH_GOOGLE_SECRET: "test-secret" };
  const api = createApiHandler({ env, authenticate: () => assert.fail("Cross-origin mutations must reject before authentication") });
  const wrapper = async (request) => api(new Request(new URL("/api/institution", request.url), request));
  const response = await throughNode(wrapper, { env: { VERCEL: "1" }, origin: "https://attacker.example" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "origin_rejected");
});
