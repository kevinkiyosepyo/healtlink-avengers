import { normalizeUniversity } from './researcherProfile.js'
import { normalizeSimulationContext } from './simulationContext.js'

export const INSTITUTION_MAX_AGE_MS = 8 * 60 * 60 * 1000
export const INSTITUTION_LOOKUP_TIMEOUT_MS = 150000

export function institutionSnapshotMatches(profile, university) {
  const selection = normalizeUniversity(university)
  return Boolean(selection && profile?.university?.id === selection.id && profile.university.name === selection.name)
}

// This reads a public expiry claim for cache freshness. The server verifies the
// signature and signed-in account before using any institutional facts in a run.
export function institutionTokenExpiresAt(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) return null
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch { return null }
}

export function isInstitutionSnapshotFresh(snapshot, university, { now = Date.now(), maxAgeMs = INSTITUTION_MAX_AGE_MS, requireToken = true } = {}) {
  if (!institutionSnapshotMatches(snapshot?.profile, university)) return false
  const retrievedAt = Date.parse(snapshot.profile.retrievedAt)
  const expiresAt = institutionTokenExpiresAt(snapshot.token)
  return Number.isFinite(retrievedAt) && retrievedAt <= now && now - retrievedAt < maxAgeMs
    && (!requireToken || (expiresAt !== null && expiresAt > now))
}

export function independentInstitutionProfile(university, now = Date.now()) {
  return {
    university: normalizeUniversity(university), status: 'composite', retrievedAt: new Date(now).toISOString(),
    reviewers: [
      { id: 'composite-scientific', name: 'Scientific reviewer', role: 'Scientific reviewer', kind: 'composite', background: 'A fictional reviewer considering study design, feasibility, and whether the methods support the research question.', sourceUrls: [] },
      { id: 'composite-ethics', name: 'Ethics and consent reviewer', role: 'Ethics and consent reviewer', kind: 'composite', background: 'A fictional reviewer considering informed consent, participant understanding, confidentiality, and research burdens.', sourceUrls: [] },
      { id: 'composite-community', name: 'Community perspective', role: 'Community perspective', kind: 'composite', background: 'A fictional reviewer considering accessibility, recruitment communication, and practical participation barriers.', sourceUrls: [] },
    ],
    policies: [], sources: [],
    warnings: ['Independent research uses fictional composite reviewers. No university membership or policy is implied.'],
  }
}

/** Attach a current, server-signed institution snapshot before a personal run. */
export async function prepareInstitutionSimulationContext(context, university, {
  snapshot, fetchImpl = (...args) => globalThis.fetch(...args), provider, signal, now = () => Date.now(),
} = {}) {
  signal?.throwIfAborted()
  const existing = normalizeSimulationContext(context)
  // An existing study retains its institution when the researcher changes their
  // account preference. New and legacy chats inherit the current selection.
  const selected = normalizeUniversity(existing?.university || university)
  if (!selected) throw new Error('Choose your university before running an IRB simulation.')
  const currentTime = typeof now === 'function' ? now() : now
  const base = { ...(existing || {}), university: selected, institution: null, institutionToken: '' }
  if (selected.id === 'independent') {
    return normalizeSimulationContext({ ...base, institution: independentInstitutionProfile(selected, currentTime) })
  }
  const saved = { profile: existing?.institution, token: existing?.institutionToken }
  for (const candidate of [saved, snapshot]) {
    if (isInstitutionSnapshotFresh(candidate, selected, { now: currentTime })) {
      return normalizeSimulationContext({ ...base, institution: candidate.profile, institutionToken: candidate.token })
    }
  }
  if (provider !== undefined && !['openai', 'anthropic'].includes(provider)) {
    throw new Error('Choose OpenAI or Anthropic for this simulation.')
  }
  let response
  try {
    const deadline = AbortSignal.timeout(INSTITUTION_LOOKUP_TIMEOUT_MS)
    response = await fetchImpl('/api/institution', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ university: selected, ...(provider ? { provider } : {}) }),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
  } catch (cause) {
    signal?.throwIfAborted()
    throw new Error(cause?.name === 'TimeoutError'
      ? 'The university lookup took too long. Retry to check public IRB sources.'
      : 'University sources could not be retrieved. Retry before running the simulation.')
  }
  let result
  try { result = await response.json() } catch { /* A failed proxy may return HTML. */ }
  signal?.throwIfAborted()
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'University sources could not be retrieved. Retry before running the simulation.')
  if (!institutionSnapshotMatches(result?.profile, selected)) {
    throw new Error('The lookup returned sources for a different university. Refresh your university sources and try again.')
  }
  if (!Array.isArray(result.profile.reviewers) || typeof result.token !== 'string' || !result.token) {
    throw new Error('The university lookup did not return a signed reviewer profile. Connect an AI provider and retry.')
  }
  if (!isInstitutionSnapshotFresh(result, selected, { now: typeof now === 'function' ? now() : now })) {
    throw new Error('The university source verification expired. Refresh your university sources and try again.')
  }
  return normalizeSimulationContext({ ...base, institution: result.profile, institutionToken: result.token })
}

/** Shared onboarding/setup lookup; stateFactory can make the state reactive. */
export function createInstitutionProfileController({
  fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(),
  timeoutMs = INSTITUTION_LOOKUP_TIMEOUT_MS, stateFactory = value => value,
} = {}) {
  const state = stateFactory({ profile: null, token: '', state: 'idle', error: '', provider: '', model: '', signed: false })
  const cache = new Map()
  let scope = null
  let scopeKey = ''
  let request = null
  let generation = 0
  let disposed = false

  function cancel() {
    generation++
    request?.abort()
    request = null
  }

  function clear() {
    Object.assign(state, { profile: null, token: '', state: 'idle', error: '', provider: '', model: '', signed: false })
  }

  function apply(snapshot) {
    Object.assign(state, { ...snapshot, state: 'ready', error: '', signed: Boolean(snapshot.token) })
  }

  async function refresh() {
    if (disposed) return null
    cancel()
    clear()
    if (!scope?.accountId || !scope.university) return null
    if (scope.university.id === 'independent') {
      const snapshot = { profile: independentInstitutionProfile(scope.university, now()), token: '', provider: '', model: '' }
      apply(snapshot)
      return snapshot
    }
    const needsToken = scope.openaiConnected || scope.anthropicConnected
    const current = generation
    const currentKey = scopeKey
    const university = { ...scope.university }
    const controller = new AbortController()
    request = controller
    let timedOut = false
    const deadline = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    state.state = 'loading'
    try {
      const response = await fetchImpl(needsToken ? '/api/institution' : '/api/institution-preview', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ university }), signal: controller.signal,
      })
      let result
      try { result = await response.json() } catch { /* Account/proxy errors may not be JSON. */ }
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'University sources could not be retrieved. Please try again.')
      if (!institutionSnapshotMatches(result?.profile, university) || !Array.isArray(result.profile.reviewers) || (needsToken && (typeof result.token !== 'string' || !result.token))) {
        throw new Error('The university lookup returned an incomplete profile. Please try again.')
      }
      if (disposed || current !== generation || currentKey !== scopeKey || controller.signal.aborted) return null
      const snapshot = {
        profile: result.profile, token: needsToken ? result.token : '',
        provider: ['openai', 'anthropic', 'official-sources'].includes(result.provider) ? result.provider : '',
        model: typeof result.model === 'string' ? result.model : '',
      }
      cache.set(currentKey, snapshot)
      apply(snapshot)
      return snapshot
    } catch (cause) {
      if (disposed || current !== generation || currentKey !== scopeKey) return null
      state.state = 'fallback'
      state.error = timedOut
        ? 'The university lookup took too long. Retry to check public IRB sources.'
        : cause instanceof Error ? cause.message : 'University sources could not be retrieved. Please try again.'
      return null
    } finally {
      clearTimeout(deadline)
      if (request === controller) request = null
    }
  }

  function setScope(value) {
    if (disposed) return Promise.resolve(null)
    const accountId = typeof value?.accountId === 'string' && value.accountId.trim() ? value.accountId : null
    const next = {
      accountId, university: normalizeUniversity(value?.university),
      openaiConnected: value?.openaiConnected === true, anthropicConnected: value?.anthropicConnected === true,
    }
    const nextKey = JSON.stringify([accountId, next.university?.id, next.university?.name, next.openaiConnected, next.anthropicConnected])
    if (nextKey === scopeKey) return Promise.resolve(null)
    cancel()
    clear()
    if (scope?.accountId !== accountId) cache.clear()
    scope = next
    scopeKey = nextKey
    const snapshot = cache.get(nextKey)
    if (isInstitutionSnapshotFresh(snapshot, next.university, { now: now(), requireToken: next.openaiConnected || next.anthropicConnected })) {
      apply(snapshot)
      return Promise.resolve(snapshot)
    }
    return refresh()
  }

  function dispose() {
    disposed = true
    cancel()
    cache.clear()
  }

  return { state, setScope, refresh, dispose }
}
