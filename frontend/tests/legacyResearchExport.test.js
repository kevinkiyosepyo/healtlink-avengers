import test from 'node:test'
import assert from 'node:assert/strict'
import { exportLegacyResearch } from '../src/lib/legacyResearchExport.js'

function browserStorage(stores = {}, { disappeared = false, blocked = false } = {}) {
  const calls = { opened: [], modes: [], closed: [], aborted: 0 }
  const indexedDB = {
    databases: async () => Object.keys(stores).map(name => ({ name, version: 1 })),
    open(name) {
      calls.opened.push(name)
      const request = {}
      queueMicrotask(() => {
        if (blocked) { request.onblocked(); return }
        if (disappeared) {
          request.transaction = { abort() { calls.aborted++; queueMicrotask(() => request.onerror()) } }
          request.onupgradeneeded()
          return
        }
        request.result = {
          objectStoreNames: { contains: key => Object.hasOwn(stores[name], key) },
          close: () => calls.closed.push(name),
          transaction(key, mode) {
            calls.modes.push(mode)
            let aborted = false
            const transaction = {
              abort() { aborted = true; calls.aborted++; queueMicrotask(() => transaction.onabort?.()) },
              objectStore() {
                return {
                  openCursor() {
                    const cursor = {}
                    let index = 0
                    const advance = () => queueMicrotask(() => {
                      if (aborted) return
                      const value = stores[name][key][index++]
                      cursor.result = value === undefined ? null : { value, continue: advance }
                      cursor.onsuccess?.()
                      if (!cursor.result) queueMicrotask(() => transaction.oncomplete?.())
                    })
                    advance()
                    return cursor
                  },
                }
              },
            }
            return transaction
          },
        }
        request.onsuccess()
      })
      return request
    },
  }
  return { indexedDB, calls }
}

test('empty browser inventory never opens or creates a database', async () => {
  const { indexedDB, calls } = browserStorage({ 'unrelated-app': { secrets: [] } })
  const result = await exportLegacyResearch({ indexedDB })
  assert.equal(result.status, 'empty')
  assert.equal(result.archive, null)
  assert.deepEqual(calls.opened, [])
})

test('unsupported inventory fails clearly instead of probing names and creating databases', async () => {
  let opened = false
  await assert.rejects(exportLegacyResearch({ indexedDB: { open() { opened = true } } }), /cannot safely inspect/)
  assert.equal(opened, false)
  await assert.rejects(exportLegacyResearch({ indexedDB: { databases: async () => { throw new Error('private') }, open() {} } }), /storage is unavailable/)
})

test('export preserves actual document excerpts and cited research provenance using readonly transactions', async () => {
  const document = {
    id: 'doc', name: 'Protocol.pdf', type: 'pdf', chars: 34, pages: 1, addedAt: '2026-10-03T00:00:00Z', truncated: false,
    chunks: [{ index: 0, start: 0, end: 34, text: 'Consent must be voluntary.', line: 1, page: 1, apiKey: 'chunk-secret' }],
    vectors: [new Float32Array([1, 2, 3])], apiKey: 'document-secret', institutionToken: 'document-token',
  }
  const record = {
    schemaVersion: 2, runId: 'run', sessionId: 'chat', sessionTitle: 'Consent', prompt: 'Review the consent process', fingerprint: 'original-fingerprint',
    apiKey: 'root-secret', settings: { apiKey: 'settings-secret' },
    guardrails: { local: 'pass', moderation: 'pass', apiKey: 'guardrail-secret' },
    provenance: { model: 'research-model', usage: { input: 42, output: 17, token: 'usage-secret' }, headers: { Authorization: 'header-secret' } },
    analysis: { stances: { '02': { score: 3, confidence: 0.8, rationale: 'Consent is recorded.', credential: 'stance-secret' } } },
    deliberation: {
      pack: [{ sid: 'S1', title: 'Consent study', abstract: 'Consent information was checked.', url: 'https://example.edu/paper?topic=consent&api_key=source-secret#token', location: { docId: 'doc', line: 1, page: 1 }, authorization: 'source-token' }],
      openings: [{ agent: 'regulatory', position: 'Check understanding.', claims: [{ text: 'Consent information was checked.', sources: ['S1'], accessToken: 'claim-token' }] }],
      consensus: { decision: 'Improve understanding checks.', key_points: [{ text: 'Check understanding.', sources: ['S1'] }], evidence_gaps: ['Small evidence base'] },
      citationAudit: { invalidDropped: 0, uncited: 0 },
    },
  }
  const original = structuredClone({ document, record })
  const { indexedDB, calls } = browserStorage({ 'microfish-library': { documents: [document] }, 'microfish-records': { records: [record] } })
  const result = await exportLegacyResearch({ indexedDB })
  assert.equal(result.status, 'ready')
  assert.equal(result.documentCount, 1)
  assert.equal(result.recordCount, 1)
  assert.deepEqual(calls.modes, ['readonly', 'readonly'])
  assert.equal(calls.closed.length, 2)
  assert.equal(calls.aborted, 0)
  assert.equal(result.archive.documents[0].chunks[0].text, 'Consent must be voluntary.')
  const exported = result.archive.records[0]
  assert.equal(exported.guardrails.moderation, 'pass')
  assert.equal(exported.provenance.model, 'research-model')
  assert.deepEqual(exported.provenance.usage, { input: 42, output: 17 })
  assert.deepEqual(exported.deliberation.consensus.key_points[0].sources, ['S1'])
  assert.equal(exported.deliberation.pack[0].url, 'https://example.edu/paper?topic=consent')
  assert.equal(exported.fingerprint, 'original-fingerprint')
  assert.doesNotMatch(JSON.stringify(result.archive), /-secret|source-token|claim-token|document-token|"vectors"|apiKey|accessToken|Authorization/)
  assert.deepEqual({ document, record }, original)
  assert.ok(result.warnings.some(warning => warning.includes('not a verified account')))
})

test('a database deleted after inventory is not recreated by the export', async () => {
  const { indexedDB, calls } = browserStorage({ 'microfish-library': { documents: [] } }, { disappeared: true })
  const result = await exportLegacyResearch({ indexedDB })
  assert.equal(result.status, 'empty')
  assert.equal(calls.aborted, 1)
  assert.deepEqual(calls.modes, [])
})

test('blocked storage yields an actionable error without deleting or upgrading it', async () => {
  const { indexedDB, calls } = browserStorage({ 'microfish-records': { records: [] } }, { blocked: true })
  await assert.rejects(exportLegacyResearch({ indexedDB }), /Close other Lookahead tabs/)
  assert.equal(calls.aborted, 0)
})

test('malformed entries are reported while readable records remain exportable', async () => {
  const { indexedDB } = browserStorage({ 'microfish-records': { records: [null, { broken: true }, { runId: 'saved', prompt: 'Study question' }] } })
  const result = await exportLegacyResearch({ indexedDB })
  assert.equal(result.recordCount, 1)
  assert.ok(result.warnings.some(warning => warning.startsWith('2 malformed')))
})

test('oversized stores fail without silently truncating an archive or changing originals', async () => {
  const documents = Array.from({ length: 101 }, (_, id) => ({ id: String(id), name: 'protocol', chunks: [] }))
  const { indexedDB, calls } = browserStorage({ 'microfish-library': { documents } })
  await assert.rejects(exportLegacyResearch({ indexedDB }), /limit of 100 documents/)
  assert.equal(documents.length, 101)
  assert.equal(calls.aborted, 1)
  const oversized = browserStorage({ 'microfish-records': { records: [{ runId: 'huge', prompt: 'x'.repeat(2_000_001) }] } })
  await assert.rejects(exportLegacyResearch({ indexedDB: oversized.indexedDB }), /too much text/)
})
