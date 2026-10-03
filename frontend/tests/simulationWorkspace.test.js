import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceController, STORAGE_KEY, PROMPT_LIMIT, TITLE_LIMIT, SESSION_LIMIT, RUN_LIMIT, AI_RESPONSE_LIMIT } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport } from '../src/composables/useSimulationWorkspace.js'

function fixture(initialStorage) {
  let time = 1000000
  let counter = 0
  const saved = new Map(initialStorage ? [[STORAGE_KEY, initialStorage]] : [])
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const options = { storage, now: () => time, id: () => `test-${++counter}` }
  const controller = createWorkspaceController(options)
  return { controller, storage, saved, advance: ms => { time += ms }, reload: () => createWorkspaceController(options) }
}

test('fresh workspace has one selected blank chat', () => {
  const { controller: { state }, reload } = fixture()
  assert.equal(state.sessions.length, 1)
  assert.equal(state.activeId, state.sessions[0].id)
  assert.equal(state.sessions[0].draft, '')
  assert.deepEqual(state.sessions[0].messages, [])
  assert.deepEqual(state.sessions[0].runs, [])
  assert.equal(reload().state.activeId, state.activeId)
})

test('separate chats run concurrently and switching cannot redirect progress or messages', () => {
  const { controller: c, advance } = fixture()
  const first = c.state.sessions[0]
  const firstRun = c.startRun(first.id, 'First scenario')
  advance(6000)
  const second = c.createSession()
  const secondRun = c.startRun(second.id, 'Second scenario')
  advance(6000)
  c.selectSession(first.id)
  c.tick()
  assert.equal(firstRun.progress, 50)
  assert.equal(secondRun.progress, 25)
  assert.equal(first.messages[0].content, 'First scenario')
  assert.equal(second.messages[0].content, 'Second scenario')
  assert.notEqual(first.messages[1].runId, second.messages[1].runId)
  advance(12000)
  c.selectSession(second.id)
  c.tick()
  assert.equal(firstRun.status, 'completed')
  assert.equal(secondRun.status, 'running')
  assert.equal(secondRun.progress, 75)
  assert.match(first.messages[1].content, /Demo complete/)
  assert.match(first.messages[1].content, /no AI model or simulation backend was called/)
  assert.match(second.messages[1].content, /no simulation backend is connected/)
})

test('rejects empty input and a second active run in the same chat', () => {
  const { controller: c } = fixture()
  const session = c.state.sessions[0]
  assert.equal(c.startRun(session.id, '   '), null)
  assert.equal(c.startRun('missing', 'Scenario'), null)
  c.startRun(session.id, 'Scenario')
  assert.equal(c.startRun(session.id, 'Other scenario'), null)
  assert.equal(session.messages.length, 2)
  assert.equal(session.runs.length, 1)
})

test('a follow-up preserves the existing conversation and creates a separate run', () => {
  const { controller: c, advance } = fixture()
  const session = c.state.sessions[0]
  const first = c.startRun(session.id, 'Original scenario')
  advance(24000)
  c.tick()
  const second = c.startRun(session.id, 'Change the assumptions')
  assert.notEqual(first.id, second.id)
  assert.equal(first.status, 'completed')
  assert.equal(second.status, 'running')
  assert.equal(session.messages.length, 4)
  assert.equal(session.title, 'Original scenario')
})

test('stopping a run preserves its progress and does not stop another chat', () => {
  const { controller: c, advance } = fixture()
  const first = c.state.sessions[0]
  const firstRun = c.startRun(first.id, 'Stop this')
  const second = c.createSession()
  const secondRun = c.startRun(second.id, 'Keep running')
  advance(6000)
  assert.equal(c.stopRun(first.id), true)
  assert.equal(firstRun.progress, 25)
  advance(24000)
  c.tick()
  assert.equal(firstRun.status, 'stopped')
  assert.equal(firstRun.progress, 25)
  assert.equal(secondRun.status, 'completed')
  assert.match(first.messages[1].content, /Demo stopped/)
  assert.equal(c.stopRun(first.id), false)
})

test('deleting an active chat removes its run without affecting other chats', () => {
  const { controller: c, advance, reload } = fixture()
  const first = c.state.sessions[0]
  c.startRun(first.id, 'First')
  const second = c.createSession()
  const secondRun = c.startRun(second.id, 'Second')
  c.selectSession(first.id)
  assert.equal(c.deleteSession(first.id), true)
  assert.equal(c.state.activeId, second.id)
  advance(24000)
  c.tick()
  assert.equal(secondRun.status, 'completed')
  assert.equal(reload().state.sessions.length, 1)
  assert.equal(c.deleteSession(second.id), true)
  assert.equal(c.state.sessions.length, 1)
  assert.equal(c.state.sessions[0].runs.length, 0)
  assert.notEqual(c.state.activeId, second.id)
})

test('drafts, renamed titles, conversation history, and selection survive reload', () => {
  const { controller: c, reload } = fixture()
  const first = c.state.sessions[0]
  c.startRun(first.id, 'Initial prompt')
  c.renameSession(first.id, 'Saved title')
  const second = c.createSession()
  c.setDraft(second.id, 'Unsent draft')
  c.selectSession(first.id)
  const restored = reload().state
  assert.equal(restored.activeId, first.id)
  assert.equal(restored.sessions.find(s => s.id === first.id).title, 'Saved title')
  assert.equal(restored.sessions.find(s => s.id === first.id).messages[0].content, 'Initial prompt')
  assert.equal(restored.sessions.find(s => s.id === second.id).draft, 'Unsent draft')
})

test('running demos resume from elapsed time and finish across reloads', () => {
  const { controller: c, advance, reload } = fixture()
  c.startRun(c.state.activeId, 'Recover me')
  advance(6000)
  const partial = reload().state.sessions[0]
  assert.equal(partial.runs[0].status, 'running')
  assert.equal(partial.runs[0].progress, 25)
  advance(36000)
  const finished = reload().state.sessions[0]
  assert.equal(finished.runs[0].status, 'completed')
  assert.equal(finished.runs[0].progress, 100)
  assert.equal(finished.runs[0].completedAt, 1024000)
  assert.match(finished.messages[1].content, /Demo complete/)
})

test('corrupt or incompatible storage safely opens a fresh chat with a recovery notice', () => {
  for (const saved of ['{broken', 'null', '{"version":2,"sessions":[]}', '{"version":1,"sessions":[null]}']) {
    const { controller: c } = fixture(saved)
    assert.equal(c.state.sessions.length, 1)
    assert.equal(c.state.sessions[0].messages.length, 0)
    assert.match(c.state.storageWarning, /could not be read/)
    assert.ok(c.startRun(c.state.activeId, 'Still works'))
  }
})

test('valid chats survive alongside invalid saved entries and selection is repaired', () => {
  const saved = JSON.stringify({ version: 1, activeId: 'missing', sessions: [null, { id: 'valid', title: 'Kept', messages: [], runs: [], draft: 'a'.repeat(3000) }] })
  const { controller: c } = fixture(saved)
  assert.equal(c.state.sessions.length, 1)
  assert.equal(c.state.activeId, 'valid')
  assert.equal(c.state.sessions[0].title, 'Kept')
  assert.equal(c.state.sessions[0].draft.length, PROMPT_LIMIT)
  assert.match(c.state.storageWarning, /Some saved chats/)
})

test('storage failures are visible and do not prevent in-memory conversations', () => {
  const c = createWorkspaceController({ storage: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } } })
  assert.match(c.state.storageWarning, /could not be read/)
  assert.ok(c.startRun(c.state.activeId, 'Work without storage'))
  assert.match(c.state.storageWarning, /Changes could not be saved/)
  assert.equal(c.state.sessions[0].messages.length, 2)
  const unavailable = createWorkspaceController()
  assert.match(unavailable.state.storageWarning, /only for this visit/)
})

test('input and title bounds protect persisted data and invalid operations do nothing', () => {
  const { controller: c } = fixture()
  const session = c.state.sessions[0]
  c.setDraft(session.id, 'a'.repeat(PROMPT_LIMIT + 100))
  assert.equal(session.draft.length, PROMPT_LIMIT)
  const run = c.startRun(session.id, session.draft)
  assert.equal(run.prompt.length, PROMPT_LIMIT)
  assert.equal(session.draft, '')
  c.renameSession(session.id, 'T'.repeat(TITLE_LIMIT + 100))
  assert.equal(session.title.length, TITLE_LIMIT)
  assert.equal(c.renameSession(session.id, '  '), false)
  assert.equal(c.selectSession('missing'), false)
  assert.equal(c.deleteSession('missing'), false)
  assert.equal(c.stopRun('missing'), false)
  assert.equal(c.setDraft('missing', 'ignored'), false)
})

test('conversation and run limits preserve existing history instead of silently discarding it', () => {
  const { controller: c, advance } = fixture()
  const original = c.state.sessions[0]
  for (let i = 1; i < SESSION_LIMIT; i++) assert.ok(c.createSession())
  assert.equal(c.createSession(), null)
  assert.equal(c.state.sessions.length, SESSION_LIMIT)
  for (let i = 0; i < RUN_LIMIT; i++) {
    assert.ok(c.startRun(original.id, `Run ${i}`))
    advance(24000)
    c.tick()
  }
  assert.equal(c.startRun(original.id, 'One too many'), null)
  assert.equal(original.runs.length, RUN_LIMIT)
  assert.equal(original.messages[0].content, 'Run 0')
  assert.match(c.state.storageWarning, /run limit/)
})

test('stopped runs remain stopped after reopening, regardless of elapsed time', () => {
  const { controller: c, advance, reload } = fixture()
  const run = c.startRun(c.state.activeId, 'Stop and reload')
  advance(12000)
  c.stopRun(c.state.activeId)
  advance(100000)
  const restored = reload().state.sessions[0].runs[0]
  assert.equal(restored.id, run.id)
  assert.equal(restored.status, 'stopped')
  assert.equal(restored.progress, 50)
})

test('a stale tab cannot erase newer chats with a draft save or pagehide save', () => {
  const { controller: writer, reload, storage } = fixture()
  const stale = reload()
  const staleChat = stale.state.activeId
  const added = writer.createSession()
  writer.startRun(added.id, 'Keep this new conversation')
  const latestSnapshot = storage.getItem(STORAGE_KEY)

  stale.setDraft(staleChat, 'Unsaved text in the older tab')
  assert.equal(storage.getItem(STORAGE_KEY), latestSnapshot)
  assert.match(stale.state.storageWarning, /changed in another tab/)
  assert.match(stale.state.storageWarning, /Copy any new text/)
  assert.equal(stale.state.sessions[0].draft, 'Unsaved text in the older tab')
  assert.equal(stale.persist(), false, 'pagehide must not overwrite another tab')
  assert.equal(storage.getItem(STORAGE_KEY), latestSnapshot)

  const reopened = reload()
  assert.equal(reopened.state.sessions.length, 2)
  assert.equal(reopened.state.sessions.find(session => session.id === added.id).messages[0].content, 'Keep this new conversation')
  reopened.setDraft(added.id, 'Saving works after reload')
  assert.equal(reload().state.sessions.find(session => session.id === added.id).draft, 'Saving works after reload')
})

test('a storage event marks a stale tab before it writes, and conflict protection stays active', () => {
  const { controller: writer, reload, storage } = fixture()
  const stale = reload()
  writer.renameSession(writer.state.activeId, 'Updated elsewhere')
  stale.refreshStorageStatus()
  assert.match(stale.state.storageWarning, /Saving is paused/)
  const latestSnapshot = storage.getItem(STORAGE_KEY)
  stale.createSession()
  stale.startRun(stale.state.activeId, 'Temporary local run')
  assert.equal(storage.getItem(STORAGE_KEY), latestSnapshot)
  assert.match(stale.state.storageWarning, /Saving is paused/)
})

test('clearing storage in another tab is not undone by an old tab saving', () => {
  const { controller: c, saved } = fixture()
  saved.delete(STORAGE_KEY)
  c.refreshStorageStatus()
  assert.equal(c.persist(), false)
  assert.equal(saved.has(STORAGE_KEY), false)
  assert.match(c.state.storageWarning, /changed in another tab/)
})

test('same-tab edits keep saving without false conflict notices', () => {
  const { controller: c, reload } = fixture()
  const first = c.state.activeId
  c.setDraft(first, 'Draft one')
  c.setDraft(first, 'Draft two')
  const second = c.createSession()
  c.renameSession(second.id, 'Another chat')
  c.selectSession(first)
  c.refreshStorageStatus()
  assert.equal(c.state.storageWarning, '')
  assert.equal(c.persist(), true)
  const restored = reload()
  assert.equal(restored.state.activeId, first)
  assert.equal(restored.state.sessions.find(session => session.id === first).draft, 'Draft two')
  assert.equal(restored.state.sessions.find(session => session.id === second.id).title, 'Another chat')
})

test('real runs never advance with the demo timer and completion targets the original chat', () => {
  const { controller: c, advance, reload } = fixture()
  const first = c.state.sessions[0]
  const real = c.startRun(first.id, 'Review my onboarding plan', { mode: 'openai' })
  const second = c.createSession()
  const demo = c.startRun(second.id, 'A local walkthrough')
  advance(120000)
  c.tick()
  assert.equal(real.status, 'running')
  assert.equal(real.progress, 0)
  assert.equal(real.agentCount, 3)
  assert.equal(real.stage, 'Waiting for OpenAI agents')
  assert.doesNotMatch(first.messages[1].content, /demo|sample agents/i)
  assert.equal(demo.status, 'completed')
  assert.equal(c.finishRun(second.id, real.id, { content: 'Wrong chat' }), false)
  assert.equal(c.finishRun(first.id, real.id, { content: 'Three reviewers identified a missing prerequisite.', model: 'test-model', agentCount: 3 }), true)
  assert.equal(real.status, 'completed')
  assert.equal(real.progress, 100)
  assert.equal(real.model, 'test-model')
  assert.equal(real.stage, 'AI exploration complete')
  assert.equal(first.messages[1].content, 'Three reviewers identified a missing prerequisite.')
  assert.match(second.messages[1].content, /Demo complete/)
  assert.equal(c.state.activeId, second.id)
  const recovered = reload().state.sessions.find(session => session.id === first.id)
  assert.equal(recovered.runs[0].mode, 'openai')
  assert.equal(recovered.runs[0].model, 'test-model')
  assert.equal(recovered.messages[1].content, first.messages[1].content)
})

test('AI failure restores a retry draft without replacing a newer user draft', () => {
  const { controller: c, reload } = fixture()
  const first = c.state.sessions[0]
  const run = c.startRun(first.id, 'Keep my question', { mode: 'openai' })
  assert.equal(c.failRun(first.id, run.id, 'Sign in again to retry.'), true)
  assert.equal(first.draft, 'Keep my question')
  assert.equal(run.status, 'failed')
  assert.equal(run.stage, 'Could not complete')
  assert.match(first.messages[1].content, /Sign in again/)
  assert.equal(c.finishRun(first.id, run.id, { content: 'Late success' }), false)
  assert.equal(c.failRun(first.id, run.id, 'Late failure'), false)
  const failed = reload().state.sessions[0]
  assert.equal(failed.runs[0].status, 'failed')
  assert.match(failed.messages[1].content, /Sign in again/)

  const retry = c.startRun(first.id, first.draft, { mode: 'openai' })
  c.setDraft(first.id, 'A different follow-up I am writing')
  c.failRun(first.id, retry.id, 'Please retry later.')
  assert.equal(first.draft, 'A different follow-up I am writing')
})

test('stopped and deleted AI runs reject late responses without touching a concurrent run', () => {
  const { controller: c } = fixture()
  const first = c.state.sessions[0]
  const stopped = c.startRun(first.id, 'Stop me', { mode: 'openai' })
  const second = c.createSession()
  const active = c.startRun(second.id, 'Keep me', { mode: 'openai' })
  assert.equal(c.stopRun(first.id), true)
  assert.equal(stopped.status, 'stopped')
  assert.equal(first.draft, stopped.prompt)
  assert.equal(c.finishRun(first.id, stopped.id, { content: 'Too late' }), false)
  assert.equal(c.failRun(first.id, stopped.id, 'Too late'), false)
  assert.equal(active.status, 'running')
  assert.match(first.messages[1].content, /Stopped waiting for this AI run/)
  c.deleteSession(second.id)
  assert.equal(c.finishRun(second.id, active.id, { content: 'Too late' }), false)
  assert.equal(c.failRun(second.id, active.id, 'Too late'), false)
})

test('reloading real work marks it interrupted instead of inventing completion', () => {
  const { controller: c, advance, reload } = fixture()
  const session = c.state.sessions[0]
  c.startRun(session.id, 'Recover this question', { mode: 'openai' })
  advance(3600000)
  const restored = reload()
  const recovered = restored.state.sessions[0]
  assert.equal(recovered.runs[0].status, 'stopped')
  assert.equal(recovered.runs[0].progress, 0)
  assert.equal(recovered.draft, 'Recover this question')
  assert.match(recovered.messages[1].content, /interrupted when the page reloaded/)
  restored.tick()
  assert.equal(recovered.runs[0].status, 'stopped')
  const retry = restored.startRun(session.id, recovered.draft, { mode: 'openai' })
  restored.finishRun(session.id, retry.id, { content: 'Successful retry', model: 'test-model' })
  assert.equal(reload().state.sessions[0].draft, '', 'older interrupted prompts must not come back after a successful retry')
})

test('AI responses persist with a bounded response and model, and empty responses fail clearly', () => {
  const { controller: c, reload } = fixture()
  const session = c.state.sessions[0]
  const first = c.startRun(session.id, 'Long answer', { mode: 'openai' })
  c.finishRun(session.id, first.id, { content: 'x'.repeat(AI_RESPONSE_LIMIT + 100), model: 'm'.repeat(120) })
  assert.equal(session.messages[1].content.length, AI_RESPONSE_LIMIT)
  assert.equal(first.model.length, 100)
  assert.equal(reload().state.sessions[0].messages[1].content.length, AI_RESPONSE_LIMIT)
  const empty = c.startRun(session.id, 'No answer', { mode: 'openai' })
  c.finishRun(session.id, empty.id, { content: '  ' })
  assert.equal(empty.status, 'failed')
  assert.equal(session.draft, 'No answer')
  assert.match(session.messages.at(-1).content, /empty response/)
})

function transportFixture(controller) {
  const calls = []
  const transport = createOpenAIRunTransport(controller, {
    fetchImpl(url, options) {
      return new Promise((resolve, reject) => calls.push({ url, options, resolve, reject }))
    },
  })
  return { transport, calls }
}
const drainRequests = () => new Promise(resolve => setImmediate(resolve))
const response = (content, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => content })

test('AI transport returns synchronously, sends only the current prompt, and completes independently of selection', async () => {
  const { controller: c } = fixture()
  const first = c.state.sessions[0]
  const previous = c.startRun(first.id, 'Private historical question', { mode: 'openai' })
  c.finishRun(first.id, previous.id, { content: 'Private historical answer' })
  const { transport, calls } = transportFixture(c)
  const run = transport.startOpenAIRun(first.id, 'Current question')
  assert.equal(run.status, 'running')
  assert.equal(typeof run.then, 'undefined')
  assert.equal(transport.startOpenAIRun(first.id, 'Duplicate'), null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/simulate')
  assert.equal(calls[0].options.credentials, 'same-origin')
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body), { prompt: 'Current question' })
  const second = c.createSession()
  calls[0].resolve(response({ content: 'A real answer', model: 'test-model', agentCount: 3 }))
  await drainRequests()
  assert.equal(run.status, 'completed')
  assert.equal(first.messages.at(-1).content, 'A real answer')
  assert.equal(second.messages.length, 0)
  assert.equal(c.state.activeId, second.id)
})

test('AI transport cancels stopped/deleted requests and ignores their late successful responses', async () => {
  const { controller: c } = fixture()
  const { transport, calls } = transportFixture(c)
  const first = c.state.sessions[0]
  const stopped = transport.startOpenAIRun(first.id, 'Stop this request')
  const second = c.createSession()
  const deleted = transport.startOpenAIRun(second.id, 'Delete this request')
  const third = c.createSession()
  const active = transport.startOpenAIRun(third.id, 'Complete this request')
  transport.stopRun(first.id)
  transport.deleteSession(second.id)
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(calls[1].options.signal.aborted, true)
  assert.equal(calls[2].options.signal.aborted, false)
  for (const call of calls) call.resolve(response({ content: 'Server result', model: 'test-model' }))
  await drainRequests()
  assert.equal(stopped.status, 'stopped')
  assert.match(first.messages.at(-1).content, /Stopped waiting for this AI run/)
  assert.equal(c.state.sessions.some(session => session.runs.some(run => run.id === deleted.id)), false)
  assert.equal(active.status, 'completed')
})

test('AI transport keeps authentication and malformed-response failures retryable', async () => {
  const { controller: c } = fixture()
  const { transport, calls } = transportFixture(c)
  const session = c.state.sessions[0]
  const expired = transport.startOpenAIRun(session.id, 'Authenticated question')
  calls[0].resolve(response({}, 401))
  await drainRequests()
  assert.equal(expired.status, 'failed')
  assert.equal(expired.mode, 'openai')
  assert.equal(session.draft, 'Authenticated question')
  assert.match(session.messages.at(-1).content, /Sign in again/)
  const malformed = transport.startOpenAIRun(session.id, session.draft)
  calls[1].resolve(response({ model: 'test-model' }))
  await drainRequests()
  assert.equal(malformed.status, 'failed')
  assert.match(session.messages.at(-1).content, /empty response/)
  const network = transport.startOpenAIRun(session.id, session.draft)
  calls[2].reject(new TypeError('Failed to fetch'))
  await drainRequests()
  assert.equal(network.status, 'failed')
  assert.equal(session.draft, 'Authenticated question')
})
