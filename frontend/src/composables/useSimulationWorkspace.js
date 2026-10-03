import { computed, reactive, toRef, watch } from 'vue'
import { createWorkspaceController, PROMPT_LIMIT, STORAGE_KEY } from '../lib/simulationWorkspace.js'

let workspace
let timer

// The request belongs to the original run even when another chat is selected.
// Only the current prompt is sent: browser-local chats are not account scoped.
export function createOpenAIRunTransport(controller, {
  fetchImpl = (...args) => globalThis.fetch(...args),
  deleteRecords = async (sessionId, runIds) => (await import('../lib/recordStorage.js')).recordStorage.deleteSession(sessionId, runIds),
} = {}) {
  const requests = new Map()

  function startOpenAIRun(sessionId, prompt) {
    const run = controller.startRun(sessionId, prompt, { mode: 'openai' })
    if (!run) return null
    const request = { sessionId, abort: new AbortController() }
    requests.set(run.id, request)
    void (async () => {
      try {
        const response = await fetchImpl('/api/simulate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: request.abort.signal,
          body: JSON.stringify({ prompt: run.prompt }),
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

export function useSimulationWorkspace() {
  if (workspace) return workspace
  let storage
  try { storage = window.localStorage } catch { /* The controller exposes the storage warning. */ }
  const controller = createWorkspaceController({ storage, stateFactory: reactive })
  const transport = createOpenAIRunTransport(controller)
  const { state } = controller

  // The controller belongs to the workspace, not the currently selected chat.
  // Switching chats therefore never removes or restarts a simulation timer.
  timer = window.setInterval(controller.tick, 250)
  const saveDrafts = watch(
    () => state.sessions.map(session => [session.id, session.draft]),
    () => {
      for (const session of state.sessions) {
        if (typeof session.draft !== 'string') session.draft = ''
        else if (session.draft.length > PROMPT_LIMIT) session.draft = session.draft.slice(0, PROMPT_LIMIT)
      }
      controller.persist()
    },
    { flush: 'sync' },
  )
  const resume = () => {
    if (!document.hidden) {
      controller.refreshStorageStatus()
      controller.tick()
    }
  }
  const persist = () => controller.persist()
  const storageChanged = event => {
    if ((event.key === STORAGE_KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) controller.refreshStorageStatus()
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pagehide', persist)
  window.addEventListener('storage', storageChanged)

  workspace = {
    sessions: toRef(state, 'sessions'),
    activeId: toRef(state, 'activeId'),
    storageWarning: toRef(state, 'storageWarning'),
    activeSession: computed(() => state.sessions.find(session => session.id === state.activeId)),
    runningCount: computed(() => state.sessions.filter(session => session.runs.some(run => run.status === 'running')).length),
    createSession: controller.createSession,
    selectSession: controller.selectSession,
    renameSession: controller.renameSession,
    deleteSession: transport.deleteSession,
    startRun: controller.startRun,
    startOpenAIRun: transport.startOpenAIRun,
    stopRun: transport.stopRun,
  }
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.clearInterval(timer)
      transport.dispose()
      saveDrafts()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', persist)
      window.removeEventListener('storage', storageChanged)
      workspace = undefined
    })
  }
  return workspace
}
