import test from 'node:test'
import assert from 'node:assert/strict'
import { LlmError, analyzeScenario, buildUserMessage, listModels, moderate, parseAnalysis, RESPONSE_SCHEMA } from '../src/lib/llm.js'
import { analysisKey, canonicalJson, createRecord, recordsToCsv, verifyRecord } from '../src/lib/records.js'

const AGENT_IDS = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const goodAnalysis = {
  in_scope: true,
  scope_reason: 'ok',
  agents: AGENT_IDS.map((id, index) => ({ id, stance: index % 5, confidence: 0.6, rationale: `reason ${id}` })),
  assumptions: ['clinic opens within a year'],
  caveats: ['no local survey data'],
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function queue(...responses) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { fetchImpl, calls }
}

test('schema is strict and enumerates exactly the 11 scored agents', () => {
  assert.equal(RESPONSE_SCHEMA.strict, true)
  assert.deepEqual(RESPONSE_SCHEMA.schema.properties.agents.items.properties.id.enum, AGENT_IDS)
  const message = JSON.parse(buildUserMessage('clinic hours'))
  assert.equal(message.scenario, 'clinic hours')
  assert.equal(message.stakeholders.length, 11)
})

test('parseAnalysis normalizes valid output and fails closed on bad output', () => {
  const parsed = parseAnalysis(JSON.stringify(goodAnalysis))
  assert.equal(parsed.inScope, true)
  assert.equal(Object.keys(parsed.stances).length, 11)
  assert.deepEqual(parsed.stances['02'], { score: 0, confidence: 0.6, rationale: 'reason 02' })
  assert.deepEqual(parseAnalysis({ in_scope: false, scope_reason: 'controversial', agents: [] }), { inScope: false, reason: 'controversial' })
  assert.throws(() => parseAnalysis('{oops'), (error) => error.code === 'invalid_response')
  assert.throws(() => parseAnalysis({ in_scope: true, agents: [{ id: '02', stance: 9 }] }), (error) => error.code === 'invalid_response')
  const injected = parseAnalysis({ ...goodAnalysis, agents: [...goodAnalysis.agents, { id: '99', stance: 1, confidence: 1, rationale: 'x' }] })
  assert.equal(injected.stances['99'], undefined, 'unknown agents are dropped')
})

test('analyzeScenario sends the key only to OpenAI and records provenance', async () => {
  const { fetchImpl, calls } = queue(jsonResponse(200, { model: 'gpt-x-2026', system_fingerprint: 'fp_1', usage: { prompt_tokens: 900, completion_tokens: 400 }, choices: [{ message: { content: JSON.stringify(goodAnalysis) } }] }))
  let clock = 0
  const result = await analyzeScenario({ apiKey: 'sk-test', model: 'gpt-x', prompt: 'clinic hours', fetchImpl, now: () => (clock += 500) })
  assert.match(calls[0].url, /^https:\/\/api\.openai\.com\/v1\/chat\/completions$/)
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-test')
  assert.equal(calls[0].body.temperature, 0)
  assert.equal(calls[0].body.response_format.type, 'json_schema')
  assert.equal(result.provenance.model, 'gpt-x-2026')
  assert.equal(result.provenance.systemFingerprint, 'fp_1')
  assert.equal(result.provenance.latencyMs, 500)
  assert.equal(result.analysis.inScope, true)
})

test('analyzeScenario retries without sampling params when a model rejects them', async () => {
  const { fetchImpl, calls } = queue(
    jsonResponse(400, { error: { message: "Unsupported parameter: 'temperature' is not supported with this model." } }),
    jsonResponse(200, { model: 'o-x', choices: [{ message: { content: JSON.stringify(goodAnalysis) } }] }),
  )
  const result = await analyzeScenario({ apiKey: 'k', model: 'o-x', prompt: 'clinic', fetchImpl })
  assert.equal(calls.length, 2)
  assert.equal('temperature' in calls[1].body, false)
  assert.equal(result.provenance.temperature, null)
})

test('requests retry on 429/5xx and surface typed errors', async () => {
  const flaky = queue(jsonResponse(503, {}), jsonResponse(200, { results: [{ flagged: false, categories: {} }] }))
  assert.deepEqual(await moderate('k', 'text', { fetchImpl: flaky.fetchImpl }), [])
  assert.equal(flaky.calls.length, 2)

  const unauthorized = queue(jsonResponse(401, {}))
  await assert.rejects(listModels('bad', { fetchImpl: unauthorized.fetchImpl }), (error) => error instanceof LlmError && error.code === 'auth')

  const refused = queue(jsonResponse(200, { choices: [{ message: { refusal: 'no' } }] }))
  await assert.rejects(analyzeScenario({ apiKey: 'k', model: 'm', prompt: 'p', fetchImpl: refused.fetchImpl }), (error) => error.code === 'refused')
})

test('moderate returns flagged categories', async () => {
  const { fetchImpl } = queue(jsonResponse(200, { results: [{ flagged: true, categories: { violence: true, hate: false } }] }))
  assert.deepEqual(await moderate('k', 'x', { fetchImpl }), ['violence'])
})

test('listModels filters to chat models and puts preferred ones first', async () => {
  const { fetchImpl } = queue(jsonResponse(200, { data: [{ id: 'whisper-1' }, { id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'gpt-4o-realtime-preview' }, { id: 'o3' }] }))
  assert.deepEqual(await listModels('k', { fetchImpl }), ['gpt-4o-mini', 'gpt-4o', 'o3'])
})

test('records are fingerprinted, tamper-evident and cache keys are stable', async () => {
  const record = await createRecord({
    runId: 'r1', sessionId: 's1', sessionTitle: 'Clinic', prompt: 'clinic hours', mode: 'openai',
    guardrails: { local: 'pass', moderation: 'pass', scope: 'pass' },
    analysis: parseAnalysis(goodAnalysis), provenance: { model: 'm', temperature: 0, seed: 7, promptVersion: 'v1', latencyMs: 10 },
    createdAt: '2026-10-03T00:00:00.000Z',
  })
  assert.match(record.fingerprint, /^[0-9a-f]{64}$/)
  assert.equal(await verifyRecord(record), true)
  assert.equal(await verifyRecord({ ...record, prompt: 'edited' }), false)
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}')
  const key = (prompt) => analysisKey({ prompt, model: 'm', temperature: 0, seed: 7, promptVersion: 'v1' })
  assert.equal(await key('Clinic Hours '), await key('clinic hours'))
  assert.notEqual(await key('clinic hours'), await key('pharmacy hours'))
})

test('CSV export is long-format and safe against formula injection', async () => {
  const record = await createRecord({
    runId: 'r1', sessionId: 's1', sessionTitle: '=HYPERLINK("x")', prompt: 'a, "quoted"\nprompt', mode: 'openai',
    guardrails: {}, analysis: parseAnalysis(goodAnalysis), provenance: { model: 'm' },
  })
  const lines = recordsToCsv([record]).split('\n')
  assert.match(lines[0], /^created_at,session_title,run_id/)
  const csv = recordsToCsv([record])
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula neutralized and quoted')
  assert.ok(csv.includes('"a, ""quoted""\nprompt"'))
  assert.equal(csv.split('\n').filter((line) => line.includes(',r1,')).length, 11)
})
