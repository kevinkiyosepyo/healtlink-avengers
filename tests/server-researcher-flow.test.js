import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { encode } from '@auth/core/jwt';
import { authConfig } from '../server/auth.js';
import { createApiHandler } from '../server/handlers.js';
import { nodeHandler } from '../server/node.js';
import { settings, keyCookieName, anthropicKeyCookieName, SESSION_SECONDS } from '../server/security.js';

// All identities, secrets, keys, and provider generations below are synthetic.
// HTTP requests use a real local Node server. Google consent and billable API
// requests are not made; authentication uses Auth.js's actual JWT encryption.
const OPENAI_ALICE = `sk-proj-${'a'.repeat(48)}`;
const OPENAI_BOB = `sk-proj-${'b'.repeat(48)}`;
const ANTHROPIC_BOB = `sk-ant-api03-${'c'.repeat(48)}`;
const WORKSPACE_ID = `wrkspc_${'d'.repeat(24)}`;
const KEY_LABELS = new Map([[OPENAI_ALICE, 'Alice'], [OPENAI_BOB, 'Bob'], [ANTHROPIC_BOB, 'Bob']]);

function providerResponse(provider, text) {
  return Response.json(provider === 'openai'
    ? { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }
    : { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] });
}

async function httpHarness(t, { rejectKey } = {}) {
  const networkFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, init) => {
    assert.ok(String(url).startsWith('http://127.0.0.1:'), 'No external requests are allowed in this mocked integration test');
    return networkFetch(url, init);
  });
  let handler;
  const server = createServer((request, response) => handler(request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = {
    AUTH_URL: origin,
    AUTH_SECRET: 'synthetic-integration-secret-that-is-longer-than-thirty-two-characters',
    AUTH_GOOGLE_ID: 'synthetic-google-client-id',
    AUTH_GOOGLE_SECRET: 'synthetic-google-client-secret',
    OPENAI_MODEL: 'gpt-4.1-mini',
    ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
  };
  const config = settings(env);
  const calls = [];
  const fetchImpl = async (url, init) => {
    const provider = String(url).startsWith('https://api.openai.com/') ? 'openai' : 'anthropic';
    assert.equal(url, provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', 'Connection checks must verify generation permission, not Models access');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    const apiKey = provider === 'openai' ? headers.get('authorization')?.replace(/^Bearer /, '') : headers.get('x-api-key');
    assert.ok(KEY_LABELS.has(apiKey), 'Only the synthetic key belonging to this researcher may reach the provider');
    assert.equal(headers.get(provider === 'openai' ? 'x-api-key' : 'authorization'), null);
    if (provider === 'anthropic') assert.equal(headers.get('anthropic-version'), '2023-06-01');
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, provider === 'openai' ? config.model : config.anthropicModel);
    if (provider === 'openai') assert.equal(payload.store, false);
    assert.ok(!JSON.stringify(payload).includes(apiKey), 'API keys belong only in provider authentication headers');
    calls.push({ provider, apiKey, headers, payload });
    if (apiKey === rejectKey) return new Response(`Mock permission rejection; never return ${apiKey}`, { status: 403 });
    return providerResponse(provider, `Mocked ${provider} generation using ${KEY_LABELS.get(apiKey)}’s connection.`);
  };
  // No authenticate override: the production decoder reads actual JWT cookies.
  handler = nodeHandler(createApiHandler({ env, fetchImpl }));
  const sessionCookieName = 'authjs.session-token';

  function client() {
    const jar = new Map();
    return {
      jar,
      async request(path, { method = 'GET', body, headers: supplied = {} } = {}) {
        const headers = new Headers({ Origin: origin, 'Sec-Fetch-Site': 'same-origin', ...supplied });
        if (jar.size) headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
        if (body !== undefined) headers.set('Content-Type', body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json');
        const response = await networkFetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : body instanceof URLSearchParams ? body : JSON.stringify(body), redirect: 'manual' });
        const cookies = response.headers.getSetCookie();
        for (const cookie of cookies) {
          const [pair] = cookie.split(';');
          const separator = pair.indexOf('=');
          const name = pair.slice(0, separator);
          const value = pair.slice(separator + 1);
          if (/Max-Age=0(?:;|$)/.test(cookie)) jar.delete(name);
          else jar.set(name, value);
        }
        const text = await response.text();
        const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null;
        return { status: response.status, headers: response.headers, cookies, text, data };
      },
    };
  }

  async function login(browser, person, overrides = {}) {
    const auth = authConfig(config);
    const profile = { sub: person.id, name: person.name, email: person.email, email_verified: true };
    assert.equal(auth.callbacks.signIn({ account: { provider: 'google' }, profile }), true, 'A verified ordinary Gmail user needs no university membership');
    const token = auth.callbacks.jwt({ token: { sub: person.id, name: person.name, email: person.email }, account: { provider: 'google' } });
    browser.jar.set(sessionCookieName, await encode({ secret: config.secret, salt: sessionCookieName, maxAge: SESSION_SECONDS, token: { ...token, ...overrides } }));
    return token;
  }

  return { origin, config, calls, client, login, sessionCookieName };
}

const ALICE = { id: 'synthetic-google-alice', name: 'Alice Researcher', email: 'ordinary.researcher.alice@gmail.com' };
const BOB = { id: 'synthetic-google-bob', name: 'Bob Researcher', email: 'ordinary.researcher.bob@gmail.com' };

test('mocked HTTP flow: ordinary Gmail login, encrypted OpenAI connection, and simulation generation', async t => {
  const harness = await httpHarness(t);
  const browser = harness.client();
  const anonymous = await browser.request('/api/account');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.data.user, null);
  await harness.login(browser, ALICE);
  const signedIn = await browser.request('/api/account');
  assert.equal(signedIn.data.user.email, ALICE.email);
  assert.equal(signedIn.data.user.provider, 'google');
  assert.equal(signedIn.data.openaiConnected, false);
  assert.equal(harness.calls.length, 0);

  const connected = await browser.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_ALICE } });
  assert.equal(connected.status, 200, connected.text);
  assert.equal(connected.data.openaiConnected, true);
  assert.equal(harness.calls.length, 1, 'Connecting makes one minimal mocked generation request');
  assert.ok(harness.calls[0].payload.max_output_tokens > 0 && harness.calls[0].payload.max_output_tokens <= 32);
  assert.equal(connected.cookies.length, 1);
  assert.match(connected.cookies[0], /HttpOnly/);
  assert.match(connected.cookies[0], /SameSite=Lax/);
  assert.ok(!connected.cookies[0].includes(OPENAI_ALICE));
  assert.ok(!connected.text.includes(OPENAI_ALICE));
  assert.ok(browser.jar.get(keyCookieName(harness.config)).split('.').length === 5, 'Connected key is an encrypted JWE cookie');
  const ready = await browser.request('/api/account');
  assert.equal(ready.data.openaiConnected, true);
  assert.equal(ready.data.anthropicConnected, false);

  const prompt = 'What if the fictional onboarding packet is returned?';
  const result = await browser.request('/api/simulate', { method: 'POST', body: { provider: 'openai', prompt, history: [{ role: 'user', content: 'A fictional six-week rotation.' }] } });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.data.provider, 'openai');
  assert.equal(result.data.agentCount, 3);
  assert.equal(result.data.model, harness.config.model);
  assert.equal(harness.calls.length, 4);
  for (const call of harness.calls.slice(1)) {
    assert.equal(call.apiKey, OPENAI_ALICE);
    assert.equal(call.payload.max_output_tokens, 700);
    assert.deepEqual(call.payload.input.at(-1), { role: 'user', content: prompt });
  }
  for (const name of ['Research coordinator', 'Participant', 'Study operations']) assert.ok(result.data.content.includes(name));
  assert.match(result.data.content, /Mocked openai generation using Alice/);
  assert.ok(!result.text.includes(OPENAI_ALICE));
});

test('mocked HTTP flow: two Gmail researchers and both providers preserve identity and workspace isolation', async t => {
  const harness = await httpHarness(t);
  const alice = harness.client();
  const bob = harness.client();
  await harness.login(alice, ALICE);
  await harness.login(bob, BOB);
  assert.equal((await alice.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_ALICE } })).status, 200);
  assert.equal((await bob.request('/api/anthropic', { method: 'POST', body: { apiKey: ANTHROPIC_BOB, workspaceId: WORKSPACE_ID } })).status, 200);
  const anthropicCheck = harness.calls.find(call => call.provider === 'anthropic');
  assert.equal(anthropicCheck.headers.get('anthropic-workspace-id'), WORKSPACE_ID);
  assert.ok(anthropicCheck.payload.max_tokens > 0 && anthropicCheck.payload.max_tokens <= 32);
  const aliceState = (await alice.request('/api/account')).data;
  const bobState = (await bob.request('/api/account')).data;
  assert.equal(aliceState.user.email, ALICE.email);
  assert.equal(aliceState.openaiConnected, true);
  assert.equal(aliceState.anthropicConnected, false);
  assert.equal(bobState.user.email, BOB.email);
  assert.equal(bobState.openaiConnected, false);
  assert.equal(bobState.anthropicConnected, true);

  // Copy connection cookies across users while preserving each Google session.
  alice.jar.set(anthropicKeyCookieName(harness.config), bob.jar.get(anthropicKeyCookieName(harness.config)));
  bob.jar.set(keyCookieName(harness.config), alice.jar.get(keyCookieName(harness.config)));
  assert.equal((await alice.request('/api/account')).data.anthropicConnected, false);
  assert.equal((await bob.request('/api/account')).data.openaiConnected, false);
  const callsBeforeRejected = harness.calls.length;
  for (const [browser, provider] of [[alice, 'anthropic'], [bob, 'openai']]) {
    const rejected = await browser.request('/api/simulate', { method: 'POST', body: { provider, prompt: 'A fictional question.' } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.data.code, `${provider}_not_connected`);
  }
  assert.equal(harness.calls.length, callsBeforeRejected, 'Foreign connection cookies never trigger billed requests');

  const anthropicRun = await bob.request('/api/simulate', { method: 'POST', body: { provider: 'anthropic', prompt: 'Compare the fictional onboarding paths.' } });
  assert.equal(anthropicRun.status, 200, anthropicRun.text);
  assert.equal(anthropicRun.data.provider, 'anthropic');
  assert.equal(anthropicRun.data.agentCount, 3);
  assert.match(anthropicRun.data.content, /Mocked anthropic generation using Bob/);
  for (const call of harness.calls.slice(-3)) {
    assert.equal(call.provider, 'anthropic');
    assert.equal(call.apiKey, ANTHROPIC_BOB);
    assert.equal(call.headers.get('anthropic-workspace-id'), WORKSPACE_ID);
    assert.equal(call.payload.max_tokens, 700);
  }
  assert.equal((await bob.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_BOB } })).status, 200);
  const bobRun = await bob.request('/api/simulate', { method: 'POST', body: { prompt: 'Bob’s fictional scenario.' } });
  assert.equal(bobRun.status, 200);
  assert.match(bobRun.data.content, /using Bob/);
  assert.ok(harness.calls.slice(-3).every(call => call.apiKey === OPENAI_BOB));
  const aliceRun = await alice.request('/api/simulate', { method: 'POST', body: { prompt: 'Alice’s separate fictional scenario.' } });
  assert.equal(aliceRun.status, 200);
  assert.match(aliceRun.data.content, /using Alice/);
  assert.ok(harness.calls.slice(-3).every(call => call.apiKey === OPENAI_ALICE));
});

test('mocked HTTP flow: disconnect, new login, expiry, and sign-out invalidate provider connections', async t => {
  const harness = await httpHarness(t);
  const browser = harness.client();
  await harness.login(browser, BOB);
  await browser.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_BOB } });
  await browser.request('/api/anthropic', { method: 'POST', body: { apiKey: ANTHROPIC_BOB } });
  const disconnect = await browser.request('/api/openai', { method: 'DELETE' });
  assert.equal(disconnect.status, 200);
  assert.equal(browser.jar.has(keyCookieName(harness.config)), false);
  assert.equal((await browser.request('/api/account')).data.anthropicConnected, true);

  const oldAnthropicCookie = browser.jar.get(anthropicKeyCookieName(harness.config));
  await harness.login(browser, BOB);
  browser.jar.set(anthropicKeyCookieName(harness.config), oldAnthropicCookie);
  assert.equal((await browser.request('/api/account')).data.anthropicConnected, false, 'A key from an earlier login cannot follow a new session');
  const noKey = await browser.request('/api/simulate', { method: 'POST', body: { provider: 'anthropic', prompt: 'A fictional question.' } });
  assert.equal(noKey.data.code, 'anthropic_not_connected');

  await browser.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_BOB } });
  await browser.request('/api/anthropic', { method: 'POST', body: { apiKey: ANTHROPIC_BOB } });
  const callsBeforeSignout = harness.calls.length;
  const csrf = await browser.request('/api/auth/csrf');
  assert.equal(csrf.status, 200);
  const signedOut = await browser.request('/api/auth/signout', { method: 'POST', body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, callbackUrl: `${harness.origin}/#/login` }), headers: { 'X-Auth-Return-Redirect': '1' } });
  assert.equal(signedOut.status, 200, signedOut.text);
  assert.equal(browser.jar.has(keyCookieName(harness.config)), false);
  assert.equal(browser.jar.has(anthropicKeyCookieName(harness.config)), false);
  assert.equal((await browser.request('/api/account')).data.user, null);
  assert.equal(harness.calls.length, callsBeforeSignout);

  await harness.login(browser, ALICE, { sessionExpiresAt: Math.floor(Date.now() / 1000) - 1 });
  const expired = await browser.request('/api/account');
  assert.equal(expired.data.user, null);
  const cannotConnect = await browser.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_ALICE } });
  assert.equal(cannotConnect.status, 401);
  assert.equal(cannotConnect.data.code, 'sign_in_required');
  assert.equal(harness.calls.length, callsBeforeSignout);
});

test('mocked HTTP flow: failed generation permissions cannot create a ready connection', async t => {
  const harness = await httpHarness(t, { rejectKey: OPENAI_ALICE });
  const browser = harness.client();
  await harness.login(browser, ALICE);
  const rejected = await browser.request('/api/openai', { method: 'POST', body: { apiKey: OPENAI_ALICE } });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.data.code, 'openai_permission_denied');
  assert.equal(harness.calls.length, 1);
  assert.equal(browser.jar.has(keyCookieName(harness.config)), false);
  assert.equal((await browser.request('/api/account')).data.openaiConnected, false);
  assert.ok(!rejected.text.includes(OPENAI_ALICE));
});
