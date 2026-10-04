import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer } from 'vue'
import { useResearcherAccount } from '../src/composables/useResearcherAccount.js'

const drainRequests = () => new Promise(resolve => setImmediate(resolve))

function mountAccount(t, fetchImpl) {
  const originalWindow = globalThis.window
  const browser = new EventTarget()
  browser.location = { origin: 'https://microfish.test', pathname: '/', search: '', hash: '#/login' }
  globalThis.window = browser
  t.mock.method(globalThis, 'fetch', fetchImpl)
  // This component has no UI. Mounting it exercises the composable's actual
  // mounted/focus/unmounted lifecycle without a browser or DOM dependency.
  const renderer = createRenderer({
    createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null,
  })
  let account
  const app = renderer.createApp({ setup() { account = useResearcherAccount(); return () => null } })
  app.mount({})
  t.after(() => { app.unmount(); if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow })
  return account
}

function serviceFixture() {
  const state = { configured: true, providers: { google: true, chatgpt: false }, user: { id: 'researcher-test', name: 'Researcher' }, openaiConnected: false, anthropicConnected: false, cloudSync: true }
  const calls = []
  let keyRejected = false
  let accountFailure = null
  async function fetchImpl(path, options = {}) {
    calls.push({ path, options })
    let status = 200
    let result = { ok: true }
    if (path === '/api/account') {
      if (accountFailure instanceof Error) throw accountFailure
      if (accountFailure) { status = 503; result = { error: accountFailure } }
      else result = { ...state }
    }
    else if (path === '/api/auth/csrf') result = { csrfToken: 'csrf-test-token' }
    else if (path === '/api/auth/signout') {
      state.user = null
      state.openaiConnected = false
      state.anthropicConnected = false
    }
    else if (path === '/api/anthropic' && options.method === 'POST') {
      if (keyRejected) { status = 400; result = { error: 'Anthropic rejected this API key.' } }
      else { state.anthropicConnected = true; result = { anthropicConnected: true, anthropicModel: 'claude-test' } }
    } else if (path === '/api/anthropic' && options.method === 'DELETE') state.anthropicConnected = false
    else if (path === '/api/openai' && options.method === 'POST') { state.openaiConnected = true; result = { openaiConnected: true, model: 'openai-test' } }
    else if (path === '/api/openai' && options.method === 'DELETE') state.openaiConnected = false
    return { ok: status < 400, headers: { get: () => 'application/json' }, json: async () => result }
  }
  return { state, calls, fetchImpl, rejectKey: () => { keyRejected = true }, failAccount: failure => { accountFailure = failure } }
}

test('account can connect and disconnect each provider independently and ready covers either provider', async t => {
  const service = serviceFixture()
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  assert.equal(account.account.loading, false)
  assert.equal(account.openaiReady.value, false)
  assert.equal(account.anthropicReady.value, false)
  assert.equal(account.ready.value, false)
  await account.connectAnthropic('sk-ant-test-key')
  const anthropicRequest = service.calls.find(call => call.path === '/api/anthropic' && call.options.method === 'POST')
  assert.equal(anthropicRequest.options.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(anthropicRequest.options.body), { apiKey: 'sk-ant-test-key' })
  assert.equal(account.account.anthropicConnected, true)
  assert.equal(account.anthropicReady.value, true)
  assert.equal(account.openaiReady.value, false)
  assert.equal(account.ready.value, true)
  await account.connect('sk-openai-test-key')
  assert.equal(account.openaiReady.value, true)
  assert.equal(account.anthropicReady.value, true)
  await account.disconnectAnthropic()
  assert.equal(service.calls.some(call => call.path === '/api/anthropic' && call.options.method === 'DELETE'), true)
  assert.equal(account.anthropicReady.value, false)
  assert.equal(account.openaiReady.value, true)
  assert.equal(account.ready.value, true)
  await account.disconnect()
  assert.equal(account.ready.value, false)
})

test('rejected Anthropic keys expose the error and never report a connection', async t => {
  const service = serviceFixture()
  service.rejectKey()
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  await account.connectAnthropic('sk-ant-rejected-test-key')
  assert.equal(account.error.value, 'Anthropic rejected this API key.')
  assert.equal(account.account.anthropicConnected, false)
  assert.equal(account.anthropicReady.value, false)
  assert.equal(account.ready.value, false)
  assert.equal(account.busy.value, false)
})

test('provider readiness requires a signed-in user even when connection flags are present', async t => {
  const service = serviceFixture()
  service.state.user = null
  service.state.openaiConnected = true
  service.state.anthropicConnected = true
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  assert.equal(account.openaiReady.value, false)
  assert.equal(account.anthropicReady.value, false)
  assert.equal(account.ready.value, false)
})

test('transient focus-refresh failures keep confirmed account and provider connections until verification recovers', async t => {
  const service = serviceFixture()
  service.state.openaiConnected = true
  service.state.anthropicConnected = true
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  const confirmed = JSON.parse(JSON.stringify(account.account))
  for (const failure of ['Temporary account-service failure', new TypeError('Network connection interrupted'), new DOMException('Timed out', 'TimeoutError')]) {
    service.failAccount(failure)
    window.dispatchEvent(new Event('focus'))
    await drainRequests()
    assert.deepEqual(account.account, confirmed)
    assert.equal(account.openaiReady.value, true)
    assert.equal(account.anthropicReady.value, true)
    assert.ok(account.error.value)
  }
  assert.equal(account.error.value, 'Account services took too long to respond. Please try again.')
  service.failAccount(null)
  await account.refresh()
  assert.equal(account.error.value, '')
  assert.deepEqual(account.account, confirmed)
})

test('initial account-service failure stays anonymous without inventing a usable provider connection', async t => {
  const service = serviceFixture()
  service.failAccount(new TypeError('Network unavailable'))
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  assert.equal(account.account.loading, false)
  assert.equal(account.account.user, null)
  assert.equal(account.account.configured, false)
  assert.deepEqual(account.account.providers, { google: false, chatgpt: false })
  assert.equal(account.ready.value, false)
  assert.equal(account.error.value, 'Network unavailable')
})

test('confirmed session expiry and sign-out clear connections while preserving production auth callbacks', async t => {
  const service = serviceFixture()
  service.state.openaiConnected = true
  service.state.anthropicConnected = true
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  service.state.user = null
  service.state.openaiConnected = false
  service.state.anthropicConnected = false
  await account.refresh()
  assert.equal(account.account.user, null)
  assert.equal(account.ready.value, false)
  service.state.user = { id: 'researcher-test', name: 'Researcher' }
  service.state.openaiConnected = true
  service.state.anthropicConnected = true
  await account.refresh()
  assert.equal(account.ready.value, true)
  window.location.pathname = '/research.html'
  await account.signout()
  assert.equal(account.account.user, null)
  assert.equal(account.openaiReady.value, false)
  assert.equal(account.anthropicReady.value, false)
  const signoutRequest = service.calls.find(call => call.path === '/api/auth/signout')
  assert.equal(signoutRequest.options.body.get('callbackUrl'), 'https://microfish.test/#/login')
  assert.equal(signoutRequest.options.body.get('csrfToken'), 'csrf-test-token')
})

test('credential verification gets a longer timeout and an optional Anthropic workspace stays scoped to its connection', async t => {
  const timeouts = []
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal)
  t.mock.method(AbortSignal, 'timeout', ms => { timeouts.push(ms); return originalTimeout(ms) })
  const service = serviceFixture()
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  await account.connect('sk-openai-test-key')
  await account.connectAnthropic('sk-ant-test-key', 'wrkspc_test')
  await account.disconnectAnthropic()
  assert.deepEqual(timeouts, [15000, 55000, 15000, 55000, 15000, 15000, 15000])
  const anthropicRequest = service.calls.find(call => call.path === '/api/anthropic' && call.options.method === 'POST')
  assert.deepEqual(JSON.parse(anthropicRequest.options.body), { apiKey: 'sk-ant-test-key', workspaceId: 'wrkspc_test' })
  const openaiRequest = service.calls.find(call => call.path === '/api/openai' && call.options.method === 'POST')
  assert.deepEqual(JSON.parse(openaiRequest.options.body), { apiKey: 'sk-openai-test-key' })
})

test('confirmed key mutations remain effective when the following account refresh is unavailable', async t => {
  const service = serviceFixture()
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  const user = account.account.user
  service.failAccount('Account refresh temporarily unavailable')
  await account.connect('sk-openai-test-key')
  assert.equal(account.openaiReady.value, true, 'the first confirmed key connection must be usable')
  assert.equal(account.anthropicReady.value, false)
  await account.connectAnthropic('sk-ant-test-key', 'wrkspc_test')
  assert.equal(account.openaiReady.value, true)
  assert.equal(account.anthropicReady.value, true)
  await account.disconnect()
  assert.equal(account.openaiReady.value, false)
  assert.equal(account.anthropicReady.value, true, 'disconnecting OpenAI must retain Anthropic')
  await account.disconnectAnthropic()
  assert.equal(account.ready.value, false)
  assert.equal(account.account.user, user)
  assert.equal(account.account.configured, true)
  assert.deepEqual(account.account.providers, { google: true, chatgpt: false })
  assert.equal(account.account.cloudSync, true)
  assert.equal(account.error.value, 'Account refresh temporarily unavailable')
})

test('successful sign-out clears the confirmed account even if account-service refresh then fails', async t => {
  const service = serviceFixture()
  service.state.openaiConnected = true
  service.state.anthropicConnected = true
  const account = mountAccount(t, service.fetchImpl)
  await drainRequests()
  service.failAccount('Account refresh temporarily unavailable')
  await account.signout()
  assert.equal(account.account.user, null)
  assert.equal(account.account.openaiConnected, false)
  assert.equal(account.account.anthropicConnected, false)
  assert.equal(account.ready.value, false)
  assert.equal(account.account.configured, true)
  assert.deepEqual(account.account.providers, { google: true, chatgpt: false })
  assert.equal(account.account.cloudSync, true)
  assert.equal(account.error.value, 'Account refresh temporarily unavailable')
})
