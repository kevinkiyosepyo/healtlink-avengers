import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { createWorkspaceController, STORAGE_KEY } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport, createScopedSimulationWorkspace } from '../src/composables/useSimulationWorkspace.js'
import { workspaceStorageKey } from '../src/lib/workspaceStorage.js'

function fixture() {
  let time = 1000000
  let counter = 0
  const saved = new Map()
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const options = { storage, now: () => time, id: () => `anthropic-${++counter}` }
  return { storage, controller: createWorkspaceController(options), advance: ms => { time += ms }, reload: () => createWorkspaceController(options) }
}

const drainRequests = () => new Promise(resolve => setImmediate(resolve))
const response = (content, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => content })

test('Anthropic runs wait for actual completion and reload as interrupted, retryable work', () => {
  const { controller, advance, reload } = fixture()
  const session = controller.state.sessions[0]
  const run = controller.startRun(session.id, 'Review this study', { mode: 'anthropic' })
  assert.equal(run.mode, 'anthropic')
  assert.equal(run.durationMs, 0)
  assert.equal(run.stage, 'Waiting for Anthropic agents')
  assert.match(session.messages[1].content, /Anthropic agents/)
  advance(3600000)
  controller.tick()
  assert.equal(run.status, 'running')
  assert.equal(run.progress, 0)
  const restored = reload()
  const recovered = restored.state.sessions[0]
  assert.equal(recovered.runs[0].mode, 'anthropic')
  assert.equal(recovered.runs[0].status, 'stopped')
  assert.equal(recovered.runs[0].progress, 0)
  assert.equal(recovered.draft, run.prompt)
  assert.match(recovered.messages[1].content, /Anthropic exploration was interrupted/)
  const retry = restored.startRun(recovered.id, recovered.draft, { mode: 'anthropic' })
  assert.equal(restored.finishRun(recovered.id, retry.id, { content: 'A Claude response', model: 'claude-test' }), true)
  const completed = reload().state.sessions[0]
  assert.equal(completed.runs[1].mode, 'anthropic')
  assert.equal(completed.runs[1].status, 'completed')
  assert.equal(completed.runs[1].model, 'claude-test')
  assert.equal(completed.runs[1].stage, 'Anthropic exploration complete')
  assert.equal(completed.messages[3].content, 'A Claude response')
  assert.equal(completed.draft, '')
})

test('Anthropic failures and stops preserve retry drafts and reject late results', () => {
  const { controller, reload } = fixture()
  const session = controller.state.sessions[0]
  const failed = controller.startRun(session.id, 'Retry this study', { mode: 'anthropic' })
  assert.equal(controller.failRun(session.id, failed.id, 'Anthropic quota reached.'), true)
  assert.equal(failed.stage, 'Anthropic could not complete')
  assert.equal(session.draft, 'Retry this study')
  assert.match(session.messages[1].content, /Anthropic quota reached/)
  assert.equal(controller.finishRun(session.id, failed.id, { content: 'A late response' }), false)
  assert.equal(reload().state.sessions[0].runs[0].status, 'failed')
  const stopped = controller.startRun(session.id, session.draft, { mode: 'anthropic' })
  assert.equal(controller.stopRun(session.id), true)
  assert.equal(stopped.status, 'stopped')
  assert.equal(session.draft, stopped.prompt)
  assert.match(session.messages[3].content, /Requests already sent to Anthropic/)
  assert.equal(controller.finishRun(session.id, stopped.id, { content: 'A late response' }), false)
  assert.equal(controller.failRun(session.id, stopped.id, 'A late error'), false)
})

test('Anthropic transport sends the original session context and provider while OpenAI retains its payload', async () => {
  const { controller } = fixture()
  const context = {
    overview: 'First institution study',
    transcript: 'An audio dictation transcript',
    documents: [{ id: 'protocol', name: 'Protocol.txt', kind: 'txt', text: 'Original protocol content' }],
    university: { id: 'university-first', name: 'First university' },
    institution: { name: 'First university', sources: ['https://example.edu/research'] },
    institutionToken: 'verified-institution-test-token',
  }
  const anthropicSession = controller.createSession({ context })
  const calls = []
  const transport = createOpenAIRunTransport(controller, { fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) })
  const run = transport.startAnthropicRun(anthropicSession.id, 'Review the original study')
  const openaiSession = controller.createSession()
  const openaiRun = transport.startOpenAIRun(openaiSession.id, 'A separate question')
  context.overview = 'A later edit outside this session'
  assert.equal(run.mode, 'anthropic')
  assert.equal(calls[0].url, '/api/simulate')
  assert.equal(calls[0].options.credentials, 'same-origin')
  assert.equal(calls[0].options.method, 'POST')
  const anthropicBody = JSON.parse(calls[0].options.body)
  assert.equal(anthropicBody.provider, 'anthropic')
  assert.equal(anthropicBody.prompt, 'Review the original study')
  assert.equal(anthropicBody.context.overview, 'First institution study')
  assert.equal(anthropicBody.context.transcript, 'An audio dictation transcript')
  assert.equal(anthropicBody.context.documents[0].text, 'Original protocol content')
  assert.equal(anthropicBody.context.institutionToken, 'verified-institution-test-token')
  assert.deepEqual(JSON.parse(calls[1].options.body), { prompt: 'A separate question' })
  calls[0].resolve(response({ content: 'Claude reviewed the first study', model: 'claude-test' }))
  calls[1].resolve(response({ content: 'OpenAI reviewed the separate question', model: 'openai-test' }))
  await drainRequests()
  assert.equal(run.status, 'completed')
  assert.equal(openaiRun.status, 'completed')
  assert.equal(anthropicSession.messages[1].content, 'Claude reviewed the first study')
  assert.equal(openaiSession.messages[1].content, 'OpenAI reviewed the separate question')
  assert.equal(controller.state.activeId, openaiSession.id)
  transport.dispose()
})

test('Anthropic transport aborts stopped and deleted runs, ignoring responses after cancellation', async () => {
  const { controller } = fixture()
  const calls = []
  const transport = createOpenAIRunTransport(controller, { fetchImpl: (url, options) => new Promise(resolve => calls.push({ options, resolve })) })
  const first = controller.state.sessions[0]
  const stopped = transport.startAnthropicRun(first.id, 'Stop this request')
  const second = controller.createSession()
  transport.startAnthropicRun(second.id, 'Delete this request')
  transport.stopRun(first.id)
  transport.deleteSession(second.id)
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(calls[1].options.signal.aborted, true)
  for (const call of calls) call.resolve(response({ content: 'A late Claude response' }))
  await drainRequests()
  assert.equal(stopped.status, 'stopped')
  assert.doesNotMatch(first.messages[1].content, /late Claude response/)
  assert.equal(controller.state.sessions.some(session => session.id === second.id), false)
})

test('account scope changes abort both providers and preserve each stopped run in the old account', async () => {
  const { storage } = fixture()
  const key = ref(workspaceStorageKey(STORAGE_KEY, 'alice'))
  const calls = []
  const workspace = createScopedSimulationWorkspace({ storage, storageKey: key, fetchImpl: (url, options) => new Promise(resolve => calls.push({ options, resolve })) })
  try {
    const first = workspace.activeSession.value
    const anthropicRun = workspace.startAnthropicRun(first.id, 'Alice Anthropic question')
    const second = workspace.createSession()
    const openaiRun = workspace.startOpenAIRun(second.id, 'Alice OpenAI question')
    key.value = workspaceStorageKey(STORAGE_KEY, 'bob')
    assert.equal(calls.every(call => call.options.signal.aborted), true)
    assert.equal(anthropicRun.status, 'stopped')
    assert.equal(openaiRun.status, 'stopped')
    for (const call of calls) call.resolve(response({ content: 'A late result' }))
    await drainRequests()
    assert.equal(workspace.activeSession.value.messages.length, 0)
    key.value = workspaceStorageKey(STORAGE_KEY, 'alice')
    assert.deepEqual(new Set(workspace.sessions.value.map(session => session.runs[0]?.mode)), new Set(['anthropic', 'openai']))
    for (const session of workspace.sessions.value) {
      assert.equal(session.runs[0].status, 'stopped')
      assert.doesNotMatch(session.messages[1].content, /A late result/)
    }
  } finally { workspace.dispose() }
})
