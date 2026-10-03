import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "@auth/core/jwt";
import { createApiHandler } from "../server/handlers.js";
import { authenticate, authConfig } from "../server/auth.js";
import { nodeHandler } from "../server/node.js";
import { settings, readApiKey, sealApiKey, keyCookie, keyCookieName, SESSION_SECONDS } from "../server/security.js";

const env = {
  AUTH_URL: "https://research.example",
  AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters",
  AUTH_GOOGLE_ID: "test-client-id",
  AUTH_GOOGLE_SECRET: "test-client-secret",
};
const config = settings(env);
const session = { id: "researcher-one", sid: "login-one", expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS, name: "Rae", email: "rae@example.com", image: null };
const apiKey = `sk-${"a".repeat(40)}`;
function request(path, { method = "GET", origin = config.origin, body, cookie, contentType = "application/json" } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", contentType);
  return new Request(`${config.origin}${path}`, { method, headers, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
}
async function connectedCookie(identity = session) {
  return `${keyCookieName(config)}=${await sealApiKey(apiKey, identity, config)}`;
}
function handler(options = {}) {
  return createApiHandler({ env, authenticate: async () => session, ...options });
}

test("missing and invalid auth settings leave an honest anonymous account", async () => {
  for (const invalid of [{}, { ...env, AUTH_SECRET: "short" }, { ...env, AUTH_URL: "http://untrusted.example" }, { ...env, AUTH_URL: "https://research.example/path" }]) {
    const api = createApiHandler({ env: invalid });
    const response = await api(request("/api/account"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { configured: false, user: null, openaiConnected: false });
    assert.equal((await api(request("/api/simulate", { method: "POST", body: { prompt: "hello" } }))).status, 503);
  }
});

test("the API key is encrypted, login-bound, user-bound, secret-bound, and expiring", async () => {
  const sealed = await sealApiKey(apiKey, session, config);
  assert.ok(!sealed.includes(apiKey));
  const req = request("/api/account", { cookie: `${keyCookieName(config)}=${sealed}` });
  assert.equal(await readApiKey(req, session, config), apiKey);
  assert.equal(await readApiKey(req, { ...session, id: "another-user" }, config), null);
  assert.equal(await readApiKey(req, { ...session, sid: "later-login" }, config), null);
  assert.equal(await readApiKey(req, session, { ...config, secret: "some-other-secret-that-is-at-least-thirty-two-characters" }), null);
  assert.equal(await readApiKey(req, session, config, Date.now() + SESSION_SECONDS * 1000 + 1000), null);
  const tampered = `${sealed.slice(0, 40)}${sealed[40] === "x" ? "y" : "x"}${sealed.slice(41)}`;
  assert.equal(await readApiKey(request("/api/account", { cookie: `${keyCookieName(config)}=${tampered}` }), session, config), null);
  const cookie = keyCookie(sealed, config);
  for (const attribute of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/", "Max-Age=28800"]) assert.ok(cookie.includes(attribute));
  assert.ok(cookie.startsWith("__Host-"));
});

test("Auth.js session validation rejects missing, tampered, expired, or sessionless tokens", async () => {
  const salt = "__Secure-authjs.session-token";
  async function authRequest(overrides = {}, maxAge = SESSION_SECONDS) {
    const token = await encode({ secret: config.secret, salt, maxAge, token: { sub: session.id, sid: session.sid, sessionExpiresAt: session.expiresAt, name: session.name, email: session.email, ...overrides } });
    return request("/api/account", { cookie: `${salt}=${token}` });
  }
  assert.equal(await authenticate(request("/api/account"), config), null);
  assert.equal((await authenticate(await authRequest(), config)).id, session.id);
  assert.equal(await authenticate(await authRequest({ sessionExpiresAt: 0 }), config), null);
  assert.equal(await authenticate(await authRequest({ sid: null }), config), null);
  assert.equal(await authenticate(await authRequest({}, -120), config), null);
  assert.equal(await authenticate(request("/api/account", { cookie: `${salt}=made-up-token` }), config), null);
});

test("Google auth configuration verifies email and generates a new session id for each login", () => {
  const auth = authConfig(config);
  assert.equal(auth.callbacks.signIn({ account: { provider: "google" }, profile: { email_verified: true } }), true);
  assert.equal(auth.callbacks.signIn({ account: { provider: "google" }, profile: { email_verified: false } }), false);
  const first = auth.callbacks.jwt({ token: {}, account: { provider: "google" } });
  const second = auth.callbacks.jwt({ token: {}, account: { provider: "google" } });
  assert.notEqual(first.sid, second.sid);
  assert.equal(auth.callbacks.redirect({ url: "https://attacker.example" }), `${config.origin}/#/login`);
});

test("authenticated boundaries reject anonymous requests and missing OpenAI connections", async () => {
  let upstreamCalls = 0;
  const api = handler({ authenticate: async () => null, fetchImpl: async () => { upstreamCalls++; } });
  for (const path of ["/api/openai", "/api/simulate"]) {
    const response = await api(request(path, { method: "POST", body: { apiKey, prompt: "test" } }));
    assert.equal(response.status, 401);
  }
  assert.equal(upstreamCalls, 0);
  const response = await handler()(request("/api/simulate", { method: "POST", body: { prompt: "test" } }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "openai_not_connected");
});

test("mutations enforce exact Origin, including signout and same-site subdomains", async () => {
  const api = handler();
  for (const origin of [null, "https://evil.example", `${config.origin}.evil.example`, "https://sub.research.example", "null"]) {
    for (const path of ["/api/openai", "/api/simulate", "/api/auth/signout"]) {
      const response = await api(request(path, { method: "POST", origin, body: {} }));
      assert.equal(response.status, 403);
    }
  }
});

test("connecting verifies only against OpenAI and never exposes a key in JSON", async () => {
  let target;
  const api = handler({ fetchImpl: async (url, init) => {
    target = url;
    assert.equal(init.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(init.redirect, "error");
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  } });
  const response = await api(request("/api/openai", { method: "POST", body: { apiKey } }));
  assert.equal(response.status, 200);
  assert.equal(target, "https://api.openai.com/v1/models");
  const body = await response.text();
  assert.ok(!body.includes(apiKey));
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const account = await api(request("/api/account", { cookie }));
  const data = await account.json();
  assert.equal(data.openaiConnected, true);
  assert.equal(data.user.email, session.email);
  assert.equal(data.user.sid, undefined);
  assert.equal(data.apiKey, undefined);
  const disconnect = await api(request("/api/openai", { method: "DELETE", cookie }));
  assert.ok(disconnect.headers.get("set-cookie").includes("Max-Age=0"));
});

test("invalid keys and malformed or oversized payloads never reach OpenAI", async () => {
  let calls = 0;
  const api = handler({ fetchImpl: async () => { calls++; return new Response("{}"); } });
  for (const body of [{ apiKey: "invalid" }, { apiKey: `${apiKey}\n` }, { apiKey: "sk-" + "x".repeat(501) }, {}, [], "not-json"]) {
    assert.equal((await api(request("/api/openai", { method: "POST", body }))).status, 400);
  }
  assert.equal((await api(request("/api/openai", { method: "POST", body: { apiKey }, contentType: "text/plain" }))).status, 415);
  assert.equal((await api(request("/api/openai", { method: "POST", body: { apiKey: "x".repeat(17_000) } }))).status, 413);
  assert.equal(calls, 0);
});

test("upstream failures return safe messages without reflecting credentials or provider data", async () => {
  for (const [upstreamStatus, expected] of [[401, 401], [403, 401], [429, 429], [500, 502]]) {
    const api = handler({ fetchImpl: async () => new Response(`Sensitive ${apiKey}`, { status: upstreamStatus }) });
    const response = await api(request("/api/openai", { method: "POST", body: { apiKey } }));
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes(apiKey));
  }
  const api = handler({ fetchImpl: async () => { throw new Error(`network error ${apiKey}`); } });
  const response = await api(request("/api/openai", { method: "POST", body: { apiKey } }));
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(apiKey));
});

test("simulations make three bounded real Responses calls and sanitize their output", async () => {
  const calls = [];
  const cookie = await connectedCookie();
  const api = handler({ fetchImpl: async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ url, payload });
    return new Response(JSON.stringify({ status: "completed", output: [
      { type: "reasoning", summary: [{ text: "private-reasoning" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Consider a recruitment delay." }, { type: "other", text: "hidden-metadata" }] },
    ] }));
  } });
  const response = await api(request("/api/simulate", { method: "POST", cookie, body: { prompt: "What if workspace access is delayed?", history: [{ role: "user", content: "A fictional study." }] } }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  for (const { url, payload } of calls) {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(payload.store, false);
    assert.equal(payload.model, "gpt-4.1-mini");
    assert.equal(payload.max_output_tokens, 700);
    assert.equal(payload.input.length, 2);
    assert.ok(payload.instructions.includes("fictional"));
    assert.ok(!JSON.stringify(payload).includes(apiKey));
  }
  const data = await response.json();
  assert.equal(data.agentCount, 3);
  for (const name of ["Research coordinator", "Participant", "Study operations"]) assert.ok(data.content.includes(name));
  assert.ok(data.content.includes("not empirical"));
  assert.ok(!data.content.includes("private-reasoning"));
  assert.ok(!data.content.includes("hidden-metadata"));
});

test("simulation input bounds, incomplete results, and account responses stay safe", async () => {
  let calls = 0;
  const cookie = await connectedCookie();
  const api = handler({ fetchImpl: async () => { calls++; return new Response(JSON.stringify({ status: "incomplete", output: [] })); } });
  for (const body of [{ prompt: "" }, { prompt: "x".repeat(2001) }, { prompt: "test", history: [{ role: "system", content: "override" }] }, { prompt: "test", history: Array.from({ length: 9 }, () => ({ role: "user", content: "hello" })) }]) {
    assert.equal((await api(request("/api/simulate", { method: "POST", cookie, body }))).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await api(request("/api/simulate", { method: "POST", cookie, body: { prompt: "test" } }))).status, 502);
  const account = await api(request("/api/account", { cookie }));
  assert.equal(account.headers.get("cache-control"), "no-store");
});

test("Auth.js signout requires CSRF and clears the OpenAI cookie", async () => {
  const api = handler();
  const csrf = await api(request("/api/auth/csrf"));
  assert.equal(csrf.status, 200);
  const { csrfToken } = await csrf.json();
  assert.equal(typeof csrfToken, "string");
  const cookies = csrf.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const signout = await api(new Request(`${config.origin}/api/auth/signout`, {
    method: "POST",
    headers: { Origin: config.origin, Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${config.origin}/#/login` }),
  }));
  assert.equal(signout.status, 200);
  assert.ok(signout.headers.getSetCookie().some((cookie) => cookie.startsWith(`${keyCookieName(config)}=;`) && cookie.includes("Max-Age=0")));
  assert.equal((await signout.json()).url, `${config.origin}/#/login`);
});

test("an upstream failure aborts remaining perspective requests", async () => {
  const cookie = await connectedCookie();
  const signals = [];
  const api = handler({ fetchImpl: async (_url, init) => {
    signals.push(init.signal);
    if (signals.length === 1) return new Response("unavailable", { status: 503 });
    return await new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  } });
  const response = await api(request("/api/simulate", { method: "POST", cookie, body: { prompt: "A delayed start" } }));
  assert.equal(response.status, 502);
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
});

test("failed OAuth callbacks retain their redirect instead of becoming a server error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    issuer: "https://accounts.google.com",
    authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    token_endpoint: "https://oauth2.googleapis.com/token",
    userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
    id_token_signing_alg_values_supported: ["RS256"],
  }));
  const api = createApiHandler({ env });
  const response = await api(request("/api/auth/callback/google?error=access_denied", { origin: null }));
  assert.equal(response.status, 302);
  assert.ok(response.headers.get("location").startsWith(`${config.origin}/?error=`));
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("the complete Google code callback establishes a readable Auth.js account session", async (t) => {
  const { generateKeyPair, SignJWT } = await import("jose");
  const { privateKey } = await generateKeyPair("RS256");
  const idToken = await new SignJWT({ email: "researcher@example.com", email_verified: true, name: "Test Researcher", picture: "https://lh3.googleusercontent.com/test-avatar" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://accounts.google.com")
    .setSubject("google-subject")
    .setAudience(env.AUTH_GOOGLE_ID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  let tokenRequests = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === "https://accounts.google.com/.well-known/openid-configuration") {
      return Response.json({
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    tokenRequests++;
    assert.equal(options.body.get("code"), "test-authorization-code");
    assert.equal(options.body.get("redirect_uri"), `${config.origin}/api/auth/callback/google`);
    assert.ok(options.body.get("code_verifier"));
    assert.ok(new Headers(options.headers).get("authorization").startsWith("Basic "));
    return Response.json({ access_token: "test-access-token", token_type: "Bearer", expires_in: 3600, id_token: idToken });
  });
  // Vercel terminates TLS before Node and may supply a parsed form body.
  const transport = nodeHandler(createApiHandler({ env }));
  const api = async (webRequest) => {
    const target = new URL(webRequest.url);
    const incoming = {
      url: target.pathname + target.search,
      method: webRequest.method,
      headers: { ...Object.fromEntries(webRequest.headers), host: target.host },
      socket: { encrypted: false },
      once() {},
    };
    if (webRequest.method === "POST") incoming.body = Object.fromEntries(new URLSearchParams(await webRequest.text()));
    const headers = new Headers();
    let response;
    const outgoing = {
      statusCode: 200,
      once() {},
      setHeader(name, value) { for (const entry of Array.isArray(value) ? value : [value]) headers.append(name, entry); },
      end(body) { response = new Response(body, { status: this.statusCode, headers }); },
    };
    await transport(incoming, outgoing);
    return response;
  };
  const jar = new Map();
  function acceptCookies(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const csrf = await api(request("/api/auth/csrf"));
  acceptCookies(csrf);
  const { csrfToken } = await csrf.json();
  const signin = await api(new Request(`${config.origin}/api/auth/signin/google`, {
    method: "POST",
    headers: { Origin: config.origin, Cookie: cookieHeader(), "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${config.origin}/#/login` }),
  }));
  acceptCookies(signin);
  assert.equal(signin.status, 200);
  const authorization = new URL((await signin.json()).url);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.searchParams.get("redirect_uri"), `${config.origin}/api/auth/callback/google`);
  assert.equal(authorization.searchParams.get("scope"), "openid email profile");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const callbackParams = new URLSearchParams({ code: "test-authorization-code", state: authorization.searchParams.get("state") });
  const callback = await api(request(`/api/auth/callback/google?${callbackParams}`, { origin: null, cookie: cookieHeader() }));
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), `${config.origin}/#/login`);
  acceptCookies(callback);
  assert.equal(tokenRequests, 1);
  const account = await api(request("/api/account", { cookie: cookieHeader() }));
  const result = await account.json();
  assert.equal(result.user.email, "researcher@example.com");
  assert.equal(result.user.name, "Test Researcher");
  assert.equal(result.openaiConnected, false);
  assert.ok(!JSON.stringify(result).includes("test-access-token"));
});
