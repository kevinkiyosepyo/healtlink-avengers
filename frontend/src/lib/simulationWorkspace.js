export const STORAGE_KEY = 'microfish.workspace.v1'
export const PROMPT_LIMIT = 2000
export const TITLE_LIMIT = 80
export const SESSION_LIMIT = 40
export const RUN_LIMIT = 30
export const DEMO_DURATION_MS = 24000
export const AI_RESPONSE_LIMIT = 12000

const UNTITLED = 'New simulation'
const STORAGE_LIMIT = 2_000_000
const MAX_MESSAGE_LENGTH = AI_RESPONSE_LIMIT
const CONFLICT_WARNING = 'Chats changed in another tab. Saving is paused here to protect those changes. Copy any new text you want to keep, then reload this tab.'
const SAVE_WARNING = 'Changes could not be saved in this browser. Free browser storage or remove older chats before reloading.'
const identity = value => value
const boundedText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
const timestamp = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 120
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export function runStage(progress, status = 'running', mode = 'demo') {
  if (mode === 'openai') {
    if (status === 'completed') return 'AI exploration complete'
    if (status === 'failed') return 'Could not complete'
    if (status === 'stopped') return 'Stopped'
    return 'Waiting for OpenAI agents'
  }
  if (status === 'completed') return 'Demo complete'
  if (status === 'stopped') return 'Stopped'
  if (progress < 20) return 'Preparing the scenario'
  if (progress < 45) return 'Creating sample agents'
  if (progress < 80) return 'Running sample interactions'
  return 'Preparing the demo summary'
}

function assistantContent(run) {
  if (run.mode === 'openai') {
    // Completed AI text lives in the assistant message, avoiding a second copy
    // of the response in every persisted run.
    if (run.status === 'completed') return null
    if (run.status === 'failed') return `AI exploration could not complete. ${run.error || 'Please try again.'} Your question is saved in this chat.`
    if (run.status === 'stopped') return run.interrupted
      ? 'This AI exploration was interrupted when the page reloaded. Your question is saved; run it again to retry.'
      : 'Stopped waiting for this AI run. Your question is saved. Requests already sent to OpenAI may still finish and incur API usage.'
    return 'OpenAI agents are reviewing your question. You can switch chats while this exploration runs.'
  }
  if (run.status === 'completed') {
    return 'Demo complete. All 12 sample agents finished the scenario walkthrough. This demonstrates a separate simulation run for this chat; no AI model or simulation backend was called, and no research findings were generated. You can ask a follow-up to start another demo run, or keep this chat and start a different scenario.'
  }
  if (run.status === 'stopped') return 'Demo stopped. The conversation is saved, and you can start another run whenever you are ready.'
  return `Local demo · ${run.stage}. This run keeps progressing when you switch chats. The 12 sample agents and their progress are illustrative; no simulation backend is connected.`
}

function blankSession(now, id) {
  return { id: id(), title: UNTITLED, createdAt: now, updatedAt: now, draft: '', messages: [], runs: [] }
}

function normalizeRun(raw, now) {
  if (!raw || !validId(raw.id) || !['running', 'completed', 'stopped', 'failed'].includes(raw.status)) return null
  const mode = raw.mode === 'openai' ? 'openai' : 'demo'
  const interrupted = mode === 'openai' && (raw.status === 'running' || raw.interrupted === true)
  const status = mode === 'openai' && raw.status === 'running' ? 'stopped' : raw.status
  const startedAt = Math.min(timestamp(raw.startedAt, now), now)
  const durationMs = Number.isFinite(raw.durationMs) && raw.durationMs > 0 && raw.durationMs <= 120000 ? raw.durationMs : DEMO_DURATION_MS
  const progress = status === 'completed' ? 100 : mode === 'openai' ? 0 : Math.max(0, Math.min(100, Number(raw.progress) || 0))
  return {
    id: raw.id, prompt: boundedText(raw.prompt, PROMPT_LIMIT), status, mode,
    startedAt, completedAt: status === 'running' ? null : timestamp(raw.completedAt, now),
    durationMs: mode === 'openai' ? 0 : durationMs,
    agentCount: mode === 'openai' ? 3 : 12, progress, stage: runStage(progress, status, mode),
    ...(mode === 'openai' ? { model: boundedText(raw.model, 100), error: boundedText(raw.error, 800), interrupted } : {}),
  }
}

function normalizeSession(raw, now) {
  if (!raw || !validId(raw.id) || !Array.isArray(raw.messages) || !Array.isArray(raw.runs)) return null
  const seenRuns = new Set()
  let hasRunning = false
  const runs = raw.runs.slice(-RUN_LIMIT).map(run => normalizeRun(run, now)).filter(run => {
    if (!run || seenRuns.has(run.id)) return false
    seenRuns.add(run.id)
    // A persisted chat can only have one in-flight run, even if its storage was edited.
    if (run.status === 'running' && hasRunning) {
      run.status = 'stopped'
      run.completedAt = now
      run.stage = runStage(run.progress, 'stopped', run.mode)
    }
    hasRunning ||= run.status === 'running'
    return true
  })
  const seenMessages = new Set()
  const messages = raw.messages.slice(-RUN_LIMIT * 2).filter(message => {
    if (!message || !validId(message.id) || seenMessages.has(message.id) || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false
    if (message.runId && !seenRuns.has(message.runId)) return false
    seenMessages.add(message.id)
    return true
  }).map(message => ({
    id: message.id, role: message.role, content: boundedText(message.content, MAX_MESSAGE_LENGTH),
    createdAt: timestamp(message.createdAt, now), ...(message.runId ? { runId: message.runId } : {}),
  }))
  for (const message of messages) {
    const run = runs.find(run => run.id === message.runId)
    if (message.role === 'assistant' && run?.mode === 'openai' && run.status !== 'completed') message.content = assistantContent(run)
  }
  const latestRun = runs.at(-1)
  const interruptedRun = latestRun?.interrupted ? latestRun : null
  return {
    id: raw.id, title: boundedText(raw.title, TITLE_LIMIT).trim() || UNTITLED,
    createdAt: timestamp(raw.createdAt, now), updatedAt: timestamp(raw.updatedAt, now),
    draft: boundedText(raw.draft, PROMPT_LIMIT) || interruptedRun?.prompt || '', messages, runs,
  }
}

/**
 * Workspace controller. All mutation targets an explicit session and run ID,
 * never the selected chat. Only demo runs advance from elapsed wall-clock time;
 * real runs are completed explicitly by their request callbacks.
 * stateFactory lets Vue make this state reactive without coupling the controller
 * (and its deterministic tests) to the UI framework.
 */
export function createWorkspaceController({ storage, now = Date.now, id = uniqueId, stateFactory = identity, durationMs = DEMO_DURATION_MS } = {}) {
  let loaded = null
  let expectedSnapshot = null
  let storageReadable = false
  let storageConflict = false
  let storageWarning = storage ? '' : 'Browser storage is unavailable. Chats will last only for this visit.'
  try {
    const saved = storage?.getItem(STORAGE_KEY)
    storageReadable = Boolean(storage)
    expectedSnapshot = saved ?? null
    if (saved) {
      if (saved.length > STORAGE_LIMIT) throw new Error('Saved workspace is too large')
      const parsed = JSON.parse(saved)
      if (parsed?.version !== 1 || !Array.isArray(parsed.sessions)) throw new Error('Unrecognized saved workspace')
      const seen = new Set()
      const sessions = parsed.sessions.slice(0, SESSION_LIMIT).map(session => normalizeSession(session, now())).filter(session => {
        if (!session || seen.has(session.id)) return false
        seen.add(session.id)
        return true
      })
      if (!sessions.length) throw new Error('Saved workspace contains no valid chats')
      loaded = { sessions, activeId: sessions.some(session => session.id === parsed.activeId) ? parsed.activeId : sessions[0].id }
      if (sessions.length !== parsed.sessions.length) storageWarning = 'Some saved chats could not be recovered. Your valid chats are still available.'
    }
  } catch {
    storageWarning = storageReadable
      ? 'Saved chats could not be read. A fresh chat was opened.'
      : 'Browser storage could not be read. Chats will last only for this visit.'
  }
  if (!loaded) {
    const session = blankSession(now(), id)
    loaded = { sessions: [session], activeId: session.id }
  }
  const state = stateFactory({ ...loaded, storageWarning })
  const getSession = sessionId => state.sessions.find(session => session.id === sessionId)

  function checkForExternalChanges() {
    if (storageConflict) {
      state.storageWarning = CONFLICT_WARNING
      return true
    }
    if (!storage || !storageReadable) return false
    // Recheck on every write as storage events may arrive after a draft change
    // or pagehide. Once stale, this tab must reload before writing again.
    if (storage.getItem(STORAGE_KEY) !== expectedSnapshot) {
      storageConflict = true
      state.storageWarning = CONFLICT_WARNING
      return true
    }
    return false
  }

  function refreshStorageStatus() {
    try { checkForExternalChanges() } catch { state.storageWarning = SAVE_WARNING }
  }

  function persist() {
    if (!storage) return false
    try {
      if (!storageReadable) throw new Error('Initial storage could not be read safely')
      if (checkForExternalChanges()) return false
      const serialized = JSON.stringify({ version: 1, sessions: state.sessions, activeId: state.activeId })
      if (serialized.length > STORAGE_LIMIT) throw new Error('Storage limit reached')
      storage.setItem(STORAGE_KEY, serialized)
      expectedSnapshot = serialized
      // Keep recovery/capacity notices visible; clear only a previous save failure.
      if (state.storageWarning.startsWith('Changes could not be saved')) state.storageWarning = ''
      return true
    } catch {
      state.storageWarning = SAVE_WARNING
      return false
    }
  }

  function createSession() {
    if (state.sessions.length >= SESSION_LIMIT) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : `This browser can keep up to ${SESSION_LIMIT} chats. Delete an older chat to create another.`
      return null
    }
    const session = blankSession(now(), id)
    state.sessions.unshift(session)
    state.activeId = session.id
    persist()
    return getSession(session.id)
  }

  function selectSession(sessionId) {
    if (!getSession(sessionId)) return false
    state.activeId = sessionId
    persist()
    return true
  }

  function renameSession(sessionId, title) {
    const session = getSession(sessionId)
    const cleaned = boundedText(title, TITLE_LIMIT).trim()
    if (!session || !cleaned) return false
    session.title = cleaned
    session.updatedAt = now()
    persist()
    return true
  }

  function deleteSession(sessionId) {
    const index = state.sessions.findIndex(session => session.id === sessionId)
    if (index < 0) return false
    state.sessions.splice(index, 1)
    if (!state.sessions.length) state.sessions.push(blankSession(now(), id))
    if (state.activeId === sessionId) state.activeId = state.sessions[Math.min(index, state.sessions.length - 1)].id
    if (state.storageWarning.startsWith('This browser can keep')) state.storageWarning = ''
    persist()
    return true
  }

  function updateAssistant(session, run) {
    const message = session.messages.find(message => message.role === 'assistant' && message.runId === run.id)
    const content = assistantContent(run)
    if (message && content !== null) message.content = content
  }

  function tick() {
    const currentTime = now()
    let finished = false
    for (const session of state.sessions) {
      for (const run of session.runs) {
        if (run.status !== 'running' || run.mode === 'openai') continue
        run.progress = Math.min(100, Math.max(0, Math.floor((currentTime - run.startedAt) / run.durationMs * 100)))
        if (run.progress >= 100) {
          run.status = 'completed'
          run.completedAt = run.startedAt + run.durationMs
          session.updatedAt = Math.max(session.updatedAt, run.completedAt)
          finished = true
        }
        run.stage = runStage(run.progress, run.status)
        updateAssistant(session, run)
      }
    }
    if (finished) persist()
  }

  function startRun(sessionId, prompt, { mode = 'demo' } = {}) {
    const session = getSession(sessionId)
    const cleaned = boundedText(prompt, PROMPT_LIMIT).trim()
    if (!session || !cleaned || session.runs.some(run => run.status === 'running')) return null
    if (session.runs.length >= RUN_LIMIT) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : `This chat has reached its ${RUN_LIMIT}-run limit. Create a new chat to continue.`
      return null
    }
    const startedAt = now()
    const runMode = mode === 'openai' ? 'openai' : 'demo'
    const run = { id: id(), prompt: cleaned, mode: runMode, status: 'running', startedAt, completedAt: null, durationMs: runMode === 'openai' ? 0 : durationMs, agentCount: runMode === 'openai' ? 3 : 12, progress: 0, stage: runStage(0, 'running', runMode) }
    session.runs.push(run)
    session.messages.push(
      { id: id(), role: 'user', content: cleaned, createdAt: startedAt, runId: run.id },
      { id: id(), role: 'assistant', content: assistantContent(run), createdAt: startedAt, runId: run.id },
    )
    session.draft = ''
    session.updatedAt = startedAt
    if (session.title === UNTITLED) session.title = cleaned.replace(/\s+/g, ' ').slice(0, 54) + (cleaned.replace(/\s+/g, ' ').length > 54 ? '…' : '')
    if (state.storageWarning.startsWith('This chat has reached')) state.storageWarning = ''
    persist()
    return session.runs[session.runs.length - 1]
  }

  function stopRun(sessionId) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.status === 'running')
    if (!run) return false
    tick()
    if (run.status !== 'running') return false
    run.status = 'stopped'
    run.completedAt = now()
    run.stage = runStage(run.progress, run.status, run.mode)
    if (run.mode === 'openai' && !session.draft) session.draft = run.prompt
    session.updatedAt = run.completedAt
    updateAssistant(session, run)
    persist()
    return true
  }

  function finishRun(sessionId, runId, { content, model } = {}) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.id === runId)
    if (!run || run.mode !== 'openai' || run.status !== 'running') return false
    const cleaned = boundedText(content, AI_RESPONSE_LIMIT).trim()
    if (!cleaned) return failRun(sessionId, runId, 'The server returned an empty response. Please try again.')
    const message = session.messages.find(message => message.role === 'assistant' && message.runId === run.id)
    if (!message) return false
    run.status = 'completed'
    run.completedAt = now()
    run.progress = 100
    run.model = boundedText(model, 100)
    run.agentCount = 3
    run.stage = runStage(run.progress, run.status, run.mode)
    message.content = cleaned
    session.updatedAt = run.completedAt
    persist()
    return true
  }

  function failRun(sessionId, runId, message) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.id === runId)
    if (!run || run.mode !== 'openai' || run.status !== 'running') return false
    run.status = 'failed'
    run.completedAt = now()
    run.error = boundedText(message, 800).trim() || 'The request failed. Please try again.'
    run.stage = runStage(run.progress, run.status, run.mode)
    session.updatedAt = run.completedAt
    if (!session.draft) session.draft = run.prompt
    updateAssistant(session, run)
    persist()
    return true
  }

  function setDraft(sessionId, draft) {
    const session = getSession(sessionId)
    if (!session) return false
    session.draft = boundedText(draft, PROMPT_LIMIT)
    persist()
    return true
  }

  // Demo playback resumes from elapsed time. Real requests cannot be reattached
  // after reload and are normalized to an interrupted, retryable stopped run.
  tick()
  // Give fresh browser tabs the same blank chat ID before the first keystroke.
  if (storageReadable && expectedSnapshot === null) persist()
  return { state, createSession, selectSession, renameSession, deleteSession, startRun, finishRun, failRun, stopRun, setDraft, tick, persist, refreshStorageStatus }
}
