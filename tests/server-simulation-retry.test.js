import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../server/handlers.js';
import { compositeInstitution } from '../server/institutions.js';
import {
  SESSION_SECONDS, settings, sealApiKey, keyCookieName,
  sealAnthropicConnection, anthropicKeyCookieName, sealInstitutionProfile,
} from '../server/security.js';

const env = { AUTH_URL: 'https://research.example', AUTH_SECRET: 'test-only-secret-with-more-than-thirty-two-characters', AUTH_GOOGLE_ID: 'test-client', AUTH_GOOGLE_SECRET: 'test-secret' };
const config = settings(env);
const session = { id: 'retry-researcher', sid: 'retry-login', expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
const university = { id: 'uc-san-diego', name: 'University of California, San Diego' };
const keys = { openai: `sk-${'a'.repeat(40)}`, anthropic: `sk-ant-${'b'.repeat(50)}` };
const workspaceId = `wrkspc_${'c'.repeat(24)}`;
const privateMarker = 'PRIVATE-PROVIDER-DETAIL-MUST-NOT-REACH-CLIENT';

function complete(provider) {
  return provider === 'anthropic'
    ? { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ask how consent and research data are protected.' }] }
    : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Ask how consent and research data are protected.' }] }] };
}
function limited(provider) {
  return provider === 'anthropic'
    ? { ...complete(provider), stop_reason: 'max_tokens' }
    : { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] };
}
async function run(provider, fetchImpl) {
  const sealed = provider === 'anthropic'
    ? await sealAnthropicConnection({ apiKey: keys.anthropic, workspaceId }, session, config)
    : await sealApiKey(keys.openai, session, config);
  const context = {
    overview: 'Review a fictional community sleep research study.',
    transcript: 'The researcher wants to examine consent and recruitment.',
    documents: Array.from({ length: 9 }, (_, index) => ({ id: `doc-${index}`, name: `Study-${index}.md`, kind: 'markdown', text: `# Study section ${index}\nUnique source content ${index}.\n${'Context. '.repeat(100)}` })),
    university,
    institutionToken: await sealInstitutionProfile(compositeInstitution(university), session, config),
  };
  const handler = createApiHandler({ env, authenticate: async () => session, fetchImpl });
  const response = await handler(new Request(`${config.origin}/api/simulate`, {
    method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', Cookie: `${provider === 'anthropic' ? anthropicKeyCookieName(config) : keyCookieName(config)}=${sealed}` },
    body: JSON.stringify({ provider, prompt: 'Review the supplied research study.', context }),
  }));
  return { response, result: await response.json(), context };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: only the token-limited reviewer retries and retains all nine documents`, async () => {
    const calls = [];
    const { response, result, context } = await run(provider, async (url, init) => {
      const payload = JSON.parse(init.body);
      calls.push({ url, headers: init.headers, payload });
      return Response.json(calls.length === 1 ? limited(provider) : complete(provider));
    });
    assert.equal(response.status, 200);
    assert.equal(result.agentCount, 3);
    assert.equal(calls.length, 4);
    const budget = provider === 'anthropic' ? 'max_tokens' : 'max_output_tokens';
    assert.deepEqual(calls.map(call => call.payload[budget]).sort((a, b) => a - b), [2000, 2000, 2000, 4000]);
    const original = calls[0];
    const retry = calls.find(call => call.payload[budget] === 4000);
    assert.deepEqual(retry.payload, { ...original.payload, [budget]: 4000 });
    assert.deepEqual(retry.headers, original.headers);
    assert.equal(retry.url, original.url);
    const input = provider === 'anthropic' ? 'messages' : 'input';
    for (const call of calls) {
      const supplied = JSON.parse(call.payload[input][0].content);
      assert.deepEqual(supplied.documents, context.documents);
      assert.equal(supplied.transcript, context.transcript);
      assert.equal(supplied.university.id, university.id);
      assert.equal(supplied.institution.reviewers.length, 3);
      if (provider === 'anthropic') {
        assert.equal(call.headers['x-api-key'], keys.anthropic);
        assert.equal(call.headers['anthropic-workspace-id'], workspaceId);
      } else assert.equal(call.headers.Authorization, `Bearer ${keys.openai}`);
    }
    assert.ok(!JSON.stringify(result).includes(keys[provider]));
  });

  test(`${provider}: exhausted output retries are bounded and return a specific safe error`, async () => {
    const calls = [];
    const { response, result } = await run(provider, async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json({ ...limited(provider), privateDetail: privateMarker });
    });
    assert.equal(response.status, 502);
    assert.equal(result.code, `${provider}_output_limit`);
    assert.equal(calls.length, 6);
    assert.equal(calls.filter(call => (call.max_tokens ?? call.max_output_tokens) === 4000).length, 3);
    assert.match(result.error, /documents are saved/);
    assert.ok(!JSON.stringify(result).includes(privateMarker));
    assert.ok(!JSON.stringify(result).includes(keys[provider]));
  });
}

for (const [name, data, code] of [
  ['content filtering', { status: 'incomplete', incomplete_details: { reason: 'content_filter' } }, 'openai_filtered'],
  ['unknown incomplete reason', { status: 'incomplete', incomplete_details: { reason: 'unknown' } }, 'openai_incomplete'],
]) {
  test(`OpenAI: ${name} does not trigger an output retry or expose provider detail`, async () => {
    const calls = [];
    const { response, result } = await run('openai', async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json({ ...data, output: [{ privateDetail: privateMarker }] });
    });
    assert.equal(response.status, 502);
    assert.equal(result.code, code);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.max_output_tokens === 2000));
    assert.ok(!JSON.stringify(result).includes(privateMarker));
  });
}

test('OpenAI: permission errors do not trigger an output retry or expose credentials', async () => {
  const calls = [];
  const { response, result } = await run('openai', async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ error: { code: 'insufficient_permissions', message: `${privateMarker} ${keys.openai}` } }, { status: 403 });
  });
  assert.equal(response.status, 403);
  assert.equal(result.code, 'openai_permission_denied');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.max_output_tokens === 2000));
  assert.ok(!JSON.stringify(result).includes(privateMarker));
  assert.ok(!JSON.stringify(result).includes(keys.openai));
});
