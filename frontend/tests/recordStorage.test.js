import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { createRecordStorage, recordStorage, readWorkspaceSessionIds } from '../src/lib/recordStorage.js'
import { createWorkspaceController, STORAGE_KEY } from '../src/lib/simulationWorkspace.js'
import { createOpenAIRunTransport } from '../src/composables/useSimulationWorkspace.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const drain = () => new Promise(resolve => setImmediate(resolve))
const record = (runId, sessionId) => ({ runId, sessionId, createdAt: '2026-10-05T00:00:00Z', prompt: 'Fictional study', analysisKey: runId, analysis: { inScope: true }, error: null })
function fixture(initial = []) {
  const saved = new Map(initial.map(item => [item.runId, item]))
  const live = new Set(initial.map(item => item.sessionId))
  const adapter = {
    async entries() { return [...saved] },
    async set(key, value) { saved.set(key, value) },
    async delete(key) { saved.delete(key) },
    async clear() { saved.clear() },
  }
  const repository = createRecordStorage({ adapter, readSessionIds: () => live })
  return { saved, live, adapter, repository }
}

test('primary chat deletion removes every research record for that chat and preserves live chat records', async () => {
  const controller = createWorkspaceController()
  const deleted = controller.state.sessions[0]
  const deletedRun = controller.startRun(deleted.id, 'Fictional first study')
  const kept = controller.createSession()
  const keptRun = controller.startRun(kept.id, 'Fictional second study')
  const { repository, saved } = fixture([record(deletedRun.id, deleted.id), record('older-run', deleted.id), record(keptRun.id, kept.id)])
  const cleanup = deferred()
  const transport = createOpenAIRunTransport(controller, { deleteRecords: async (...args) => { await repository.deleteSession(...args); cleanup.resolve() } })
  assert.equal(transport.deleteSession(deleted.id), true)
  await cleanup.promise
  assert.deepEqual([...saved.keys()], [keptRun.id])
  assert.equal(controller.state.sessions.some(session => session.id === deleted.id), false)
})

test('load removes existing orphans before returning records for caches or export', async () => {
  const { repository, saved, live } = fixture([record('kept', 'live-chat'), record('old', 'deleted-chat')])
  live.delete('deleted-chat')
  assert.deepEqual((await repository.load()).map(([runId]) => runId), ['kept'])
  assert.deepEqual([...saved.keys()], ['kept'])
})

test('load reconciles a chat deleted while an IndexedDB read or cleanup is pending', async () => {
  const { repository, saved, live, adapter } = fixture([record('kept', 'live-chat'), record('late', 'later-deleted'), record('old', 'already-deleted')])
  const reading = deferred()
  const deleting = deferred()
  const startedDelete = deferred()
  adapter.entries = async () => { const snapshot = [...saved]; await reading.promise; return snapshot }
  adapter.delete = async key => {
    if (key === 'old') { startedDelete.resolve(); await deleting.promise }
    saved.delete(key)
  }
  const loading = repository.load()
  await drain()
  live.delete('already-deleted')
  reading.resolve()
  await startedDelete.promise
  live.delete('later-deleted')
  deleting.resolve()
  assert.deepEqual((await loading).map(([runId]) => runId), ['kept'])
  assert.deepEqual([...saved.keys()], ['kept'])
})

test('late analysis cannot recreate a record after its chat is deleted during a write', async () => {
  const { repository, saved, live, adapter } = fixture([record('kept', 'live-chat')])
  live.add('deleted-chat')
  const writing = deferred()
  const startedWrite = deferred()
  adapter.set = async (key, value) => { startedWrite.resolve(); await writing.promise; saved.set(key, value) }
  const saving = repository.save(record('late', 'deleted-chat'))
  await startedWrite.promise
  live.delete('deleted-chat')
  const deleting = repository.deleteSession('deleted-chat', ['late'])
  writing.resolve()
  assert.equal(await saving, false)
  await deleting
  assert.equal(await repository.save(record('later', 'deleted-chat')), false)
  assert.deepEqual([...saved.keys()], ['kept'])
})

test('storage failures do not poison the operation queue or erase live records', async () => {
  const { repository, saved, adapter } = fixture([record('kept', 'live-chat')])
  const entries = adapter.entries
  adapter.entries = async () => { throw new Error('storage unavailable') }
  await assert.rejects(repository.load(), /storage unavailable/)
  adapter.entries = entries
  assert.deepEqual((await repository.load()).map(([runId]) => runId), ['kept'])
  const unknownWorkspace = createRecordStorage({ adapter, readSessionIds: () => null })
  assert.equal((await unknownWorkspace.load()).length, 1)
  assert.equal(saved.has('kept'), true)
})

test('research startup excludes orphan records and export rechecks liveness', async t => {
  const { repository, saved, live } = fixture([record('kept', 'live-chat'), record('orphan', 'deleted-chat')])
  live.delete('deleted-chat')
  for (const method of Object.keys(repository)) t.mock.method(recordStorage, method, repository[method])
  const browserStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  const priorWindow = globalThis.window
  const priorDocument = globalThis.document
  globalThis.window = { localStorage: browserStorage, sessionStorage: browserStorage, addEventListener() {}, removeEventListener() {} }
  globalThis.document = { createElement: () => ({ click() {} }) }
  t.after(() => { globalThis.window = priorWindow; globalThis.document = priorDocument })
  const blobs = []
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return 'blob:research-test' })
  t.mock.method(URL, 'revokeObjectURL', () => {})
  const { useResearch } = await import(`../src/composables/useResearch.js?record-cleanup=${Date.now()}`)
  const sessions = ref([{ id: 'live-chat', runs: [] }])
  const research = useResearch(sessions)
  await drain()
  assert.deepEqual(Object.keys(research.records), ['kept'])
  assert.equal(saved.has('orphan'), false)
  research.exportAll('json')
  assert.deepEqual(JSON.parse(await blobs.at(-1).text()).records.map(item => item.runId), ['kept'])
  live.delete('live-chat')
  research.exportAll('json')
  assert.deepEqual(JSON.parse(await blobs.at(-1).text()).records, [])
  assert.equal(research.recordCount.value, 0)
})

test('workspace liveness distinguishes deleted storage from unreadable storage', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let raw = JSON.stringify({ version: 1, sessions: [{ id: 'live-chat' }] })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage)
  assert.deepEqual([...readWorkspaceSessionIds()], ['live-chat'])
  raw = null
  assert.equal(readWorkspaceSessionIds().size, 0)
  raw = '{invalid'
  assert.equal(readWorkspaceSessionIds(), null)
})
