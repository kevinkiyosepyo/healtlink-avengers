import { computed, reactive, toRef, watch } from 'vue'
import { createWorkspaceController, PROMPT_LIMIT, STORAGE_KEY } from '../lib/simulationWorkspace.js'

let workspace
let timer

export function useSimulationWorkspace() {
  if (workspace) return workspace
  let storage
  try { storage = window.localStorage } catch { /* The controller exposes the storage warning. */ }
  const controller = createWorkspaceController({ storage, stateFactory: reactive })
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
    deleteSession: controller.deleteSession,
    startRun: controller.startRun,
    stopRun: controller.stopRun,
  }
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.clearInterval(timer)
      saveDrafts()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', persist)
      window.removeEventListener('storage', storageChanged)
      workspace = undefined
    })
  }
  return workspace
}
