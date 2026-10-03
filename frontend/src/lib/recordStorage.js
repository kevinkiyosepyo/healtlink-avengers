import { STORAGE_KEY } from './simulationWorkspace.js'

// Both website entry points use the same store. Import IndexedDB code only when
// records are needed, so deleting a primary chat does not mount research mode.
let database
async function getDatabase() {
  if (typeof indexedDB === 'undefined') return null
  if (!database) database = import('idb-keyval').then(api => ({ api, store: api.createStore('microfish-records', 'records') }))
  return database
}
const browserAdapter = {
  async entries() { const db = await getDatabase(); return db ? db.api.entries(db.store) : [] },
  async set(key, value) { const db = await getDatabase(); if (db) await db.api.set(key, value, db.store) },
  async delete(key) { const db = await getDatabase(); if (db) await db.api.del(key, db.store) },
  async clear() { const db = await getDatabase(); if (db) await db.api.clear(db.store) },
}

export function readWorkspaceSessionIds() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw === undefined) return null
    if (raw === null) return new Set()
    const workspace = JSON.parse(raw)
    if (workspace?.version !== 1 || !Array.isArray(workspace.sessions)) return null
    return new Set(workspace.sessions.filter(session => typeof session?.id === 'string').map(session => session.id))
  } catch { return null }
}

export function createRecordStorage({ adapter = browserAdapter, readSessionIds = readWorkspaceSessionIds } = {}) {
  let pending = Promise.resolve()
  const enqueue = operation => {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  // An unreadable workspace must not destroy otherwise recoverable records.
  const isLive = sessionId => readSessionIds()?.has(sessionId) ?? true

  function load() {
    return enqueue(async () => {
      let loaded = await adapter.entries()
      while (true) {
        const orphaned = loaded.filter(([, record]) => !isLive(record?.sessionId))
        if (!orphaned.length) return loaded
        const removed = new Set(orphaned.map(([runId]) => runId))
        loaded = loaded.filter(([runId]) => !removed.has(runId))
        await Promise.all(orphaned.map(([runId]) => adapter.delete(runId)))
        // Recheck after storage work: another chat may have been deleted while
        // the previous batch of orphaned records was being removed.
      }
    })
  }
  function save(record) {
    const snapshot = JSON.parse(JSON.stringify(record))
    return enqueue(async () => {
      if (!isLive(snapshot.sessionId)) {
        await adapter.delete(snapshot.runId)
        return false
      }
      await adapter.set(snapshot.runId, snapshot)
      if (!isLive(snapshot.sessionId)) {
        await adapter.delete(snapshot.runId)
        return false
      }
      return true
    })
  }
  function deleteSession(sessionId, runIds = []) {
    return enqueue(async () => {
      const ids = new Set(runIds)
      for (const [runId, record] of await adapter.entries()) {
        if (record?.sessionId === sessionId) ids.add(runId)
      }
      await Promise.all([...ids].map(runId => adapter.delete(runId)))
    })
  }
  const deleteRun = runId => enqueue(() => adapter.delete(runId))
  const clear = () => enqueue(() => adapter.clear())
  return { load, save, deleteSession, deleteRun, clear, isLive }
}

export const recordStorage = createRecordStorage()
