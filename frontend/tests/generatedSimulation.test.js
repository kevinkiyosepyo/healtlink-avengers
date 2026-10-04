import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { agentBatch, reviewAgents, validateAgentReviews } from '../../shared/reviewAgents.js'
import { normalizeSimulationContext } from '../src/lib/simulationContext.js'
import { createWorkspaceController } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport, createScopedSimulationWorkspace } from '../src/composables/useSimulationWorkspace.js'
import { createGeneratedSimulationGraph } from '../src/lib/generatedSimulationGraph.js'
import { settleLayout } from '../src/lib/simulationGraph.js'

const context = count => ({ agentCount: count, overview: 'A fictional sleep study.', documents: [{ id: 'protocol', name: 'Protocol.md', kind: 'markdown', text: 'Consent is required.' }] })
const reviews = batch => agentBatch(batch).map(agent => ({ agentId: agent.id, summary: 'Check the consent process described in Protocol.md.', questions: ['How will comprehension be checked?'], topics: ['consent'], sourceIds: ['protocol'] }))
const result = (batch, provider = 'openai') => ({ reviews: reviews(batch), offset: batch.offset, agentCount: batch.total, provider, model: 'mock-model' })
const drain = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  let id = 0
  const saved = new Map()
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const options = { storage, now: () => 1000000, id: () => `graph-${++id}` }
  const controller = createWorkspaceController(options)
  const session = controller.createSession({ title: 'Study', context: context(50) })
  return { controller, session, storage, reload: () => createWorkspaceController(options) }
}

test('50 and 300 agents have unique roles/lenses; invalid counts and batches fail before generation', () => {
  for (const count of [50, 300]) {
    const agents = reviewAgents(count)
    assert.equal(agents.length, count)
    assert.equal(new Set(agents.map(agent => agent.label)).size, count)
    assert.equal(normalizeSimulationContext(context(count)).agentCount, count)
    assert.equal(agentBatch({ total: count, offset: count - 10 }).length, 10)
  }
  for (const count of [0, 49, 51, 301, '50', NaN]) assert.throws(() => normalizeSimulationContext(context(count)))
  for (const offset of [-10, 1, 50]) assert.throws(() => agentBatch({ total: 50, offset }))
})

test('review validation rejects invented source IDs, duplicate agents, missing agents and unknown topics', () => {
  const batch = { total: 50, offset: 0 }, agents = agentBatch(batch), good = reviews(batch)
  assert.equal(validateAgentReviews(good, agents, ['protocol']).length, 10)
  for (const broken of [good.slice(1), [...good.slice(1), good[1]], [{ ...good[0], sourceIds: ['fabricated'] }, ...good.slice(1)], [{ ...good[0], topics: ['approval'] }, ...good.slice(1)]]) {
    assert.throws(() => validateAgentReviews(broken, agents, ['protocol']))
  }
  assert.equal(validateAgentReviews([{ ...good[0], sourceIds: [] }, ...good.slice(1)], agents, ['protocol'])[0].sourceIds.length, 0)
})

test('queued graph has no findings; generated references and topics appear without changing stable agent IDs', () => {
  const run = { id: 'run', prompt: 'Review consent', status: 'running', agentCount: 300, agentReviews: [], sources: context(300).documents }
  const queued = createGeneratedSimulationGraph(run, null, 'Study')
  assert.equal(queued.nodes.filter(node => node.type === 'queued').length, 300)
  assert.equal(queued.nodes.filter(node => node.type === 'topic').length, 0)
  assert.equal(queued.links.filter(link => link.label === 'Cites supplied document').length, 0)
  run.agentReviews = reviews({ total: 300, offset: 0 })
  const generated = createGeneratedSimulationGraph(run, null, 'Study')
  assert.equal(generated.nodes.filter(node => node.type === 'agent').length, 10)
  assert.equal(generated.nodes.filter(node => node.type === 'queued').length, 290)
  assert.equal(generated.links.filter(link => link.label === 'Cites supplied document').length, 10)
  assert.equal(generated.links.filter(link => link.label === 'Raises review topic').length, 10)
  const old = new Map(queued.nodes.map(node => [node.id, node]))
  for (const node of generated.nodes.filter(node => node.id.startsWith('agent-'))) assert.deepEqual([node.x, node.y], [old.get(node.id).x, old.get(node.id).y])
  const ids = new Set(generated.nodes.map(node => node.id))
  assert(generated.links.every(link => ids.has(link.source) && ids.has(link.target)))
  settleLayout(generated.nodes, generated.links, 20)
  assert(generated.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)))
})

test('legacy response map exposes saved AI text without inventing per-agent reviews or citation edges', () => {
  const graph = createGeneratedSimulationGraph({ id: 'legacy', prompt: 'Review', agentCount: 3, status: 'completed' }, context(50), 'Study', 'The actual saved model response.')
  assert.equal(graph.nodes.find(node => node.id === 'ai-response').description, 'The actual saved model response.')
  assert.equal(graph.nodes.filter(node => node.type === 'agent').length, 0)
  assert.equal(graph.links.filter(link => link.label === 'Cites supplied document').length, 0)
  const failed = createGeneratedSimulationGraph({ id: 'failed', prompt: 'Review', agentCount: 3, status: 'failed' }, null, 'Study', 'Client error, not model text.')
  assert.equal(failed.nodes.filter(node => node.type === 'response').length, 0)
  assert(!failed.nodes.some(node => node.description.includes('Client error')))
})

test('changing setup after a stopped run retains that run’s original source references', () => {
  const { controller, session, reload } = fixture()
  const run = controller.startRun(session.id, 'Review the study', { mode: 'openai' })
  controller.appendAgentReviews(session.id, run.id, reviews({ total: 50, offset: 0 }))
  controller.stopRun(session.id)
  const changed = context(300)
  changed.documents = [{ id: 'new-protocol', name: 'Revised.md', kind: 'markdown', text: 'A different study.' }]
  assert(controller.setSessionContext(session.id, changed))
  const recovered = reload().state.sessions.find(item => item.id === session.id)
  const graph = createGeneratedSimulationGraph(recovered.runs[0], recovered.context, recovered.title)
  assert(graph.nodes.some(node => node.id === 'document:protocol'))
  assert(!graph.nodes.some(node => node.id === 'document:new-protocol'))
  assert.equal(graph.links.filter(link => link.target === 'document:protocol' && link.label === 'Cites supplied document').length, 10)
  assert.equal(recovered.runs[0].agentCount, 50)
})

for (const provider of ['openai', 'anthropic']) test(`${provider}: 300 actual reviews finish in bounded batches and persist across reload`, async () => {
  const { controller, session, reload } = fixture()
  controller.setSessionContext(session.id, context(300))
  let active = 0, peak = 0
  const calls = []
  const transport = createOpenAIRunTransport(controller, { fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push(body)
    active++; peak = Math.max(peak, active)
    await drain(); active--
    return Response.json(result(body.agentBatch, provider))
  } })
  const run = provider === 'openai' ? transport.startOpenAIRun(session.id, 'Review the study') : transport.startAnthropicRun(session.id, 'Review the study')
  controller.createSession({ title: 'Other chat' })
  for (let tick = 0; tick < 40 && run.status === 'running'; tick++) await drain()
  assert.equal(peak, 2)
  assert.equal(calls.length, 30)
  assert.equal(run.status, 'completed')
  assert.equal(run.agentReviews.length, 300)
  assert.equal(run.progress, 100)
  assert.match(session.messages[1].content, /300 of 300/)
  assert(calls.every(call => call.context.documents[0].text === 'Consent is required.'))
  assert.equal(reload().state.sessions.find(item => item.id === session.id).runs[0].agentReviews.length, 300)
})

test('partial results survive a failure and reload; stop aborts queued work and rejects late results', async () => {
  const { controller, session, reload } = fixture()
  const calls = []
  const transport = createOpenAIRunTransport(controller, { fetchImpl: (url, options) => new Promise(resolve => calls.push({ body: JSON.parse(options.body), options, resolve })) })
  const run = transport.startOpenAIRun(session.id, 'Review the study')
  calls[0].resolve(Response.json(result(calls[0].body.agentBatch)))
  await drain()
  assert.equal(run.agentReviews.length, 10)
  assert.equal(run.progress, 20)
  assert.equal(reload().state.sessions.find(item => item.id === session.id).runs[0].agentReviews.length, 10)
  calls[1].resolve(Response.json({ error: 'Quota reached.' }, { status: 429 }))
  await drain()
  assert.equal(run.status, 'failed')
  assert.equal(run.agentReviews.length, 10)
  assert(calls[2].options.signal.aborted)
  calls[2].resolve(Response.json(result(calls[2].body.agentBatch)))
  await drain()
  assert.equal(run.agentReviews.length, 10)
  const retry = transport.startOpenAIRun(session.id, session.draft)
  assert(transport.stopRun(session.id))
  assert.equal(controller.appendAgentReviews(session.id, retry.id, reviews({ total: 50, offset: 0 })), false)
  assert.equal(retry.status, 'stopped')
  assert(calls.slice(3).every(call => call.options.signal.aborted))
  calls.slice(3).forEach(call => call.resolve(Response.json(result(call.body.agentBatch))))
  await drain()
  assert.equal(calls.length, 5)
  assert.equal(retry.agentReviews.length, 0)
})

test('switching account aborts both agent requests and cannot persist late results into the new account', async () => {
  const key = ref('first-account'), pending = []
  const saved = new Map(), storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const workspace = createScopedSimulationWorkspace({ storage, storageKey: key, windowTarget: null, documentTarget: null,
    fetchImpl: (url, options) => new Promise(resolve => pending.push({ options, resolve, body: JSON.parse(options.body) })),
  })
  const session = workspace.createSession({ context: context(50) })
  workspace.startOpenAIRun(session.id, 'First account private question')
  key.value = 'second-account'
  assert(pending.every(call => call.options.signal.aborted))
  pending.forEach(call => call.resolve(Response.json(result(call.body.agentBatch))))
  await drain()
  assert.equal(workspace.activeSession.value.runs.length, 0)
  assert(!JSON.stringify(workspace.sessions.value).includes('First account private question'))
  assert.equal(JSON.parse(saved.get('first-account')).sessions[0].runs[0].status, 'stopped')
  workspace.dispose()
})
