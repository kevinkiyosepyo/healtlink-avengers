import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApiHandler } from "../server/handlers.js";
import { settings } from "../server/security.js";
import { chatgptSettings } from "../server/chatgpt.js";

const env = {
  AUTH_URL: "https://research.example",
  AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters",
  AUTH_OPENAI_ID: "oaiapp_microfish_test",
  AUTH_OPENAI_TOKEN_AUTH_METHOD: "none",
};
const issuer = "https://auth.openai.com";
const metadata = {
  issuer,
  authorization_endpoint: `${issuer}/api/accounts/authorize`,
  token_endpoint: `${issuer}/api/accounts/oauth/token`,
  jwks_uri: `${issuer}/.well-known/jwks.json`,
  id_token_signing_alg_values_supported: ["RS256"],
};

test("hosted ChatGPT sign-in requires its own registered client and explicit authentication method", async () => {
  assert.ok(settings(env));
  for (const id of ["dynamic_agent_client", "codex-client", "", undefined]) {
    assert.equal(chatgptSettings({ ...env, AUTH_OPENAI_ID: id }), null);
  }
  assert.equal(chatgptSettings({ ...env, AUTH_OPENAI_TOKEN_AUTH_METHOD: undefined }), null);
  assert.equal(chatgptSettings({ ...env, AUTH_OPENAI_TOKEN_AUTH_METHOD: "client_secret_basic" }), null);
  assert.equal(chatgptSettings({ ...env, AUTH_OPENAI_TOKEN_AUTH_METHOD: "client_secret_basic", AUTH_OPENAI_SECRET: "test-secret" }).method, "client_secret_basic");
  const googleEnv = { AUTH_URL: env.AUTH_URL, AUTH_SECRET: env.AUTH_SECRET, AUTH_GOOGLE_ID: "google-id", AUTH_GOOGLE_SECRET: "google-secret" };
  const api = createApiHandler({ env: googleEnv });
  const account = await (await api(new Request(`${env.AUTH_URL}/api/account`))).json();
  assert.deepEqual(account.providers, { google: true, chatgpt: false });
  const signin = await api(new Request(`${env.AUTH_URL}/api/auth/signin/chatgpt`, { method: "POST", headers: { Origin: env.AUTH_URL } }));
  assert.equal(signin.status, 503);
  assert.equal((await signin.json()).code, "chatgpt_not_configured");
});

async function flow(t, { method = "none", invalid = null, cancelled = false, badState = false } = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "microfish-test", alg: "RS256", use: "sig" };
  const api = createApiHandler({ env: { ...env, AUTH_OPENAI_TOKEN_AUTH_METHOD: method, AUTH_OPENAI_SECRET: method === "client_secret_basic" ? "test-secret" : undefined } });
  const jar = new Map();
  const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  function accept(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const i = pair.indexOf("=");
      if (/Max-Age=0/i.test(cookie)) jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async function request(path, options = {}) {
    const response = await api(new Request(`${env.AUTH_URL}${path}`, { ...options, headers: { Cookie: cookies(), Origin: env.AUTH_URL, ...options.headers } }));
    accept(response);
    return response;
  }
  let authorization;
  let tokenCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === `${issuer}/.well-known/openid-configuration`) return Response.json(metadata);
    if (String(url) === metadata.jwks_uri) return Response.json({ keys: [jwk] });
    assert.equal(String(url), metadata.token_endpoint);
    tokenCalls++;
    assert.equal(options.body.get("redirect_uri"), `${env.AUTH_URL}/api/auth/callback/chatgpt`);
    assert.equal(options.body.get("code"), "authorization-code");
    assert.ok(options.body.get("code_verifier"));
    assert.equal(options.body.get("client_secret"), null);
    if (method === "none") {
      assert.equal(options.body.get("client_id"), env.AUTH_OPENAI_ID);
      assert.equal(new Headers(options.headers).has("authorization"), false);
    } else {
      assert.equal(new Headers(options.headers).get("authorization"), `Basic ${Buffer.from(`${env.AUTH_OPENAI_ID}:test-secret`).toString("base64")}`);
    }
    let signingKey = privateKey;
    if (invalid === "signature") signingKey = (await generateKeyPair("RS256")).privateKey;
    const idToken = await new SignJWT({ name: "Test Researcher", email: "researcher@example.com", email_verified: true, nonce: invalid === "nonce" ? "wrong" : authorization.searchParams.get("nonce") })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(invalid === "issuer" ? "https://attacker.example" : issuer)
      .setSubject("openai-subject")
      .setAudience(invalid === "audience" ? "another-client" : env.AUTH_OPENAI_ID)
      .setIssuedAt()
      .setExpirationTime(invalid === "expiry" ? "-1h" : "5m")
      .sign(signingKey);
    // Identity-only OpenAI clients need not receive an access token.
    return Response.json({ id_token: idToken });
  });
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  assert.ok(csrfToken);
  const signin = await request("/api/auth/signin/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${env.AUTH_URL}/#/login` }),
  });
  authorization = new URL((await signin.json()).url);
  assert.equal(authorization.origin, issuer);
  assert.equal(authorization.searchParams.get("scope"), "openid profile email");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("state"));
  assert.ok(authorization.searchParams.get("nonce"));
  const params = new URLSearchParams({ state: badState ? "wrong-state" : authorization.searchParams.get("state"), ...(cancelled ? { error: "access_denied" } : { code: "authorization-code" }) });
  const callback = await request(`/api/auth/callback/chatgpt?${params}`);
  assert.equal(callback.status, 302);
  assert.ok(![...jar.keys()].some(key => /authjs\.(state|nonce|pkce)/.test(key)));
  const account = await (await request("/api/account")).json();
  assert.deepEqual(account.providers, { google: false, chatgpt: true });
  assert.equal(account.openaiConnected, false);
  assert.equal(account.chatgptPlanAvailable, false);
  assert.ok(!JSON.stringify(account).includes("identity-only-no-inference-permission"));
  if (invalid || cancelled || badState) {
    assert.equal(account.user, null);
    assert.ok(callback.headers.get("location").includes("error="));
    assert.equal(tokenCalls, cancelled || badState ? 0 : 1);
  } else {
    assert.equal(callback.headers.get("location"), `${env.AUTH_URL}/#/login`);
    assert.equal(account.user.provider, "chatgpt");
    assert.match(account.user.id, /^chatgpt:[a-f0-9]{64}$/);
    assert.equal(account.user.email, "researcher@example.com");
    const simulation = await request("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Plan our study" }) });
    assert.equal(simulation.status, 403);
    assert.equal((await simulation.json()).code, "openai_not_connected");
    const replay = await request(`/api/auth/callback/chatgpt?${params}`);
    assert.ok(replay.headers.get("location").includes("error="));
    assert.equal(tokenCalls, 1);
    const logoutCsrf = await (await request("/api/auth/csrf")).json();
    await request("/api/auth/signout", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken: logoutCsrf.csrfToken, callbackUrl: `${env.AUTH_URL}/#/login` }),
    });
    assert.equal((await (await request("/api/account")).json()).user, null);
  }
}

test("ChatGPT OIDC signs in without API credentials; identity alone cannot run simulations", async t => {
  await flow(t);
});
test("confidential ChatGPT clients send secrets only via HTTP Basic", async t => {
  await flow(t, { method: "client_secret_basic" });
});
for (const invalid of ["signature", "issuer", "audience", "expiry", "nonce"]) {
  test(`ChatGPT sign-in rejects an invalid ${invalid}`, async t => { await flow(t, { invalid }); });
}
test("a ChatGPT callback with the wrong state never exchanges the code", async t => { await flow(t, { badState: true }); });
test("cancelled ChatGPT consent leaves no signed-in user", async t => { await flow(t, { cancelled: true }); });
