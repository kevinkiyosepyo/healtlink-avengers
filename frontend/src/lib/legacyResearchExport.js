// Explicit recovery only: do not import the old storage adapters, which can
// create databases or delete orphaned records while loading them.
const STORES = [
  { name: 'microfish-library', store: 'documents', kind: 'documents', limit: 100 },
  { name: 'microfish-records', store: 'records', kind: 'records', limit: 1000 },
]
const MAX_BYTES = 32 * 1024 * 1024
const TIMEOUT_MS = 10000
const fields = (names, nested = {}) => ({ ...Object.fromEntries(names.split(' ').filter(Boolean).map(name => [name, true])), ...nested })
const estimate = fields('value low high')
const claim = fields('text strength uncited point to stance', { sources: [true] })
const source = fields('sid id database kind title venue venueType year doi pmid nct url abstract citations status relevance', {
  authors: [true], studyTypes: [true], alsoIn: [true],
  credibility: fields('score tier', { reasons: [true] }),
  foundBy: fields('database query'), location: fields('docId chunk start end line page'),
})
const recordSchema = fields('schemaVersion runId sessionId sessionTitle createdAt mode prompt error analysisKey disclaimer fingerprint', {
  guardrails: fields('local scope', { moderation: [true] }),
  provenance: fields('provider model requestedModel temperature seed promptVersion systemFingerprint latencyMs agents cached cachedFrom', { usage: fields('input output') }),
  analysis: fields('inScope reason', {
    assumptions: [true], caveats: [true],
    stances: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index + 1).padStart(2, '0'), fields('score confidence rationale')])),
  }),
  deliberation: fields('version error redacted latencyMs', {
    metric: fields('name unit'), queries: [true],
    retrieval: fields('retractedRemoved irrelevantDropped considered', { log: [fields('database query url ok count error')] }),
    library: fields('used error enabled'), web: fields('tool error used', { excluded: [fields('url title reason')] }),
    pack: [source], panel: [fields('id label lens')],
    openings: [fields('agent position calculation confidence', { estimate, claims: [claim] })],
    rebuttals: [fields('agent revised_position changed_mind confidence', { revised_estimate: estimate, responses: [claim] })],
    computed: fields('method weightedMean median min max agreement n'),
    consensus: fields('decision recommendation calculation confidence', { estimate, key_points: [claim], dissent: [fields('agent point')], evidence_gaps: [true] }),
    citationAudit: fields('invalidDropped uncited'), timings: fields('planMs gatherMs reused'),
  }),
})
const documentSchema = fields('id name type chars pages addedAt truncated', {
  chunks: [fields('index start end text line page')],
})

function safeUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|password|authorization|credential|signature/i.test(key)) url.searchParams.delete(key)
    }
    url.hash = ''
    return url.href
  } catch { return null }
}

// A field allowlist is applied at every level, including provenance and source
// metadata. Never copy arbitrary settings, request headers, vectors or tokens.
function project(value, schema, key = '', depth = 0) {
  if (depth > 16) throw new Error('An earlier record is too deeply nested to export safely.')
  if (value === null) return null
  if (schema === true) {
    if (typeof value === 'string') {
      if (value.length > 2_000_000) throw new Error('An earlier record contains too much text to export safely.')
      return key === 'url' ? safeUrl(value) : value
    }
    return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined
  }
  if (Array.isArray(schema)) {
    // Moderation is a status string or an array of category names.
    if (!Array.isArray(value)) return key === 'moderation' ? project(value, true) : undefined
    if (value.length > 1000) throw new Error('An earlier record contains too many entries to export safely.')
    return value.map(entry => project(entry, schema[0], '', depth + 1)).filter(entry => entry !== undefined)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result = {}
  for (const [name, child] of Object.entries(schema)) {
    if (!Object.hasOwn(value, name)) continue
    const exported = project(value[name], child, name, depth + 1)
    if (exported !== undefined) result[name] = exported
  }
  return result
}

function readExistingStore(indexedDB, spec, accept) {
  return new Promise((resolve, reject) => {
    let database
    let transaction
    let settled = false
    let disappeared = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      database?.close()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => {
      try { transaction?.abort() } catch { /* Already finished. */ }
      finish(new Error('Earlier browser data took too long to read. Close other Lookahead tabs and try again.'))
    }, TIMEOUT_MS)
    let request
    try { request = indexedDB.open(spec.name) } catch {
      finish(new Error('Earlier browser data could not be opened. Check this browser’s storage permissions.'))
      return
    }
    // Inventory and open can race with deletion in another tab. Abort any
    // upgrade transaction so this export never creates a replacement database.
    request.onupgradeneeded = () => { disappeared = true; request.transaction.abort() }
    request.onerror = () => finish(disappeared ? null : new Error('Earlier browser data could not be read. Please try again.'))
    request.onblocked = () => finish(new Error('Earlier browser data is busy. Close other Lookahead tabs and try again.'))
    request.onsuccess = () => {
      database = request.result
      if (settled) { database.close(); return }
      if (!database.objectStoreNames.contains(spec.store)) { finish(); return }
      try {
        transaction = database.transaction(spec.store, 'readonly')
        transaction.onerror = () => finish(new Error('Earlier browser data could not be read. No stored data was changed.'))
        transaction.onabort = () => finish(new Error('Reading earlier browser data was interrupted. No stored data was changed.'))
        transaction.oncomplete = () => finish()
        const cursor = transaction.objectStore(spec.store).openCursor()
        let count = 0
        cursor.onsuccess = () => {
          if (settled || !cursor.result) return
          try {
            if (++count > spec.limit) throw new Error(`Earlier data exceeds the export limit of ${spec.limit} ${spec.kind}. No stored data was changed.`)
            accept(spec.kind, cursor.result.value)
            cursor.result.continue()
          } catch (error) {
            finish(error)
            try { transaction.abort() } catch { /* Already finished. */ }
          }
        }
      } catch { finish(new Error('Earlier browser data could not be read. No stored data was changed.')) }
    }
  })
}

/** Called only by an explicit export action. No network, migration or writes. */
export async function exportLegacyResearch({ indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB?.databases || !indexedDB?.open) throw new Error('This browser cannot safely inspect earlier research storage. Try exporting in a current Chrome, Edge, Firefox or Safari browser on this device.')
  let inventory
  let timer
  try {
    inventory = await Promise.race([
      indexedDB.databases(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS) }),
    ])
  } catch { throw new Error('Earlier browser storage is unavailable. Check storage permissions and try again.') }
  finally { clearTimeout(timer) }
  const names = new Set(inventory.map(item => item.name))
  const data = { documents: [], records: [] }
  let bytes = 0
  let invalid = 0
  const accept = (kind, raw) => {
    if (!raw || typeof raw !== 'object' || (kind === 'documents' ? typeof raw.id !== 'string' || !Array.isArray(raw.chunks) : typeof raw.runId !== 'string')) { invalid++; return }
    const entry = project(raw, kind === 'documents' ? documentSchema : recordSchema)
    bytes += new TextEncoder().encode(JSON.stringify(entry)).byteLength
    if (bytes > MAX_BYTES) throw new Error('Earlier data exceeds the 32 MB export limit. No stored data was changed.')
    data[kind].push(entry)
  }
  for (const spec of STORES) if (names.has(spec.name)) await readExistingStore(indexedDB, spec, accept)
  const warnings = [
    'Earlier data belongs to this browser profile, not a verified account. It has not been imported into your current workspace.',
    'Only research fields are exported. Provider settings, credentials, authorization tokens and embedding vectors are excluded. Source text is preserved as stored; review it before sharing.',
    'Original record fingerprints are retained for reference and are not signatures of this filtered archive. Document chunks may overlap; original uploaded files are not stored.',
    ...(invalid ? [`${invalid} malformed earlier entries could not be exported.`] : []),
  ]
  const documentCount = data.documents.length
  const recordCount = data.records.length
  return {
    status: documentCount || recordCount ? 'ready' : 'empty', documentCount, recordCount, warnings,
    archive: documentCount || recordCount ? { schemaVersion: 1, kind: 'microfish-earlier-browser-research', exportedAt: new Date().toISOString(), warnings, ...data } : null,
  }
}
