import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { workspaceStorageKey } from '../src/lib/workspaceStorage.js'
import { createWorkspaceController, STORAGE_KEY } from '../src/lib/simulationWorkspace.js'
import { createScopedSimulationWorkspace } from '../src/composables/useSimulationWorkspace.js'

function browserFixture() {
  const saved = new Map()
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  function eventTarget() {
    const listeners = new Map()
    return {
      listeners,
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(callback)
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback) },
      emit(type, event = {}) { for (const callback of listeners.get(type) || []) callback(event) },
    }
  }
  const windowTarget = eventTarget()
  const documentTarget = eventTarget()
  const timers = new Map()
  let timerId = 0
  windowTarget.setInterval = callback => { timers.set(++timerId, callback); return timerId }
  windowTarget.clearInterval = id => timers.delete(id)
  return { storage, saved, windowTarget, documentTarget, timers }
}

test('demo keeps legacy storage keys and account IDs remain distinct after encoding', () => {
  assert.equal(workspaceStorageKey(STORAGE_KEY), STORAGE_KEY)
  assert.equal(workspaceStorageKey(STORAGE_KEY, null), STORAGE_KEY)
  assert.equal(workspaceStorageKey(STORAGE_KEY, ''), STORAGE_KEY)
  const keys = ['researcher/a', 'researcher%2Fa', 'researcher.a', '研究者', 'researcher:b'].map(id => workspaceStorageKey(STORAGE_KEY, id))
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(workspaceStorageKey(STORAGE_KEY, 'researcher/a'), `${STORAGE_KEY}.account.researcher%2Fa`)
  assert.equal(workspaceStorageKey(STORAGE_KEY, 'same-account'), workspaceStorageKey(STORAGE_KEY, 'same-account'))
})

test('account controller writes cannot overwrite demo or another account, or trigger false conflicts', () => {
  const { storage } = browserFixture()
  const aliceKey = workspaceStorageKey(STORAGE_KEY, 'alice')
  const bobKey = workspaceStorageKey(STORAGE_KEY, 'bob')
  const demo = createWorkspaceController({ storage })
  const alice = createWorkspaceController({ storage, storageKey: aliceKey })
  const bob = createWorkspaceController({ storage, storageKey: bobKey })
  demo.setDraft(demo.state.activeId, 'Demo draft')
  const demoSnapshot = storage.getItem(STORAGE_KEY)
  alice.setDraft(alice.state.activeId, 'Alice draft')
  bob.setDraft(bob.state.activeId, 'Bob draft')
  assert.equal(storage.getItem(STORAGE_KEY), demoSnapshot)
  assert.equal(alice.state.storageWarning, '')
  assert.equal(bob.state.storageWarning, '')
  assert.equal(createWorkspaceController({ storage, storageKey: aliceKey }).state.sessions[0].draft, 'Alice draft')
  assert.equal(createWorkspaceController({ storage, storageKey: bobKey }).state.sessions[0].draft, 'Bob draft')
  assert.equal(createWorkspaceController({ storage }).state.sessions[0].draft, 'Demo draft')

  const staleAlice = createWorkspaceController({ storage, storageKey: aliceKey })
  alice.setDraft(alice.state.activeId, 'New Alice draft')
  staleAlice.setDraft(staleAlice.state.activeId, 'Stale Alice draft')
  assert.match(staleAlice.state.storageWarning, /changed in another tab/)
  assert.equal(createWorkspaceController({ storage, storageKey: aliceKey }).state.sessions[0].draft, 'New Alice draft')
})

test('changing the active storage ref saves and restores each workspace without adding timers or listeners', () => {
  const browser = browserFixture()
  const key = ref(STORAGE_KEY)
  const workspace = createScopedSimulationWorkspace({ ...browser, storageKey: key })
  try {
    const demo = workspace.activeSession.value
    demo.draft = 'Existing anonymous demo work'
    const demoRun = workspace.startRun(demo.id, 'A fictional scenario')
    key.value = workspaceStorageKey(STORAGE_KEY, 'alice')
    assert.equal(demoRun.status, 'stopped')
    assert.equal(workspace.activeSession.value.messages.length, 0)
    assert.equal(workspace.runningCount.value, 0)
    const alice = workspace.activeSession.value
    alice.draft = 'Alice personal research'
    workspace.renameSession(alice.id, 'Alice project')
    key.value = workspaceStorageKey(STORAGE_KEY, 'bob')
    assert.equal(workspace.activeSession.value.draft, '')
    workspace.activeSession.value.draft = 'Bob personal research'
    key.value = workspaceStorageKey(STORAGE_KEY, 'alice')
    assert.equal(workspace.activeSession.value.draft, 'Alice personal research')
    assert.equal(workspace.activeSession.value.title, 'Alice project')
    key.value = STORAGE_KEY
    assert.equal(workspace.activeSession.value.id, demo.id)
    assert.equal(workspace.activeSession.value.messages[0].content, 'A fictional scenario')
    assert.equal(workspace.activeSession.value.runs[0].status, 'stopped')
    assert.equal(browser.timers.size, 1)
    assert.equal(browser.windowTarget.listeners.get('storage').size, 1)
    assert.equal(browser.windowTarget.listeners.get('pagehide').size, 1)
    assert.equal(browser.documentTarget.listeners.get('visibilitychange').size, 1)
  } finally { workspace.dispose() }
  assert.equal(browser.timers.size, 0)
  for (const callbacks of browser.windowTarget.listeners.values()) assert.equal(callbacks.size, 0)
  for (const callbacks of browser.documentTarget.listeners.values()) assert.equal(callbacks.size, 0)
  const storedCount = browser.saved.size
  key.value = workspaceStorageKey(STORAGE_KEY, 'after-disposal')
  assert.equal(browser.saved.size, storedCount, 'scope watcher is removed on disposal')
})

test('scope switch aborts AI requests and late results cannot appear in either account', async () => {
  const browser = browserFixture()
  const key = ref(workspaceStorageKey(STORAGE_KEY, 'alice'))
  const calls = []
  const workspace = createScopedSimulationWorkspace({
    ...browser,
    storageKey: key,
    fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })),
  })
  try {
    const original = workspace.activeSession.value
    const run = workspace.startOpenAIRun(original.id, 'Alice confidential research question')
    key.value = workspaceStorageKey(STORAGE_KEY, 'bob')
    assert.equal(calls[0].options.signal.aborted, true)
    assert.equal(run.status, 'stopped')
    calls[0].resolve({ ok: true, json: async () => ({ content: 'Late Alice answer' }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(workspace.activeSession.value.messages.length, 0)
    key.value = workspaceStorageKey(STORAGE_KEY, 'alice')
    assert.equal(workspace.activeSession.value.runs[0].status, 'stopped')
    assert.doesNotMatch(workspace.activeSession.value.messages[1].content, /Late Alice answer/)
    assert.equal(workspace.activeSession.value.draft, 'Alice confidential research question')
  } finally { workspace.dispose() }
})

test('storage events check only the currently selected account scope', () => {
  const browser = browserFixture()
  const aliceKey = workspaceStorageKey(STORAGE_KEY, 'alice')
  const workspace = createScopedSimulationWorkspace({ ...browser, storageKey: aliceKey })
  try {
    browser.storage.setItem(STORAGE_KEY, 'An unrelated demo changed')
    browser.windowTarget.emit('storage', { key: STORAGE_KEY, storageArea: browser.storage })
    assert.equal(workspace.storageWarning.value, '')
    browser.storage.setItem(aliceKey, 'Alice changed in another tab')
    browser.windowTarget.emit('storage', { key: aliceKey, storageArea: browser.storage })
    assert.match(workspace.storageWarning.value, /changed in another tab/)
  } finally { workspace.dispose() }
})
