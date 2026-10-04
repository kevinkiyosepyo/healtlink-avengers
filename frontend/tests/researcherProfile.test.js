import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNIVERSITIES,
  normalizeUniversity,
  universityStorageKey,
  readResearcherUniversity,
  saveResearcherUniversity,
} from '../src/lib/researcherProfile.js'

function storageFixture() {
  const values = new Map()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('starter catalogue has unique IDs, search aliases, UCSF and every UC campus', () => {
  assert.ok(UNIVERSITIES.length >= 25 && UNIVERSITIES.length <= 35)
  assert.equal(new Set(UNIVERSITIES.map(university => university.id)).size, UNIVERSITIES.length)
  for (const university of UNIVERSITIES) {
    assert.equal(typeof university.name, 'string')
    assert.ok(university.name.length > 0)
    assert.ok(Array.isArray(university.aliases))
    assert.ok(university.aliases.every(alias => typeof alias === 'string'))
  }
  assert.equal(UNIVERSITIES.filter(university => university.id.startsWith('uc-')).length, 10)
  assert.ok(UNIVERSITIES.find(university => university.aliases.includes('UCSF')))
  assert.ok(UNIVERSITIES.find(university => university.aliases.includes('UC San Diego')))
})

test('known IDs and independent researchers receive canonical names and no extra properties', () => {
  assert.deepEqual(normalizeUniversity('uc-san-francisco'), {
    id: 'uc-san-francisco', name: 'University of California, San Francisco',
  })
  assert.deepEqual(normalizeUniversity({ id: 'stanford', name: 'Incorrect name', role: 'admin' }), {
    id: 'stanford', name: 'Stanford University',
  })
  assert.deepEqual(normalizeUniversity({ id: 'independent', name: 'Ignore this' }), {
    id: 'independent', name: 'Independent researcher',
  })
  const result = normalizeUniversity('stanford')
  result.name = 'Changed locally'
  assert.equal(normalizeUniversity('stanford').name, 'Stanford University')
})

test('custom institutions normalize whitespace and allow international names up to 120 characters', () => {
  assert.deepEqual(normalizeUniversity({ id: 'other', name: '  Université   de Montréal  ' }), {
    id: 'other', name: 'Université de Montréal',
  })
  assert.deepEqual(normalizeUniversity({ id: 'other', name: '東京大学' }), { id: 'other', name: '東京大学' })
  assert.equal(normalizeUniversity({ id: 'other', name: ` ${'A'.repeat(120)} ` }).name.length, 120)
  assert.equal(normalizeUniversity({ id: 'other', name: 'A'.repeat(121) }), null)
})

test('invalid university selections and custom control characters are rejected', () => {
  const invalid = [
    null, undefined, false, 42, [], {}, { id: 42 }, 'unknown',
    { id: 'unknown', name: 'Stanford University' },
    { id: 'other' }, { id: 'other', name: 42 }, { id: 'other', name: '  ' },
    ...['\n', '\t', '\r', '\0', '\u007f', '\u0085'].map(control => ({ id: 'other', name: `Example${control}University` })),
  ]
  for (const value of invalid) assert.equal(normalizeUniversity(value), null, JSON.stringify(value))
})

test('account keys use the workspace scope and do not alias encoded account IDs', () => {
  assert.equal(universityStorageKey('researcher/a'), 'microfish.researcher-profile.v1.account.researcher%2Fa')
  assert.notEqual(universityStorageKey('researcher/a'), universityStorageKey('researcher%2Fa'))
  assert.notEqual(universityStorageKey('alice'), universityStorageKey(' alice '))
  for (const id of [null, undefined, '', '  ', 1, {}, false]) assert.equal(universityStorageKey(id), null)
})

test('university profiles persist independently for each account without touching the demo key', () => {
  const storage = storageFixture()
  const demoKey = 'microfish.researcher-profile.v1'
  storage.setItem(demoKey, 'Existing demo data')
  assert.deepEqual(readResearcherUniversity(storage, 'alice'), { university: null, error: '' })
  assert.deepEqual(saveResearcherUniversity(storage, 'alice', 'uc-san-diego'), {
    university: { id: 'uc-san-diego', name: 'University of California, San Diego' }, error: '',
  })
  saveResearcherUniversity(storage, 'bob', { id: 'other', name: 'Example University' })
  assert.equal(readResearcherUniversity(storage, 'alice').university.id, 'uc-san-diego')
  assert.equal(readResearcherUniversity(storage, 'bob').university.name, 'Example University')
  assert.deepEqual(JSON.parse(storage.getItem(universityStorageKey('alice'))), {
    version: 1, university: { id: 'uc-san-diego', name: 'University of California, San Diego' },
  })
  assert.equal(storage.getItem(demoKey), 'Existing demo data')
})

test('anonymous and invalid account operations never access storage', () => {
  let calls = 0
  const storage = {
    getItem() { calls += 1; throw new Error('Unexpected read') },
    setItem() { calls += 1; throw new Error('Unexpected write') },
  }
  for (const accountId of [null, undefined, '', '  ', 42]) {
    assert.deepEqual(readResearcherUniversity(storage, accountId), { university: null, error: '' })
    const result = saveResearcherUniversity(storage, accountId, 'stanford')
    assert.equal(result.university, null)
    assert.match(result.error, /Sign in/)
  }
  assert.equal(calls, 0)
})

test('invalid saves preserve the existing account selection', () => {
  const storage = storageFixture()
  saveResearcherUniversity(storage, 'alice', 'stanford')
  const original = storage.getItem(universityStorageKey('alice'))
  for (const selection of ['unknown', { id: 'other', name: '\n' }, null]) {
    const result = saveResearcherUniversity(storage, 'alice', selection)
    assert.equal(result.university, null)
    assert.match(result.error, /Choose a university/)
    assert.equal(storage.getItem(universityStorageKey('alice')), original)
  }
})

test('corrupt or unsupported stored profiles require re-selection without deleting stored data', () => {
  const storage = storageFixture()
  const key = universityStorageKey('alice')
  for (const raw of [
    '', 'broken JSON', 'null', '[]', '{}',
    JSON.stringify({ version: 2, university: 'stanford' }),
    JSON.stringify({ version: 1, university: { id: 'unknown', name: 'Unknown University' } }),
    JSON.stringify({ version: 1, university: { id: 'other', name: 'A'.repeat(121) } }),
  ]) {
    storage.setItem(key, raw)
    const result = readResearcherUniversity(storage, 'alice')
    assert.equal(result.university, null)
    assert.match(result.error, /could not be restored.*choose your university again/)
    assert.equal(storage.getItem(key), raw)
  }
  storage.setItem(key, JSON.stringify({ version: 1, university: { id: 'stanford', name: 'Outdated name' } }))
  assert.deepEqual(readResearcherUniversity(storage, 'alice'), {
    university: { id: 'stanford', name: 'Stanford University' }, error: '',
  })
})

test('blocked browser storage reports actionable warnings and retains a valid selection for this visit', () => {
  const storage = {
    getItem() { throw new Error('Storage denied') },
    setItem() { throw new Error('Quota exceeded') },
  }
  const read = readResearcherUniversity(storage, 'alice')
  assert.equal(read.university, null)
  assert.match(read.error, /could not be read.*choose your university again/)
  const saved = saveResearcherUniversity(storage, 'alice', 'stanford')
  assert.deepEqual(saved.university, { id: 'stanford', name: 'Stanford University' })
  assert.match(saved.error, /only kept for this visit/)
  assert.match(readResearcherUniversity(null, 'alice').error, /could not be read/)
  assert.equal(saveResearcherUniversity(null, 'alice', 'stanford').university.id, 'stanford')
})
