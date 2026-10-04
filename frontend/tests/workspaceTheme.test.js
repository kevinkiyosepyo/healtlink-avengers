import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { initializeWorkspaceTheme, useWorkspaceTheme, WORKSPACE_THEME_KEY } from '../src/composables/useWorkspaceTheme.js'

function documentStub() {
  const meta = { content: '', setAttribute(name, value) { this[name] = value } }
  return {
    documentElement: { dataset: {}, style: {} },
    querySelector: () => meta,
    meta,
  }
}

const bootstrap = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8')

test('saved appearance is applied before the app loads, with safe light fallbacks', () => {
  for (const [saved, expected] of [['"dark"', 'dark'], ['"light"', 'light'], [null, 'light'], ['broken JSON', 'light'], ['"other"', 'light']]) {
    const document = documentStub()
    vm.runInNewContext(bootstrap, { document, localStorage: { getItem: () => saved } })
    assert.equal(document.documentElement.dataset.theme, expected)
    assert.equal(document.documentElement.style.colorScheme, expected)
    assert.equal(document.meta.content, expected === 'dark' ? '#12110f' : '#ffffff')
  }
  const document = documentStub()
  vm.runInNewContext(bootstrap, { document, get localStorage() { throw new Error('Site data blocked') } })
  assert.equal(document.documentElement.dataset.theme, 'light')
})

test('appearance is shared between controls and tabs without navigation or account writes', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const stored = new Map([[WORKSPACE_THEME_KEY, '"dark"'], ['microfish:account', 'signed-in'], ['microfish:workspace', 'draft and running simulations']])
  const listeners = new Map()
  const document = documentStub()
  let blocked = false
  const window = {
    location: { href: 'https://example.test/#/case' },
    get localStorage() {
      if (blocked) throw new Error('Site data blocked')
      return {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      }
    },
    addEventListener(name, callback) { listeners.set(name, callback) },
  }
  globalThis.window = window
  globalThis.document = document
  try {
    initializeWorkspaceTheme()
    const first = useWorkspaceTheme()
    const second = useWorkspaceTheme()
    assert.equal(first.theme.value, 'dark')
    first.setTheme('light')
    assert.equal(second.theme.value, 'light')
    assert.equal(document.documentElement.dataset.theme, 'light')
    second.setTheme('dark')
    assert.equal(first.theme.value, 'dark')
    assert.equal(stored.get(WORKSPACE_THEME_KEY), '"dark"')
    assert.equal(window.location.href, 'https://example.test/#/case')
    assert.equal(stored.get('microfish:account'), 'signed-in')
    assert.equal(stored.get('microfish:workspace'), 'draft and running simulations')

    stored.set(WORKSPACE_THEME_KEY, '"light"')
    listeners.get('storage')({ key: WORKSPACE_THEME_KEY })
    assert.equal(first.theme.value, 'light')
    first.setTheme('dark')
    listeners.get('storage')({ key: 'unrelated-setting' })
    assert.equal(first.theme.value, 'dark')
    stored.delete(WORKSPACE_THEME_KEY)
    listeners.get('storage')({ key: null })
    assert.equal(first.theme.value, 'light')

    blocked = true
    assert.doesNotThrow(() => second.setTheme('dark'))
    assert.equal(first.theme.value, 'dark')
    assert.equal(document.documentElement.dataset.theme, 'dark')
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})
