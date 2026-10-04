import test from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import { importPreflightFiles, PREFLIGHT_IMPORT_ACCEPT } from '../src/lib/preflightImports.js'

function file(name, content) {
  const bytes = typeof content === 'string' ? strToU8(content) : content
  return { name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer }
}
const archive = entries => file('Trial-Researcher-Onboarding-Case.zip', zipSync(Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, strToU8(text)]))))

test('the preflight picker accepts ZIP archives as well as text and Markdown', () => {
  assert.ok(PREFLIGHT_IMPORT_ACCEPT.split(',').includes('.zip'))
  assert.ok(PREFLIGHT_IMPORT_ACCEPT.split(',').includes('application/zip'))
})

test('imports a nine-chapter Markdown ZIP under a folder as nine complete documents', async () => {
  const entries = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`Trial-Researcher-Onboarding-Case/chapter-${i}.md`, `# Chapter ${i}\nStudy ID: REST-101\nVersion: 2.0`]))
  const { added, errors } = await importPreflightFiles([archive(entries)])
  assert.deepEqual(errors, [])
  assert.equal(added.length, 9)
  assert.equal(new Set(added.map(doc => doc.id)).size, 9)
  assert.deepEqual(added.map(doc => doc.name), Object.keys(entries))
  assert.deepEqual(added.map(doc => doc.text), Object.values(entries))
  assert.ok(added.every(doc => doc.kind === 'other' && doc.version === '2.0'))
})

test('infers document type from its filename, not an onboarding archive folder', async () => {
  const { added, errors } = await importPreflightFiles([archive({
    'onboarding-case/Protocol.md': 'Version: 1.0\nMethods',
    'onboarding-case/Consent.md': 'Consent text',
    'onboarding-case/Training.md': 'Course completion',
    'onboarding-case/Notes.md': 'Research notes',
    '__MACOSX/._Notes.md': 'ignored metadata',
  })])
  assert.deepEqual(errors, [])
  assert.deepEqual(added.map(doc => doc.kind), ['protocol', 'consent', 'training', 'other'])
})

test('preserves the preflight 100,000-character limit for direct and zipped documents', async () => {
  const text = 'A'.repeat(100000)
  for (const input of [file('study.md', text), archive({ 'study.md': text })]) {
    const { added, errors } = await importPreflightFiles([input])
    assert.deepEqual(errors, [])
    assert.equal(added[0].text, text)
  }
  const result = await importPreflightFiles([file('too-long.md', text + 'A')])
  assert.deepEqual(result.added, [])
  assert.match(result.errors[0], /100,000 characters/)
})

test('rejects a ZIP as a whole when its documents do not fit the remaining packet slots', async () => {
  const existingDocuments = Array.from({ length: 4 }, (_, i) => ({ id: `existing-${i}`, text: 'Existing document' }))
  const snapshot = structuredClone(existingDocuments)
  const entries = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`chapter-${i}.md`, 'Chapter']))
  const { added, errors } = await importPreflightFiles([archive(entries)], { existingDocuments })
  assert.deepEqual(added, [])
  assert.match(errors[0], /9 documents.*room for 8.*nothing from this archive/i)
  assert.deepEqual(existingDocuments, snapshot)
})

test('rejects packet overflow without adding some files from the ZIP', async () => {
  const existingDocuments = Array.from({ length: 5 }, () => ({ text: 'A'.repeat(100000) }))
  const { added, errors } = await importPreflightFiles([archive({ 'first.md': 'First', 'second.md': 'Second' })], { existingDocuments })
  assert.deepEqual(added, [])
  assert.match(errors[0], /500,000 character packet limit/)
})

test('reports corrupt or unsupported archives while still accepting another valid file', async () => {
  const { added, errors } = await importPreflightFiles([
    file('broken.zip', 'Not a ZIP'),
    archive({ 'study.md': 'Study', 'consent.pdf': '%PDF' }),
    file('good.md', '\uFEFF# Good study\r\nVersion: 1.0'),
  ])
  assert.equal(errors.length, 2)
  assert.match(errors[0], /ZIP.*invalid/)
  assert.match(errors[1], /text and Markdown inside ZIPs/)
  assert.deepEqual(added.map(doc => doc.name), ['good.md'])
  assert.equal(added[0].text, '# Good study\nVersion: 1.0')
})

test('enforces preflight file sizes before attempting to read a file', async () => {
  const arrayBuffer = () => { throw new Error('must not read') }
  const result = await importPreflightFiles([
    { name: 'large.md', size: 1024 * 1024 + 1, arrayBuffer },
    { name: 'large.zip', size: 15 * 1024 * 1024 + 1, arrayBuffer },
  ])
  assert.deepEqual(result.added, [])
  assert.match(result.errors[0], /1 MB/)
  assert.match(result.errors[1], /15 MB/)
})
