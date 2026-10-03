import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceController, STORAGE_KEY, PROMPT_LIMIT, TITLE_LIMIT, SESSION_LIMIT, RUN_LIMIT } from '../src/lib/simulationWorkspace.js'

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
