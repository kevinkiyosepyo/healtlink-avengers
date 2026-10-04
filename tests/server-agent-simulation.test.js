import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../server/handlers.js';
import { agentBatch } from '../shared/reviewAgents.js';
import { compositeInstitution } from '../server/institutions.js';
import { SESSION_SECONDS, settings, sealApiKey, keyCookieName, sealAnthropicConnection, anthropicKeyCookieName, sealInstitutionProfile } from '../server/security.js';

const env = { AUTH_URL: 'https://research.example', AUTH_SECRET: 'test-only-secret-with-more-than-thirty-two-characters', AUTH_GOOGLE_ID: 'test-client', AUTH_GOOGLE_SECRET: 'test-secret' };
const config = settings(env);
const session = { id: 'graph-researcher', sid: 'graph-login', expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
const university = { id: 'uc-san-diego', name: 'University of California, San Diego' };
const apiKey = `sk-${'a'.repeat(40)}`;
const anthropicKey = `sk-ant-${'b'.repeat(50)}`;
const workspaceId = `wrkspc_${'c'.repeat(24)}`;
const batch = { offset: 290, total: 300 };
const reviews = () => agentBatch(batch).map(agent => ({ agentId: agent.id, summary: 'The protocol needs a clear consent comprehension check.', questions: ['How will comprehension be checked?'], topics: ['consent'], sourceIds: ['doc-8'] }));
const reviewOutput = (entries = reviews()) => ({ reviews: Object.fromEntries(entries.map(({ agentId, ...review }) => [agentId, review])) });
const complete = (provider, text) => provider === 'anthropic'
  ? { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] }
  : { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] };

async function request(provider, fetchImpl, override = {}) {
  const sealed = provider === 'anthropic'
    ? await sealAnthropicConnection({ apiKey: anthropicKey, workspaceId }, session, config)
    : await sealApiKey(apiKey, session, config);
  const context = {
    agentCount: 300, overview: 'A fictional sleep study.', transcript: 'Review recruitment and consent.', university,
    documents: Array.from({ length: 9 }, (_, index) => ({ id: `doc-${index}`, name: `Study-${index}.md`, kind: 'markdown', text: `Unique study content ${index}.` })),
    institutionToken: await sealInstitutionProfile(compositeInstitution(university), session, config),
  };
  const handler = createApiHandler({ env, authenticate: async () => session, fetchImpl });
  const response = await handler(new Request(`${config.origin}/api/simulate`, {
    method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', Cookie: `${provider === 'anthropic' ? anthropicKeyCookieName(config) : keyCookieName(config)}=${sealed}` },
    body: JSON.stringify({ provider, prompt: 'Review the study', context, agentBatch: batch, ...override }),
  }));
  return { response, result: await response.json() };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: real agent reviews use all nine documents, fixed roles, signed context and the encrypted connection`, async () => {
    const calls = [];
    const { response, result } = await request(provider, async (url, init) => {
      calls.push({ url, init, payload: JSON.parse(init.body) });
      return Response.json(complete(provider, JSON.stringify(reviewOutput())));
    });
    assert.equal(response.status, 200);
    assert.equal(result.reviews.length, 10);
    assert.equal(result.reviews[0].agentId, 'agent-291');
    assert.equal(result.agentCount, 300);
    assert.equal(calls.length, 1);
    const call = calls[0], messages = provider === 'anthropic' ? call.payload.messages : call.payload.input;
    const supplied = JSON.parse(messages[0].content);
    assert.equal(supplied.documents.length, 9);
    assert.equal(supplied.institution.university.id, university.id);
    const instructions = provider === 'anthropic' ? call.payload.system : call.payload.instructions;
    assert.match(instructions, /agent-291/);
    assert.match(instructions, /doc-8/);
    assert.match(instructions, /never actual university board members/);
    assert(!JSON.stringify(call.payload).includes(apiKey));
    assert(!JSON.stringify(result).includes(apiKey));
    if (provider === 'openai') {
      assert.equal(call.payload.text.format.type, 'json_schema');
      assert.equal(call.payload.text.format.strict, true);
      const slots = call.payload.text.format.schema.properties.reviews;
      assert.equal(slots.type, 'object');
      assert.equal(slots.additionalProperties, false);
      assert.deepEqual(slots.required, agentBatch(batch).map(agent => agent.id));
      assert.deepEqual(Object.keys(slots.properties), slots.required);
      assert.deepEqual(slots.properties['agent-291'].properties.sourceIds.items.enum, Array.from({ length: 9 }, (_, index) => `doc-${index}`));
      assert.equal(call.init.headers.Authorization, `Bearer ${apiKey}`);
    } else {
      assert.equal(call.init.headers['anthropic-workspace-id'], workspaceId);
      assert.equal(call.init.headers['x-api-key'], anthropicKey);
    }
  });

  test(`${provider}: output-limited batch retries once without dropping context`, async () => {
    const calls = [];
    const { response, result } = await request(provider, async (url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json(calls.length === 1
        ? provider === 'anthropic' ? { type: 'message', role: 'assistant', stop_reason: 'max_tokens', content: [] }
          : { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }
        : complete(provider, JSON.stringify(reviewOutput())));
    });
    assert.equal(response.status, 200);
    assert.equal(result.reviews.length, 10);
    const limit = provider === 'anthropic' ? 'max_tokens' : 'max_output_tokens';
    assert.deepEqual(calls.map(call => call[limit]), [4000, 8000]);
    const messages = provider === 'anthropic' ? 'messages' : 'input';
    assert.deepEqual(calls[0][messages], calls[1][messages]);
  });

  test(`${provider}: malformed completed batches retry once with the full original study context`, async () => {
    const good = reviews();
    for (const invalid of [
      reviewOutput([{ ...good[0], sourceIds: ['Study-8.md'] }, ...good.slice(1)]),
      reviewOutput(good.slice(1)),
      reviewOutput([{ ...good[0], agentId: 'agent-unknown' }, ...good.slice(1)]),
      reviewOutput([{ ...good[0], topics: ['invented-topic'] }, ...good.slice(1)]),
      { reviews: good },
      null,
    ]) {
      const calls = [];
      const { response, result } = await request(provider, async (url, init) => {
        calls.push(JSON.parse(init.body));
        return Response.json(complete(provider, JSON.stringify(calls.length === 1 ? invalid : reviewOutput())));
      });
      assert.equal(response.status, 200);
      assert.equal(result.reviews.length, 10);
      assert.equal(calls.length, 2);
      const messages = provider === 'anthropic' ? 'messages' : 'input';
      assert.deepEqual(calls[0][messages], calls[1][messages]);
      assert.equal(JSON.parse(calls[1][messages][0].content).documents.length, 9);
      assert.match(provider === 'anthropic' ? calls[1].system : calls[1].instructions, /previous attempt failed format validation/);
      assert.deepEqual(result.reviews, good);
    }
  });
}

test('invented citations, missing agents, duplicate IDs and unreadable output fail closed with safe errors', async () => {
  const good = reviews();
  for (const text of [
    JSON.stringify(reviewOutput([{ ...good[0], sourceIds: ['not-supplied'] }, ...good.slice(1)])),
    JSON.stringify(reviewOutput(good.slice(1))),
    JSON.stringify(reviewOutput([good[1], ...good.slice(1)])),
    `invalid JSON containing ${apiKey}`,
  ]) {
    let calls = 0;
    const { response, result } = await request('openai', async () => {
      calls++;
      return Response.json(complete('openai', text));
    });
    assert.equal(response.status, 502);
    assert.equal(calls, 2);
    assert.equal(result.code, 'invalid_agent_reviews');
    assert(!JSON.stringify(result).includes(apiKey));
    assert.equal(result.reviews, undefined);
  }
});

test('a study without uploaded documents requires empty citations and never creates fake source IDs', async () => {
  let payload;
  const emptyReferences = reviews().map(review => ({ ...review, sourceIds: [] }));
  const { response, result } = await request('openai', async (url, init) => {
    payload = JSON.parse(init.body);
    return Response.json(complete('openai', JSON.stringify(reviewOutput(emptyReferences))));
  }, { context: { agentCount: 300, overview: 'A fictional study described in text only.', documents: [] } });
  assert.equal(response.status, 200);
  assert.equal(result.reviews.length, 10);
  const sourceIds = payload.text.format.schema.properties.reviews.properties['agent-291'].properties.sourceIds;
  assert.equal(sourceIds.maxItems, 0);
  assert.equal(sourceIds.items.enum, undefined);
  assert(result.reviews.every(review => review.sourceIds.length === 0));
});

test('invalid count, offset, count mismatch and forged institution token never reach a provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Must not reach the provider'); };
  for (const override of [
    { agentBatch: { total: 50, offset: 0 } },
    { agentBatch: { total: 300, offset: 300 } },
    { agentBatch: { total: 300, offset: 1 } },
    { context: { agentCount: 49 }, agentBatch: { total: 49, offset: 0 } },
    { context: { agentCount: 300, university, institutionToken: 'forged' } },
  ]) {
    const { response } = await request('openai', fetchImpl, override);
    assert([400, 409].includes(response.status));
  }
  assert.equal(calls, 0);
});
