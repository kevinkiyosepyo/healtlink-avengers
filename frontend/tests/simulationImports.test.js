import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { importSimulationFile, inspectZip, IMPORT_LIMITS, validateSimulationContext } from '../src/lib/simulationImports.js'
const file = (name, data) => { const bytes = typeof data === 'string' ? strToU8(data) : data; return { name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer } }
const options = { id: () => 'document-id' }
const context = overrides => ({ overview: '', transcript: '', documents: [], ...overrides })
test('imports UTF-8 markdown without silently truncating context', async () => {
  const [doc] = await importSimulationFile(file('study.md', '\uFEFF# Study\r\nConsent process'), options)
  assert.deepEqual(doc, { id: 'document-id', name: 'study.md', kind: 'markdown', text: '# Study\nConsent process' })
  await assert.rejects(importSimulationFile(file('long.txt', 'a'.repeat(40001)), options), /40,000/)
  await assert.rejects(importSimulationFile(file('empty.txt', ' \n'), options), /no readable text/)
  await assert.rejects(importSimulationFile(file('binary.txt', new Uint8Array([255, 0])), options), /UTF-8/)
})
test('imports PDFs through the reader and rejects empty extracted content', async () => {
  const [doc] = await importSimulationFile(file('protocol.pdf', '%PDF'), { ...options, pdfReader: async bytes => { assert.equal(new TextDecoder().decode(bytes), '%PDF'); return 'Eligibility and consent.' } })
  assert.equal(doc.kind, 'pdf'); assert.equal(doc.text, 'Eligibility and consent.')
  await assert.rejects(importSimulationFile(file('scan.pdf', '%PDF'), { ...options, pdfReader: async () => '' }), /no readable text/)
})
test('imports a mixed ZIP and skips Mac metadata without losing path labels', async () => {
  const zipped = zipSync({ 'protocol/study.md': strToU8('# Methods'), 'notes.txt': strToU8('Questions'), '__MACOSX/._study.md': new Uint8Array([0, 1]) })
  const docs = await importSimulationFile(file('study.zip', zipped), options)
  assert.deepEqual(docs.map(doc => doc.name), ['protocol/study.md', 'notes.txt'])
  assert.deepEqual(docs.map(doc => doc.text), ['# Methods', 'Questions'])
})
test('rejects unsafe paths, nested archives, and excess documents before extraction', async () => {
  for (const path of ['../study.md', '/study.md', 'C:/study.md', 'folder\\study.md', './study.md']) await assert.rejects(importSimulationFile(file('bad.zip', zipSync({ [path]: strToU8('Study') })), options), /unsafe/)
  await assert.rejects(importSimulationFile(file('nested.zip', zipSync({ 'inside.zip': strToU8('x') })), options), /Nested ZIP/)
  const tooMany = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`study${i}.txt`, strToU8('Study')]))
  await assert.rejects(importSimulationFile(file('many.zip', zipSync(tooMany)), options), /more than 12/)
})
test('rejects oversized files and ZIP expansion metadata before allocating output', async () => {
  await assert.rejects(importSimulationFile({ name: 'big.pdf', size: IMPORT_LIMITS.fileBytes + 1, arrayBuffer() { throw new Error('must not read') } }), /15 MB/)
  const zipped = zipSync({ 'study.txt': strToU8('Study') }); const view = new DataView(zipped.buffer)
  const central = zipped.findIndex((_, i) => i <= zipped.length - 4 && view.getUint32(i, true) === 0x02014b50)
  view.setUint32(central + 24, IMPORT_LIMITS.expandedBytes + 1, true)
  assert.throws(() => inspectZip(zipped), /30 MB/)
})
test('rejects corrupted archives and CRC mismatches', async () => {
  assert.throws(() => inspectZip(new Uint8Array([1, 2, 3])), /incomplete/)
  const zipped = zipSync({ 'study.txt': strToU8('Study') }, { level: 0 }); zipped[30 + 'study.txt'.length] ^= 1
  await assert.rejects(importSimulationFile(file('corrupt.zip', zipped), options), /integrity/)
})
test('enforces document, transcript, overview, and combined context budgets', () => {
  assert.equal(validateSimulationContext(context()), '')
  assert.match(validateSimulationContext(context({ overview: 'a'.repeat(10001) })), /10,000/)
  assert.match(validateSimulationContext(context({ transcript: 'a'.repeat(40001) })), /40,000/)
  assert.match(validateSimulationContext(context({ documents: [{ name: 'blank', text: '' }] })), /readable text/)
  assert.match(validateSimulationContext(context({ documents: Array.from({ length: 13 }, () => ({ text: 'a' })) })), /12 documents/)
  assert.match(validateSimulationContext(context({ overview: 'a', documents: Array.from({ length: 3 }, () => ({ name: 'file', text: 'a'.repeat(40000) })) })), /120,000/)
})

test('rejects deceptive zero-size ZIP headers without unlimited output allocation', async () => {
  const zipped = zipSync({ 'study.txt': strToU8('A study with more than one character') })
  const view = new DataView(zipped.buffer)
  const central = zipped.findIndex((_, i) => i <= zipped.length - 4 && view.getUint32(i, true) === 0x02014b50)
  view.setUint32(central + 24, 0, true)
  await assert.rejects(importSimulationFile(file('deceptive.zip', zipped), options), /integrity/)
})
