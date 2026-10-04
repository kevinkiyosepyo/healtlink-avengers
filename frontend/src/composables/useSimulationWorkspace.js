import { computed, getCurrentScope, onScopeDispose, reactive, shallowRef, unref, watch } from 'vue'
import { createWorkspaceController, PROMPT_LIMIT, STORAGE_KEY } from '../lib/simulationWorkspace.js'
import { snapshotSimulationContext } from '../lib/simulationContext.js'

let workspace

// The request belongs to the original run even when another chat is selected.
// The current prompt and this session's setup are captured before the request.
// Conversation history stays in this browser; switching chats cannot redirect it.
export function createOpenAIRunTransport(controller, {
  fetchImpl = (...args) => globalThis.fetch(...args),
  deleteRecords = async (sessionId, runIds) => (await import('../lib/recordStorage.js')).recordStorage.deleteSession(sessionId, runIds),
} = {}) {
  const requests = new Map()

  function startOpenAIRun(sessionId, prompt) {
    const run = controller.startRun(sessionId, prompt, { mode: 'openai' })
    if (!run) return null
    const context = snapshotSimulationContext(controller.state.sessions.find(session => session.id === sessionId)?.context)
    const body = JSON.stringify({ prompt: run.prompt, ...(context ? { context } : {}) })
    const request = { sessionId, abort: new AbortController() }
    requests.set(run.id, request)
    void (async () => {
      try {
        const response = await fetchImpl('/api/simulate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: request.abort.signal,
          body,
        })
        let result
        try { result = await response.json() } catch { /* A proxy error may not contain JSON. */ }
        if (!response.ok) {
          const fallback = response.status === 401
            ? 'Your session has expired. Sign in again, then retry your question.'
            : response.status === 429
              ? 'Too many requests are running. Please wait and try again.'
              : 'The AI service could not complete this request. Please try again.'
          throw new Error(typeof result?.error === 'string' ? result.error : fallback)
        }
        if (typeof result?.content !== 'string' || !result.content.trim()) throw new Error('The server returned an empty response. Please try again.')
        controller.finishRun(sessionId, run.id, result)
      } catch (error) {
        // stopRun/deleteSession already made the run terminal before aborting.
        // A late server response or rejection cannot replace that state.
        if (!request.abort.signal.aborted) controller.failRun(sessionId, run.id, error instanceof Error ? error.message : 'The request failed. Please try again.')
      } finally {
        requests.delete(run.id)
      }
    })()
    return run
  }

  function abortSession(sessionId) {
    for (const [runId, request] of requests) {
      if (request.sessionId !== sessionId) continue
      request.abort.abort()
      requests.delete(runId)
    }
  }

  function stopRun(sessionId) {
    const stopped = controller.stopRun(sessionId)
    if (stopped) abortSession(sessionId)
    return stopped
  }

  function deleteSession(sessionId) {
    const runIds = controller.state.sessions.find(session => session.id === sessionId)?.runs.map(run => run.id) || []
    const deleted = controller.deleteSession(sessionId)
    if (deleted) {
      abortSession(sessionId)
      void Promise.resolve().then(() => deleteRecords(sessionId, runIds)).catch(() => {
        controller.state.storageWarning = 'The chat was removed, but its saved research records could not be deleted. Reopen the research workspace to retry cleanup.'
      })
    }
    return deleted
  }

  function dispose() {
    for (const sessionId of new Set(Array.from(requests.values(), request => request.sessionId))) stopRun(sessionId)
  }

  return { startOpenAIRun, stopRun, deleteSession, dispose }
}

export function createScopedSimulationWorkspace({ storage, storageKey = STORAGE_KEY, fetchImpl, windowTarget = globalThis.window, documentTarget = globalThis.document } = {}) {
  const readKey = () => unref(storageKey) || STORAGE_KEY
  let currentKey = readKey()
  const current = shallowRef(createWorkspaceController({ storage, storageKey: currentKey, stateFactory: reactive }))
  let transport = createOpenAIRunTransport(current.value, { fetchImpl })
  let disposed = false

  function finishScope() {
    transport.dispose()
    // A run should never continue in an account that is no longer active.
    for (const session of current.value.state.sessions) current.value.stopRun(session.id)
    current.value.persist()
  }

  const stopScopeWatch = watch(readKey, key => {
    if (key === currentKey) return
    finishScope()
    currentKey = key
    current.value = createWorkspaceController({ storage, storageKey: key, stateFactory: reactive })
    transport = createOpenAIRunTransport(current.value, { fetchImpl })
  }, { flush: 'sync' })

  // The controller belongs to the workspace, not the currently selected chat.
  // Switching chats therefore never removes or restarts a simulation timer.
  const timer = windowTarget?.setInterval(() => current.value.tick(), 250)
  const saveDrafts = watch(
    () => current.value.state.sessions.map(session => [session.id, session.draft]),
    () => {
      for (const session of current.value.state.sessions) {
        if (typeof session.draft !== 'string') session.draft = ''
        else if (session.draft.length > PROMPT_LIMIT) session.draft = session.draft.slice(0, PROMPT_LIMIT)
      }
      current.value.persist()
    },
    { flush: 'sync' },
  )
  const resume = () => {
    if (!documentTarget?.hidden) {
      current.value.refreshStorageStatus()
      current.value.tick()
    }
  }
  const persist = () => current.value.persist()
  const storageChanged = event => {
    if ((event.key === currentKey || event.key === null) && (!event.storageArea || event.storageArea === storage)) current.value.refreshStorageStatus()
  }
  documentTarget?.addEventListener('visibilitychange', resume)
  windowTarget?.addEventListener('pagehide', persist)
  windowTarget?.addEventListener('storage', storageChanged)

  function dispose() {
    if (disposed) return
    disposed = true
    stopScopeWatch()
    finishScope()
    saveDrafts()
    if (timer !== undefined) windowTarget?.clearInterval(timer)
    documentTarget?.removeEventListener('visibilitychange', resume)
    windowTarget?.removeEventListener('pagehide', persist)
    windowTarget?.removeEventListener('storage', storageChanged)
  }

  return {
    sessions: computed(() => current.value.state.sessions),
    activeId: computed(() => current.value.state.activeId),
    storageWarning: computed(() => current.value.state.storageWarning),
    activeSession: computed(() => current.value.state.sessions.find(session => session.id === current.value.state.activeId)),
    runningCount: computed(() => current.value.state.sessions.filter(session => session.runs.some(run => run.status === 'running')).length),
    createSession: (...args) => current.value.createSession(...args),
    selectSession: (...args) => current.value.selectSession(...args),
    renameSession: (...args) => current.value.renameSession(...args),
    setSessionContext: (...args) => current.value.setSessionContext(...args),
    deleteSession: (...args) => transport.deleteSession(...args),
    startRun: (...args) => current.value.startRun(...args),
    startOpenAIRun: (...args) => transport.startOpenAIRun(...args),
    stopRun: (...args) => transport.stopRun(...args),
    dispose,
  }
}

export function useSimulationWorkspace({ storageKey = STORAGE_KEY } = {}) {
  if (workspace) return workspace
  let storage
  try { storage = window.localStorage } catch { /* The controller exposes the storage warning. */ }
  const instance = createScopedSimulationWorkspace({ storage, storageKey })
  workspace = instance
  const dispose = () => {
    instance.dispose()
    if (workspace === instance) workspace = undefined
  }
  if (getCurrentScope()) onScopeDispose(dispose)
  if (import.meta.hot) import.meta.hot.dispose(dispose)
  return instance
}
