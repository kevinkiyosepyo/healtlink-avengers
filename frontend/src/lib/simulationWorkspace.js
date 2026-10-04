import { AGENT_MIN, reviewAgents, validateAgentReviews } from '../../../shared/reviewAgents.js'
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
const CONTEXT_RECOVERY_WARNING = 'Some saved simulation setup could not be recovered. Your chats are still available; open their setup to re-add the missing context.'
const CONTEXT_WARNING_PREFIX = 'Simulation setup: '
const identity = value => value
const boundedText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
const timestamp = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 120
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
const isAIRun = mode => mode === 'openai' || mode === 'anthropic'
const providerName = mode => mode === 'anthropic' ? 'Anthropic' : 'OpenAI'

export function runStage(progress, status = 'running', mode = 'demo') {
  if (isAIRun(mode)) {
    if (status === 'completed') return mode === 'anthropic' ? 'Anthropic exploration complete' : 'AI exploration complete'
    if (status === 'failed') return mode === 'anthropic' ? 'Anthropic could not complete' : 'Could not complete'
    if (status === 'stopped') return 'Stopped'
    return `Waiting for ${providerName(mode)} agents`
  }
  if (status === 'completed') return 'Demo complete'
  if (status === 'stopped') return 'Stopped'
  if (progress < 20) return 'Preparing the scenario'
  if (progress < 45) return 'Creating sample agents'
  if (progress < 80) return 'Running sample interactions'
  return 'Preparing the demo summary'
}

function assistantContent(run) {
  if (isAIRun(run.mode)) {
    const exploration = run.mode === 'anthropic' ? 'Anthropic exploration' : 'AI exploration'
    // Completed AI text lives in the assistant message, avoiding a second copy
    // of the response in every persisted run.
    if (run.status === 'completed') return null
    if (run.status === 'failed') return `${exploration} could not complete. ${run.error || 'Please try again.'} Your question is saved in this chat.`
    if (run.status === 'stopped') return run.interrupted
      ? `This ${exploration} was interrupted when the page reloaded. Your question is saved; run it again to retry.`
      : `Stopped waiting for this AI run. Your question is saved. Requests already sent to ${providerName(run.mode)} may still finish and incur API usage.`
    return run.agentReviews
      ? `${run.agentReviews.length} of ${run.agentCount} agent reviews completed. Open the knowledge graph to watch document references and review topics appear. You can switch chats while this run continues.`
      : `${providerName(run.mode)} agents are reviewing your question. You can switch chats while this exploration runs.`
  }
  if (run.status === 'completed') {
    return 'Demo complete. All 12 sample agents finished the scenario walkthrough. This demonstrates a separate simulation run for this chat; no AI model or simulation backend was called, and no research findings were generated. You can ask a follow-up to start another demo run, or keep this chat and start a different scenario.'
  }
  if (run.status === 'stopped') return 'Demo stopped. The conversation is saved, and you can start another run whenever you are ready.'
  return `Local demo · ${run.stage}. This run keeps progressing when you switch chats. The 12 sample agents and their progress are illustrative; no simulation backend is connected.`
}

function blankSession(now, id) {
  return { id: id(), title: UNTITLED, createdAt: now, updatedAt: now, draft: '', messages: [], runs: [], context: null }
}

function normalizeRun(raw, now) {
  if (!raw || !validId(raw.id) || !['running', 'completed', 'stopped', 'failed'].includes(raw.status)) return null
  const mode = isAIRun(raw.mode) ? raw.mode : 'demo'
  const real = isAIRun(mode)
  const interrupted = real && (raw.status === 'running' || raw.interrupted === true)
  const status = real && raw.status === 'running' ? 'stopped' : raw.status
  const startedAt = Math.min(timestamp(raw.startedAt, now), now)
  const durationMs = Number.isFinite(raw.durationMs) && raw.durationMs > 0 && raw.durationMs <= 120000 ? raw.durationMs : DEMO_DURATION_MS
  let agentCount = real ? 3 : 12
  let agentReviews, sources
  if (real && raw.agentCount >= AGENT_MIN) {
    try {
      const agents = reviewAgents(raw.agentCount)
      if (!Array.isArray(raw.sources) || raw.sources.length > 12) return null
      sources = raw.sources.map(source => {
        if (!validId(source.id) || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 300 || typeof source.kind !== 'string' || source.kind.length > 40) throw new Error('Invalid saved source')
        return { id: source.id, name: source.name, kind: source.kind }
      })
      if (new Set(sources.map(source => source.id)).size !== sources.length) return null
      agentReviews = validateAgentReviews(raw.agentReviews, agents, sources.map(source => source.id), { partial: status !== 'completed' })
      agentCount = agents.length
    } catch { return null }
  }
  const progress = status === 'completed' ? 100 : agentReviews ? Math.floor(agentReviews.length / agentCount * 100) : real ? 0 : Math.max(0, Math.min(100, Number(raw.progress) || 0))
  return {
    id: raw.id, prompt: boundedText(raw.prompt, PROMPT_LIMIT), status, mode,
    startedAt, completedAt: status === 'running' ? null : timestamp(raw.completedAt, now),
    durationMs: real ? 0 : durationMs,
    agentCount, progress, stage: runStage(progress, status, mode),
    ...(agentReviews ? { agentReviews, sources } : {}),
    ...(real ? { model: boundedText(raw.model, 100), error: boundedText(raw.error, 800), interrupted } : {}),
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
    if (message.role === 'assistant' && isAIRun(run?.mode) && run.status !== 'completed') message.content = assistantContent(run)
  }
  const latestRun = runs.at(-1)
  const interruptedRun = latestRun?.interrupted ? latestRun : null
  const contextResult = validateSimulationContext(raw.context)
  const contextWarning = !contextResult.valid || raw.contextWarning === CONTEXT_RECOVERY_WARNING
    ? CONTEXT_RECOVERY_WARNING : ''
  return {
    id: raw.id, title: boundedText(raw.title, TITLE_LIMIT).trim() || UNTITLED,
    createdAt: timestamp(raw.createdAt, now), updatedAt: timestamp(raw.updatedAt, now),
    draft: boundedText(raw.draft, PROMPT_LIMIT) || interruptedRun?.prompt || '', messages, runs,
    context: contextResult.valid ? snapshotSimulationContext(contextResult.context) : null,
    ...(contextWarning ? { contextWarning } : {}),
  }
}

/**
 * Workspace controller. All mutation targets an explicit session and run ID,
 * never the selected chat. Only demo runs advance from elapsed wall-clock time;
 * real runs are completed explicitly by their request callbacks.
 * stateFactory lets Vue make this state reactive without coupling the controller
 * (and its deterministic tests) to the UI framework.
 */
export function createWorkspaceController({ storage, storageKey = STORAGE_KEY, now = Date.now, id = uniqueId, stateFactory = identity, durationMs = DEMO_DURATION_MS } = {}) {
  let loaded = null
  let expectedSnapshot = null
  let storageReadable = false
  let storageConflict = false
  let storageWarning = storage ? '' : 'Browser storage is unavailable. Chats will last only for this visit.'
  try {
    const saved = storage?.getItem(storageKey)
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
      if (sessions.some(session => session.contextWarning)) storageWarning = [storageWarning, CONTEXT_RECOVERY_WARNING].filter(Boolean).join(' ')
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
    if (storage.getItem(storageKey) !== expectedSnapshot) {
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
      storage.setItem(storageKey, serialized)
      expectedSnapshot = serialized
      // Keep recovery/capacity notices visible; clear only a previous save failure.
      if (state.storageWarning.startsWith('Changes could not be saved')) state.storageWarning = ''
      return true
    } catch {
      state.storageWarning = SAVE_WARNING
      return false
    }
  }

  function createSession({ title, context } = {}) {
    const result = validateSimulationContext(context)
    if (!result.valid) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : CONTEXT_WARNING_PREFIX + result.error
      return null
    }
    if (state.sessions.length >= SESSION_LIMIT) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : `This browser can keep up to ${SESSION_LIMIT} chats. Delete an older chat to create another.`
      return null
    }
    const session = blankSession(now(), id)
    session.title = boundedText(title, TITLE_LIMIT).trim() || UNTITLED
    session.context = snapshotSimulationContext(result.context)
    state.sessions.unshift(session)
    state.activeId = session.id
    if (state.storageWarning.startsWith(CONTEXT_WARNING_PREFIX)) state.storageWarning = ''
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

  function setSessionContext(sessionId, context) {
    const session = getSession(sessionId)
    if (!session) return false
    if (session.runs.some(run => run.status === 'running')) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : `${CONTEXT_WARNING_PREFIX}Stop the current run before changing its setup.`
      return false
    }
    const result = validateSimulationContext(context)
    if (!result.valid) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : CONTEXT_WARNING_PREFIX + result.error
      return false
    }
    session.context = snapshotSimulationContext(result.context)
    delete session.contextWarning
    session.updatedAt = now()
    if (state.storageWarning.startsWith(CONTEXT_WARNING_PREFIX)
      || (state.storageWarning === CONTEXT_RECOVERY_WARNING && !state.sessions.some(entry => entry.contextWarning))) {
      state.storageWarning = ''
    }
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
        if (run.status !== 'running' || isAIRun(run.mode)) continue
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
    const contextResult = validateSimulationContext(session.context)
    if (!contextResult.valid) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : CONTEXT_WARNING_PREFIX + contextResult.error
      return null
    }
    if (session.runs.length >= RUN_LIMIT) {
      state.storageWarning = storageConflict ? CONFLICT_WARNING : `This chat has reached its ${RUN_LIMIT}-run limit. Create a new chat to continue.`
      return null
    }
    const startedAt = now()
    const runMode = isAIRun(mode) ? mode : 'demo'
    const run = { id: id(), prompt: cleaned, mode: runMode, status: 'running', startedAt, completedAt: null, durationMs: isAIRun(runMode) ? 0 : durationMs, agentCount: isAIRun(runMode) ? 3 : 12, progress: 0, stage: runStage(0, 'running', runMode) }
    if (isAIRun(runMode) && contextResult.context?.agentCount) {
      run.agentCount = contextResult.context.agentCount
      run.agentReviews = []
      run.sources = contextResult.context.documents.map(({ id, name, kind }) => ({ id, name, kind }))
      run.stage = `Reviewing 0 of ${run.agentCount} agents`
    }
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
    if (isAIRun(run.mode) && !session.draft) session.draft = run.prompt
    session.updatedAt = run.completedAt
    updateAssistant(session, run)
    persist()
    return true
  }

  function appendAgentReviews(sessionId, runId, reviews) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.id === runId)
    if (!run?.agentReviews || run.status !== 'running') return false
    const merged = validateAgentReviews([...run.agentReviews, ...reviews], reviewAgents(run.agentCount), run.sources.map(source => source.id), { partial: true })
    run.agentReviews = merged
    run.progress = Math.floor(merged.length / run.agentCount * 100)
    run.stage = `Reviewing ${merged.length} of ${run.agentCount} agents`
    session.updatedAt = now()
    updateAssistant(session, run)
    persist()
    return true
  }

  function finishRun(sessionId, runId, { content, model } = {}) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.id === runId)
    if (!run || !isAIRun(run.mode) || run.status !== 'running') return false
    const cleaned = boundedText(content, AI_RESPONSE_LIMIT).trim()
    if (!cleaned) return failRun(sessionId, runId, 'The server returned an empty response. Please try again.')
    const message = session.messages.find(message => message.role === 'assistant' && message.runId === run.id)
    if (!message) return false
    if (run.agentReviews && run.agentReviews.length !== run.agentCount) return failRun(sessionId, runId, 'Not all agents finished. Completed reviews remain in the graph; retry the simulation.')
    run.status = 'completed'
    run.completedAt = now()
    run.progress = 100
    run.model = boundedText(model, 100)
    run.stage = runStage(run.progress, run.status, run.mode)
    message.content = cleaned
    session.updatedAt = run.completedAt
    persist()
    return true
  }

  function failRun(sessionId, runId, message) {
    const session = getSession(sessionId)
    const run = session?.runs.find(run => run.id === runId)
    if (!run || !isAIRun(run.mode) || run.status !== 'running') return false
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
  return { state, createSession, selectSession, renameSession, setSessionContext, deleteSession, startRun, appendAgentReviews, finishRun, failRun, stopRun, setDraft, tick, persist, refreshStorageStatus }
}
import { snapshotSimulationContext, validateSimulationContext } from './simulationContext.js'
