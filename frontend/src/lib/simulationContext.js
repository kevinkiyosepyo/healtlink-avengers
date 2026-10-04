import { validateAgentCount } from '../../../shared/reviewAgents.js'

// Research source material is never shortened silently. The caller can show a
// validation error and let the researcher decide what to remove or revise.
export const CONTEXT_LIMITS = Object.freeze({
  documents: 12,
  documentText: 40000,
  overview: 10000,
  transcript: 40000,
  totalText: 120000,
  institution: 50000,
  institutionToken: 80000,
})

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function text(value, field, limit, { required = false } = {}) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string') throw new Error(`${field} must be text.`)
  if (value.length > limit) throw new Error(`${field} must be ${limit.toLocaleString('en-US')} characters or fewer.`)
  if (required && !value.trim()) throw new Error(`${field} is required.`)
  return value
}

function cloneInstitution(value, depth = 0, seen = new Set()) {
  if (depth > 10) throw new Error('The institution profile has too many nested fields.')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || seen.has(value)) throw new Error('The institution profile must contain valid JSON data.')
  seen.add(value)
  const result = Array.isArray(value) ? [] : {}
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('The institution profile must contain plain data.')
  }
  const entries = Object.entries(value)
  if (entries.length > 1000) throw new Error('The institution profile has too many fields.')
  for (const [key, entry] of entries) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('The institution profile contains an invalid field.')
    result[key] = cloneInstitution(entry, depth + 1, seen)
  }
  seen.delete(value)
  return result
}

export function simulationContextTextLength(context) {
  return (context?.overview?.length || 0) + (context?.transcript?.length || 0)
    + (context?.documents || []).reduce((sum, document) => sum + (document.text?.length || 0), 0)
}

/** Return an independent, validated context; throw without modifying the input. */
export function normalizeSimulationContext(raw) {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) throw new Error('Simulation setup must be an object.')
  const overview = text(raw.overview, 'Study overview', CONTEXT_LIMITS.overview)
  const transcript = text(raw.transcript, 'Dictation transcript', CONTEXT_LIMITS.transcript)
  if (raw.documents !== undefined && !Array.isArray(raw.documents)) throw new Error('Imported documents must be a list.')
  const rawDocuments = raw.documents || []
  if (rawDocuments.length > CONTEXT_LIMITS.documents) throw new Error(`Use up to ${CONTEXT_LIMITS.documents} documents per simulation.`)
  const ids = new Set()
  const documents = rawDocuments.map((document, index) => {
    if (!isRecord(document)) throw new Error(`Document ${index + 1} is invalid.`)
    const id = text(document.id, `Document ${index + 1} ID`, 120, { required: true })
    if (ids.has(id)) throw new Error('Each imported document must have a unique ID.')
    ids.add(id)
    return {
      id,
      name: text(document.name, `Document ${index + 1} name`, 300, { required: true }),
      kind: text(document.kind, `Document ${index + 1} type`, 40, { required: true }),
      text: text(document.text, `Text in ${document.name}`, CONTEXT_LIMITS.documentText, { required: true }),
    }
  })
  let university = null
  if (raw.university !== null && raw.university !== undefined) {
    if (!isRecord(raw.university)) throw new Error('Choose a valid university for this simulation.')
    university = {
      id: text(raw.university.id, 'University ID', 120, { required: true }),
      name: text(raw.university.name, 'University name', 240, { required: true }),
    }
  }
  let institution = null
  if (raw.institution !== null && raw.institution !== undefined) {
    if (!isRecord(raw.institution)) throw new Error('The institution profile must be an object.')
    institution = cloneInstitution(raw.institution)
    if (JSON.stringify(institution).length > CONTEXT_LIMITS.institution) throw new Error('The institution profile is too large. Refresh the institution sources.')
  }
  const institutionToken = text(raw.institutionToken, 'Institution verification token', CONTEXT_LIMITS.institutionToken)
  if ((institution || institutionToken) && !university) throw new Error('The institution profile needs its university selection.')
  const agentCount = raw.agentCount === undefined ? undefined : validateAgentCount(raw.agentCount)
  const context = { overview, transcript, documents, university, institution, institutionToken, ...(agentCount === undefined ? {} : { agentCount }) }
  if (simulationContextTextLength(context) > CONTEXT_LIMITS.totalText) {
    throw new Error(`The study overview, dictation, and documents together must be ${CONTEXT_LIMITS.totalText.toLocaleString('en-US')} characters or fewer.`)
  }
  if (!overview.trim() && !transcript.trim() && !documents.length && !university && !institution && !institutionToken && agentCount === undefined) return null
  return context
}

export function validateSimulationContext(raw) {
  try {
    return { valid: true, context: normalizeSimulationContext(raw), error: '' }
  } catch (error) {
    return { valid: false, context: null, error: error instanceof Error ? error.message : 'The simulation setup could not be read.' }
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export function snapshotSimulationContext(raw) {
  return deepFreeze(normalizeSimulationContext(raw))
}
