import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { agentBatch, reviewAgents, reviewSummary, validateAgentReviews } from '../../shared/reviewAgents.js'
import { normalizeSimulationContext } from '../src/lib/simulationContext.js'
import { createWorkspaceController } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport, createScopedSimulationWorkspace } from '../src/composables/useSimulationWorkspace.js'
import { createGeneratedSimulationGraph } from '../src/lib/generatedSimulationGraph.js'
import { settleLayout } from '../src/lib/simulationGraph.js'

const context = count => ({ agentCount: count, overview: 'A fictional sleep study.', documents: [{ id: 'protocol', name: 'Protocol.md', kind: 'markdown', text: 'Consent is required.' }] })
const reviews = batch => agentBatch(batch).map(agent => ({ agentId: agent.id, summary: 'Protocol.md requires consent but does not document a comprehension check, leaving understanding unverified.', nextSteps: ['Document a comprehension check before recruitment.'], questions: ['Who will document comprehension?'], topics: ['consent'], sourceIds: ['protocol'] }))
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

test('chat summaries lead with actual insights and cited next steps, deduplicate repetition and retain different conclusions', () => {
  const good = reviews({ total: 50, offset: 0 })
  good[1] = { ...good[1], summary: 'The access request includes identifiable data while the role description limits access to fabricated data.', nextSteps: ['Revise the access request to match the authorized role.'], topics: ['privacy'], sourceIds: ['access-request', 'role-description'], questions: [] }
  const sources = [...context(50).documents, { id: 'access-request', name: 'Access-request.md' }, { id: 'role-description', name: 'Role-description.md' }]
  const answer = reviewSummary(good, 50, sources)
  assert(answer.indexOf('Key insights') < answer.indexOf(good[0].summary))
  assert(answer.indexOf(good[0].summary) < answer.indexOf('Remaining uncertainties'))
  assert(answer.includes(good[1].summary))
  assert(answer.includes('Sources: Access-request.md, Role-description.md'))
  assert(answer.includes('Recommended next steps'))
  assert(answer.includes(good[1].nextSteps[0]))
  assert.equal(answer.split(good[0].summary).length - 1, 1)
  assert.equal(answer.split(good[0].nextSteps[0]).length - 1, 1)
  assert(!answer.includes('Questions to explore'))
  assert.equal(reviewSummary([...good].reverse(), 50, sources), answer)
  good.forEach(review => { review.questions = [] })
  assert(!reviewSummary(good, 50, sources).includes('Remaining uncertainties'))
})

test('saved reviews without next steps remain readable and completed chats recover their original model insights', () => {
  const { controller, session, reload } = fixture()
  const batch = { total: 50, offset: 0 }
  const legacy = reviews(batch).map(({ nextSteps, ...review }) => review)
  assert.equal(validateAgentReviews(legacy, agentBatch(batch), ['protocol']).length, 10)
  assert.throws(() => validateAgentReviews(legacy, agentBatch(batch), ['protocol'], { requireNextSteps: true }))
  const run = controller.startRun(session.id, 'Review the study', { mode: 'openai' })
  for (let offset = 0; offset < 50; offset += 10) controller.appendAgentReviews(session.id, run.id, reviews({ total: 50, offset }).map(({ nextSteps, ...review }) => review))
  controller.finishRun(session.id, run.id, { content: 'Old question-only summary', model: 'mock-model' })
  const recovered = reload().state.sessions.find(item => item.id === session.id)
  assert.equal(recovered.runs[0].status, 'completed')
  assert.equal(recovered.runs[0].agentReviews.length, 50)
  assert(recovered.messages[1].content.includes(legacy[0].summary))
  assert(recovered.messages[1].content.includes('Sources: Protocol.md'))
  assert(!recovered.messages[1].content.includes('Old question-only summary'))
  assert(!recovered.messages[1].content.includes('Recommended next steps'))
})

test('300-agent summaries fit the saved answer limit while each complete review remains in the graph', () => {
  const documents = Array.from({ length: 4 }, (_, index) => ({ id: `document-${index}`, name: `${index}${'long-file-name'.repeat(22)}` }))
  const all = reviewAgents(300).map((agent, index) => ({ agentId: agent.id, summary: `${index} ${'s'.repeat(590)}`, nextSteps: [`${index} ${'a'.repeat(190)}`, `${index} ${'b'.repeat(190)}`], questions: [`${index} ${'q'.repeat(190)}`], topics: ['consent', 'privacy'], sourceIds: documents.map(document => document.id) }))
  const answer = reviewSummary(all, 300, documents)
  assert(answer.length < 12000)
  assert(answer.includes('300 of 300'))
  const graph = createGeneratedSimulationGraph({ id: 'full', prompt: 'Review', status: 'completed', agentCount: 300, agentReviews: all, sources: documents })
  assert.equal(graph.nodes.filter(node => node.type === 'agent').length, 300)
  assert.equal(graph.nodes.find(node => node.id === 'agent-300').description, all[299].summary)
  assert.equal(graph.nodes.find(node => node.id === 'agent-300').properties['Next steps'], all[299].nextSteps.join('\n\n'))
  assert(graph.nodes.find(node => node.id === 'agent-300').properties['Source documents'].includes(documents[3].name))
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
  assert(session.messages[1].content.includes('Key insights'))
  assert(session.messages[1].content.includes('Recommended next steps'))
  assert(session.messages[1].content.includes('Sources: Protocol.md'))
  assert(calls.every(call => call.context.documents[0].text === 'Consent is required.'))
  const recovered = reload().state.sessions.find(item => item.id === session.id)
  assert.equal(recovered.runs[0].agentReviews.length, 300)
  assert.deepEqual(recovered.runs[0].agentReviews[0].nextSteps, run.agentReviews[0].nextSteps)
  assert.equal(recovered.messages[1].content, session.messages[1].content)
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
