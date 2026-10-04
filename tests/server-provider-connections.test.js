import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "@auth/core/jwt";
import { createApiHandler } from "../server/handlers.js";
import { nodeHandler } from "../server/node.js";
import {
  SESSION_SECONDS, anthropicKeyCookieName, readAnthropicApiKey, readAnthropicConnection,
  sealAnthropicApiKey, sealAnthropicConnection, settings,
} from "../server/security.js";

const env = { AUTH_URL: "https://fresh-user.example", AUTH_SECRET: "synthetic-test-secret-with-more-than-thirty-two-characters", AUTH_GOOGLE_ID: "test-client", AUTH_GOOGLE_SECRET: "test-secret" };
const config = settings(env);
const user = { id: "fresh-google-user", sid: "fresh-google-login", expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
const keys = { openai: `sk-${"a".repeat(40)}`, anthropic: `sk-ant-${"b".repeat(50)}` };
const workspaceId = "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ";
const output = (provider, text = "OK") => provider === "anthropic"
  ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text }] }
  : { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] };

async function googleCookie(identity = user) {
  const salt = "__Secure-authjs.session-token";
  const token = await encode({ secret: config.secret, salt, maxAge: SESSION_SECONDS, token: {
    sub: identity.id, sid: identity.sid, sessionExpiresAt: identity.expiresAt, provider: "google", name: "Fresh Researcher", email: "fresh@example.com",
  } });
  return `${salt}=${token}`;
}
function request(path, { method = "GET", body, cookie } = {}) {
  return new Request(`${config.origin}${path}`, { method, headers: {
    Origin: config.origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const handler = fetchImpl => createApiHandler({ env, fetchImpl });

async function throughNode(api, webRequest) {
  const url = new URL(webRequest.url);
  const incoming = { url: url.pathname + url.search, method: webRequest.method, headers: { ...Object.fromEntries(webRequest.headers), host: url.host }, socket: { encrypted: false }, once() {} };
  if (webRequest.method === "POST") incoming.body = JSON.parse(await webRequest.text());
  const headers = new Headers();
  let response;
  const outgoing = { statusCode: 200, once() {}, setHeader(name, values) {
    for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value);
  }, end(body) { response = new Response(body, { status: this.statusCode, headers }); } };
  await nodeHandler(api)(incoming, outgoing);
  return response;
}

test("fresh Google sessions connect and run either provider through the production Node transport", async () => {
  for (const provider of ["openai", "anthropic"]) {
    const calls = [];
    const api = handler(async (url, init) => {
      assert.equal(url, provider === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses");
      const payload = JSON.parse(init.body);
      calls.push(payload);
      assert.equal(init.headers[provider === "anthropic" ? "x-api-key" : "Authorization"], provider === "anthropic" ? keys.anthropic : `Bearer ${keys.openai}`);
      if (provider === "anthropic") assert.equal(init.headers["anthropic-workspace-id"], workspaceId);
      else assert.equal(init.headers["anthropic-workspace-id"], undefined);
      return Response.json(output(provider, calls.length === 1 ? "OK" : "Review prerequisites and recruitment assumptions."));
    });
    const authCookie = await googleCookie();
    const connected = await throughNode(api, request(`/api/${provider}`, { method: "POST", cookie: authCookie, body: { apiKey: keys[provider], ...(provider === "anthropic" ? { workspaceId } : {}) } }));
    assert.equal(connected.status, 200);
    assert.equal((await connected.json())[`${provider}Connected`], true);
    const cookie = `${authCookie}; ${connected.headers.get("set-cookie").split(";")[0]}`;
    const accountResponse = await throughNode(api, request("/api/account", { cookie }));
    const account = await accountResponse.json();
    assert.equal(account.user.id, user.id);
    assert.equal(account.user.provider, "google");
    assert.equal(account[`${provider}Connected`], true);
    assert.ok(!JSON.stringify(account).includes(keys[provider]));
    const run = await throughNode(api, request("/api/simulate", { method: "POST", cookie, body: { provider, prompt: "How could recruitment timing affect this fictional study?" } }));
    assert.equal(run.status, 200);
    const result = await run.json();
    assert.equal(result.provider, provider);
    assert.equal(result.agentCount, 3);
    assert.match(result.content, /Review prerequisites/);
    assert.equal(calls.length, 4); // One connection check, then three perspectives.
    assert.equal(calls[0][provider === "anthropic" ? "max_tokens" : "max_output_tokens"], 16);
    assert.equal(calls[1][provider === "anthropic" ? "max_tokens" : "max_output_tokens"], 700);
    const otherUser = `${await googleCookie({ ...user, id: "another-google-user" })}; ${connected.headers.get("set-cookie").split(";")[0]}`;
    const unauthorized = await throughNode(api, request("/api/simulate", { method: "POST", cookie: otherUser, body: { provider, prompt: "A fictional study" } }));
    assert.equal(unauthorized.status, 403);
    assert.equal((await unauthorized.json()).code, `${provider}_not_connected`);
    assert.equal(calls.length, 4);
  }
});

test("Responses-enabled keys work without Models-read access, while read-only keys never claim a connection", async () => {
  let requests = 0;
  const responsesOnly = handler(async (url, init) => {
    requests++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.deepEqual(body.input, [{ role: "user", content: "Reply exactly OK" }]);
    return Response.json(output("openai"));
  });
  const cookie = await googleCookie();
  assert.equal((await responsesOnly(request("/api/openai", { method: "POST", cookie, body: { apiKey: keys.openai } }))).status, 200);
  assert.equal(requests, 1);
  const readOnly = handler(async () => Response.json({ error: { code: "insufficient_permissions", message: `Sensitive key ${keys.openai}` } }, { status: 403 }));
  const rejected = await readOnly(request("/api/openai", { method: "POST", cookie, body: { apiKey: keys.openai } }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("set-cookie"), null);
  const error = await rejected.json();
  assert.equal(error.code, "openai_permission_denied");
  assert.match(error.error, /Responses write access/);
  assert.ok(!JSON.stringify(error).includes(keys.openai));
});

test("failed, unfinished, empty, and unreadable verification responses cannot set connection cookies", async () => {
  const cookie = await googleCookie();
  for (const provider of ["openai", "anthropic"]) {
    const incomplete = provider === "anthropic" ? { ...output(provider), stop_reason: "max_tokens" } : { status: "incomplete", output: [] };
    for (const body of [incomplete, output(provider, ""), "unreadable provider body"]) {
      const api = handler(async () => typeof body === "string" ? new Response(body) : Response.json(body));
      const response = await api(request(`/api/${provider}`, { method: "POST", cookie, body: { apiKey: keys[provider] } }));
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.ok(!JSON.stringify(await response.json()).includes("unreadable provider body"));
    }
  }
});

test("generation verification gives safe actionable credit, model, workspace, and permission errors", async () => {
  const cases = [
    ["openai", 429, { code: "insufficient_quota" }, "openai_quota", /API billing/],
    ["openai", 404, { code: "model_not_found" }, "openai_model_unavailable", /model access/],
    ["anthropic", 400, { type: "invalid_request_error", message: "anthropic-workspace-id is required when authenticating with an identity-linked API key" }, "anthropic_workspace_required", /workspace ID/],
    ["anthropic", 400, { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API" }, "anthropic_quota", /API billing/],
    ["anthropic", 404, { type: "not_found_error" }, "anthropic_model_unavailable", /model or workspace/],
  ];
  const cookie = await googleCookie();
  for (const [provider, status, details, code, expected] of cases) {
    const api = handler(async () => Response.json({ error: { ...details, message: `${details.message || "Failure"}. Sensitive ${keys[provider]}` } }, { status }));
    const response = await api(request(`/api/${provider}`, { method: "POST", cookie, body: { apiKey: keys[provider] } }));
    const result = await response.json();
    assert.equal(result.code, code);
    assert.match(result.error, expected);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!JSON.stringify(result).includes(keys[provider]));
    assert.ok(!JSON.stringify(result).includes("Sensitive"));
  }
  for (const body of [null, [], "Sensitive invalid JSON", { error: { message: "x".repeat(10_000) } }]) {
    const api = handler(async () => typeof body === "string" ? new Response(body, { status: 403 }) : Response.json(body, { status: 403 }));
    const response = await api(request("/api/openai", { method: "POST", cookie, body: { apiKey: keys.openai } }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "openai_permission_denied");
  }
});

test("invalid workspace IDs cannot reach Anthropic and optional IDs remain optional", async () => {
  let calls = 0;
  const api = handler(async (_url, init) => {
    calls++;
    assert.equal(init.headers["anthropic-workspace-id"], undefined);
    return Response.json(output("anthropic"));
  });
  const cookie = await googleCookie();
  for (const workspaceId of ["not-a-workspace", "wrkspc_short", "wrkspc_" + "a".repeat(81), "wrkspc_aaaaaaaaaaaaaaaa\r\nInjected: header", {}, [], 1, true]) {
    const response = await api(request("/api/anthropic", { method: "POST", cookie, body: { apiKey: keys.anthropic, workspaceId } }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "invalid_workspace_id");
  }
  assert.equal(calls, 0);
  for (const workspaceId of [undefined, null, "", "  "]) {
    assert.equal((await api(request("/api/anthropic", { method: "POST", cookie, body: { apiKey: keys.anthropic, ...(workspaceId === undefined ? {} : { workspaceId }) } }))).status, 200);
  }
  assert.equal(calls, 4);
});

test("Anthropic workspace metadata is encrypted and bound to user, login, expiry, and the provider cookie", async () => {
  const sealed = await sealAnthropicConnection({ apiKey: keys.anthropic, workspaceId }, user, config);
  assert.ok(!sealed.includes(keys.anthropic));
  assert.ok(!sealed.includes(workspaceId));
  const req = request("/api/account", { cookie: `${anthropicKeyCookieName(config)}=${sealed}` });
  assert.deepEqual(await readAnthropicConnection(req, user, config), { apiKey: keys.anthropic, workspaceId });
  assert.equal(await readAnthropicApiKey(req, user, config), keys.anthropic);
  assert.equal(await readAnthropicConnection(req, { ...user, id: "other-user" }, config), null);
  assert.equal(await readAnthropicConnection(req, { ...user, sid: "later-login" }, config), null);
  assert.equal(await readAnthropicConnection(req, user, config, Date.now() + SESSION_SECONDS * 1000 + 1000), null);
  const badMetadata = await sealAnthropicConnection({ apiKey: keys.anthropic, workspaceId: "invalid-header\r\n" }, user, config);
  assert.equal(await readAnthropicConnection(request("/api/account", { cookie: `${anthropicKeyCookieName(config)}=${badMetadata}` }), user, config), null);
  const legacy = await sealAnthropicApiKey(keys.anthropic, user, config);
  assert.deepEqual(await readAnthropicConnection(request("/api/account", { cookie: `${anthropicKeyCookieName(config)}=${legacy}` }), user, config), { apiKey: keys.anthropic, workspaceId: null });
});

test("legacy Anthropic key-only cookies still execute simulations with no workspace header", async () => {
  const cookie = `${await googleCookie()}; ${anthropicKeyCookieName(config)}=${await sealAnthropicApiKey(keys.anthropic, user, config)}`;
  let calls = 0;
  const api = handler(async (_url, init) => {
    calls++;
    assert.equal(init.headers["anthropic-workspace-id"], undefined);
    return Response.json(output("anthropic", "Review the study assumptions."));
  });
  const response = await api(request("/api/simulate", { method: "POST", cookie, body: { provider: "anthropic", prompt: "A fictional study" } }));
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});
