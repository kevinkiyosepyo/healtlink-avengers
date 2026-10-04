import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useResearchTools } from '../src/composables/useResearchTools.js'

function browser(storage) {
  const original = globalThis.window
  const listeners = new Map()
  globalThis.window = { localStorage: storage, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) }
  return () => { globalThis.window = original }
}
const sourceData = name => ({ version: 1, documents: [{ id: name, name: `${name}.md`, kind: 'markdown', text: 'Written consent required.' }], reviews: [] })

test('unavailable browser storage still permits temporary library changes', () => {
  const securityError = Object.assign(new Error('Storage disabled'), { name: 'SecurityError' })
  const restore = browser({ getItem: () => { throw securityError }, setItem: () => { throw securityError } })
  const scope = effectScope()
  try {
    const tools = scope.run(() => useResearchTools(ref('account-a')))
    assert.equal(tools.save(sourceData('temporary')), true)
    assert.equal(tools.data.value.documents[0].id, 'temporary')
    assert.match(tools.warning.value, /only for this visit/)
  } finally { scope.stop(); restore() }
})

test('quota failures preserve the previous library and explain that new data was not saved', () => {
  const saved = JSON.stringify(sourceData('original'))
  const restore = browser({ getItem: () => saved, setItem: () => { throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' }) } })
  const scope = effectScope()
  try {
    const tools = scope.run(() => useResearchTools(ref('account-a')))
    assert.equal(tools.save(sourceData('replacement')), false)
    assert.equal(tools.data.value.documents[0].id, 'original')
    assert.match(tools.warning.value, /could not be saved/)
  } finally { scope.stop(); restore() }
})

test('account switches synchronously replace sources and concurrent tabs cannot overwrite newer data', () => {
  const values = new Map([['account-a:research-tools.v1', JSON.stringify(sourceData('private-a'))]])
  const restore = browser({ getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) })
  const scope = effectScope()
  try {
    const account = ref('account-a')
    const tools = scope.run(() => useResearchTools(account))
    assert.equal(tools.data.value.documents[0].id, 'private-a')
    account.value = 'account-b'
    assert.deepEqual(tools.data.value.documents, [])
    assert.equal(tools.save(sourceData('private-b')), true)
    assert.equal(JSON.parse(values.get('account-a:research-tools.v1')).documents[0].id, 'private-a')
    const otherTab = JSON.stringify(sourceData('newer-tab'))
    values.set('account-b:research-tools.v1', otherTab)
    assert.equal(tools.save(sourceData('stale-edit')), false)
    assert.equal(values.get('account-b:research-tools.v1'), otherTab)
    assert.match(tools.warning.value, /another tab/)
  } finally { scope.stop(); restore() }
})
