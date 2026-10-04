import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { CONTEXT_LIMITS, normalizeSimulationContext, validateSimulationContext, snapshotSimulationContext, simulationContextTextLength } from '../src/lib/simulationContext.js'
import { createWorkspaceController, STORAGE_KEY, TITLE_LIMIT } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport, createScopedSimulationWorkspace } from '../src/composables/useSimulationWorkspace.js'

function studyContext(name = 'First university') {
  const university = { id: name.toLowerCase().replaceAll(' ', '-'), name }
  return {
    overview: '  Compare two research workflows.\nKeep the original wording.  ',
    transcript: 'Researcher: I want to understand the extra visits.\n',
    documents: [{ id: 'doc-1', name: 'protocol.md', kind: 'markdown', text: '# Protocol\n\n  Original text.\n' }],
    university,
    institution: {
      university,
      reviewers: [{ id: 'composite-1', name: 'Participant perspective', role: 'Composite reviewer', background: 'Participant communication', kind: 'composite', sourceUrls: [] }],
      policies: [], sources: [], retrievedAt: '2026-10-03T12:00:00.000Z', status: 'composite', warnings: ['Public membership unavailable.'],
    },
    institutionToken: 'signed-profile-token',
  }
}

function fixture(initialStorage) {
  let counter = 0
  const saved = new Map(initialStorage ? [[STORAGE_KEY, initialStorage]] : [])
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const options = { storage, now: () => 1000000, id: () => `context-${++counter}` }
  return { storage, saved, controller: createWorkspaceController(options), reload: () => createWorkspaceController(options) }
}

const drain = () => new Promise(resolve => setImmediate(resolve))
const response = content => ({ ok: true, status: 200, json: async () => ({ content, model: 'test-model' }) })

test('normalization preserves complete source text while separating the saved snapshot from caller objects', () => {
  const original = studyContext()
  const normalized = normalizeSimulationContext(original)
  assert.deepEqual(normalized, original)
  assert.notEqual(normalized, original)
  assert.notEqual(normalized.documents, original.documents)
  assert.notEqual(normalized.institution.reviewers, original.institution.reviewers)
  original.overview = 'Changed externally'
  original.documents[0].text = 'Changed externally'
  original.institution.reviewers[0].name = 'Changed externally'
  assert.match(normalized.overview, /^  Compare/)
  assert.match(normalized.documents[0].text, /Original text/)
  assert.equal(normalized.institution.reviewers[0].name, 'Participant perspective')
  assert.equal(simulationContextTextLength(normalized), normalized.overview.length + normalized.transcript.length + normalized.documents[0].text.length)
})

test('legacy and empty setup normalize to null, while university-only setup is retained', () => {
  for (const raw of [undefined, null, {}, { overview: '', transcript: ' ', documents: [], university: null }]) {
    assert.equal(normalizeSimulationContext(raw), null)
    assert.deepEqual(validateSimulationContext(raw), { valid: true, context: null, error: '' })
  }
  assert.deepEqual(normalizeSimulationContext({ university: { id: 'independent', name: 'Independent researcher' } }), {
    overview: '', transcript: '', documents: [], university: { id: 'independent', name: 'Independent researcher' }, institution: null, institutionToken: '',
  })
})

test('every source limit rejects oversized material rather than silently shortening it', () => {
  const oversized = [
    { overview: 'x'.repeat(CONTEXT_LIMITS.overview + 1) },
    { transcript: 'x'.repeat(CONTEXT_LIMITS.transcript + 1) },
    { documents: [{ id: '1', name: 'large.pdf', kind: 'pdf', text: 'x'.repeat(CONTEXT_LIMITS.documentText + 1) }] },
    { documents: Array.from({ length: 13 }, (_, index) => ({ id: `${index}`, name: `${index}.md`, kind: 'markdown', text: 'Text' })) },
    { overview: 'x', documents: Array.from({ length: 3 }, (_, index) => ({ id: `${index}`, name: `${index}.md`, kind: 'markdown', text: 'x'.repeat(CONTEXT_LIMITS.documentText) })) },
    { university: { id: 'test', name: 'Test' }, institution: { source: 'x'.repeat(CONTEXT_LIMITS.institution) } },
    { university: { id: 'test', name: 'Test' }, institutionToken: 'x'.repeat(CONTEXT_LIMITS.institutionToken + 1) },
  ]
  for (const raw of oversized) {
    const before = JSON.stringify(raw)
    const result = validateSimulationContext(raw)
    assert.equal(result.valid, false)
    assert.equal(result.context, null)
    assert.ok(result.error)
    assert.throws(() => normalizeSimulationContext(raw))
    assert.equal(JSON.stringify(raw), before)
  }
  const exactlyAtLimit = { documents: Array.from({ length: 3 }, (_, index) => ({ id: `${index}`, name: `${index}.md`, kind: 'markdown', text: 'x'.repeat(CONTEXT_LIMITS.documentText) })) }
  assert.equal(simulationContextTextLength(normalizeSimulationContext(exactlyAtLimit)), CONTEXT_LIMITS.totalText)
})

test('malformed context and unsafe or non-JSON institution metadata are rejected', () => {
  const profileBase = { university: { id: 'test', name: 'Test' } }
  const cyclic = {}; cyclic.self = cyclic
  for (const raw of [
    [], 'context', { overview: 123 }, { documents: {} },
    { documents: [{ id: 'same', name: 'one.md', kind: 'markdown', text: 'One' }, { id: 'same', name: 'two.md', kind: 'markdown', text: 'Two' }] },
    { documents: [{ id: 'empty', name: 'empty.md', kind: 'markdown', text: ' ' }] },
    { university: [] }, { university: { id: '', name: 'Test' } },
    { institution: {} }, { institutionToken: 'token' },
    { ...profileBase, institution: cyclic },
    { ...profileBase, institution: { date: new Date() } },
    { ...profileBase, institution: { score: Number.POSITIVE_INFINITY } },
    { ...profileBase, institution: { callback() {} } },
    { ...profileBase, institution: JSON.parse('{"__proto__":{"polluted":true}}') },
  ]) assert.equal(validateSimulationContext(raw).valid, false)
  assert.equal({}.polluted, undefined)
})

test('a frozen run snapshot cannot be altered through nested source or university references', () => {
  const original = studyContext()
  const snapshot = snapshotSimulationContext(original)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.documents[0]), true)
  assert.equal(Object.isFrozen(snapshot.institution.reviewers[0]), true)
  assert.throws(() => { snapshot.documents[0].text = 'Changed' }, TypeError)
  assert.throws(() => { snapshot.university.name = 'Changed' }, TypeError)
  original.university.name = 'New profile preference'
  assert.equal(snapshot.university.name, 'First university')
})

test('created setup, documents, transcript, and institution snapshot survive reload without per-run copies', () => {
  const { controller, reload, storage } = fixture()
  const context = studyContext()
  const session = controller.createSession({ title: '  Imported study  ', context })
  assert.equal(session.title, 'Imported study')
  context.documents[0].text = 'Changed after creating'
  assert.match(session.context.documents[0].text, /Original text/)
  const run = controller.startRun(session.id, 'Review this study', { mode: 'openai' })
  controller.finishRun(session.id, run.id, { content: 'Review finished' })
  const recovered = reload().state.sessions.find(entry => entry.id === session.id)
  assert.deepEqual(recovered.context, session.context)
  assert.equal(recovered.messages[0].content, 'Review this study')
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY)).sessions.find(entry => entry.id === session.id)
  assert.equal(persisted.runs[0].context, undefined)
  assert.equal(persisted.messages[0].context, undefined)
  assert.equal(controller.createSession({ title: 'T'.repeat(TITLE_LIMIT + 10) }).title.length, TITLE_LIMIT)
  assert.equal(controller.createSession().context, null)
})

test('invalid setup creation and edits leave existing material intact and active runs reject setup edits', () => {
  const { controller, reload } = fixture()
  const context = studyContext()
  const session = controller.createSession({ context })
  const before = JSON.stringify(session.context)
  const count = controller.state.sessions.length
  assert.equal(controller.createSession({ context: { overview: 'x'.repeat(10001) } }), null)
  assert.equal(controller.state.sessions.length, count)
  assert.equal(controller.state.activeId, session.id)
  assert.match(controller.state.storageWarning, /Simulation setup/)
  assert.equal(controller.setSessionContext(session.id, { transcript: 'x'.repeat(40001) }), false)
  assert.equal(JSON.stringify(session.context), before)
  assert.equal(controller.setSessionContext('missing', context), false)
  const run = controller.startRun(session.id, 'Current study', { mode: 'openai' })
  assert.equal(controller.setSessionContext(session.id, studyContext('Second university')), false)
  assert.equal(JSON.stringify(session.context), before)
  assert.match(controller.state.storageWarning, /Stop the current run/)
  controller.finishRun(session.id, run.id, { content: 'Done' })
  assert.equal(controller.setSessionContext(session.id, studyContext('Second university')), true)
  assert.equal(controller.state.storageWarning, '')
  assert.equal(reload().state.sessions.find(entry => entry.id === session.id).context.university.name, 'Second university')
})

test('invalid restored context preserves the chat and exposes a recovery warning until setup is replaced', () => {
  const { controller, storage, reload } = fixture()
  const session = controller.createSession({ title: 'Keep my chat', context: studyContext() })
  const run = controller.startRun(session.id, 'Saved research question', { mode: 'openai' })
  controller.finishRun(session.id, run.id, { content: 'Saved answer' })
  const parsed = JSON.parse(storage.getItem(STORAGE_KEY))
  parsed.sessions.find(entry => entry.id === session.id).context.transcript = 'x'.repeat(40001)
  storage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  const restored = reload()
  const recovered = restored.state.sessions.find(entry => entry.id === session.id)
  assert.equal(recovered.title, 'Keep my chat')
  assert.equal(recovered.messages[1].content, 'Saved answer')
  assert.equal(recovered.context, null)
  assert.match(restored.state.storageWarning, /setup could not be recovered/)
  assert.match(recovered.contextWarning, /setup could not be recovered/)
  restored.persist()
  assert.match(reload().state.storageWarning, /setup could not be recovered/)
  assert.equal(restored.setSessionContext(session.id, studyContext()), true)
  assert.equal(restored.state.storageWarning, '')
  assert.equal(reload().state.storageWarning, '')
})

test('concurrent requests capture their own immutable setup, and later profile or chat changes cannot redirect either', async () => {
  const { controller } = fixture()
  const firstContext = studyContext()
  const first = controller.createSession({ context: firstContext })
  const second = controller.createSession({ context: studyContext('Second university') })
  const calls = []
  const transport = createOpenAIRunTransport(controller, { fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) })
  const firstRun = transport.startOpenAIRun(first.id, 'First question')
  controller.selectSession(second.id)
  const secondRun = transport.startOpenAIRun(second.id, 'Second question')
  firstContext.university.name = 'Changed account preference'
  firstContext.documents[0].text = 'Changed original import'
  const firstPayload = JSON.parse(calls[0].options.body)
  const secondPayload = JSON.parse(calls[1].options.body)
  assert.equal(firstPayload.context.university.name, 'First university')
  assert.match(firstPayload.context.documents[0].text, /Original text/)
  assert.equal(secondPayload.context.university.name, 'Second university')
  assert.equal(firstPayload.prompt, 'First question')
  assert.equal(secondPayload.prompt, 'Second question')
  calls[1].resolve(response('Second result'))
  calls[0].resolve(response('First result'))
  await drain()
  assert.equal(firstRun.status, 'completed')
  assert.equal(secondRun.status, 'completed')
  assert.equal(first.messages[1].content, 'First result')
  assert.equal(second.messages[1].content, 'Second result')
  controller.setSessionContext(first.id, studyContext('Third university'))
  assert.deepEqual(JSON.parse(calls[0].options.body), firstPayload)
  transport.dispose()
})

test('scoped accounts preserve separate university and document snapshots and abort the previous account request', async () => {
  const { storage } = fixture()
  const key = ref('workspace.account.alice')
  const calls = []
  const workspace = createScopedSimulationWorkspace({
    storage, storageKey: key, windowTarget: null, documentTarget: null,
    fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })),
  })
  try {
    const alice = workspace.activeSession.value
    assert.equal(workspace.setSessionContext(alice.id, studyContext('Alice university')), true)
    const aliceRun = workspace.startOpenAIRun(alice.id, 'Alice study')
    key.value = 'workspace.account.bob'
    assert.equal(aliceRun.status, 'stopped')
    assert.equal(calls[0].options.signal.aborted, true)
    assert.equal(workspace.activeSession.value.context, null)
    const bob = workspace.activeSession.value
    workspace.setSessionContext(bob.id, studyContext('Bob university'))
    const bobRun = workspace.startOpenAIRun(bob.id, 'Bob study')
    assert.equal(JSON.parse(calls[0].options.body).context.university.name, 'Alice university')
    assert.equal(JSON.parse(calls[1].options.body).context.university.name, 'Bob university')
    calls[0].resolve(response('Late Alice result'))
    calls[1].resolve(response('Bob result'))
    await drain()
    assert.equal(bobRun.status, 'completed')
    assert.equal(bob.messages[1].content, 'Bob result')
    key.value = 'workspace.account.alice'
    assert.equal(workspace.activeSession.value.context.university.name, 'Alice university')
    assert.doesNotMatch(workspace.activeSession.value.messages[1].content, /Late Alice result|Bob result/)
    key.value = 'workspace.account.bob'
    assert.equal(workspace.activeSession.value.context.university.name, 'Bob university')
  } finally { workspace.dispose() }
})
