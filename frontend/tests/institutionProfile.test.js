import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive, ref } from 'vue'
import {
  createInstitutionProfileController, INSTITUTION_MAX_AGE_MS,
  institutionTokenExpiresAt, isInstitutionSnapshotFresh,
  prepareInstitutionSimulationContext,
} from '../src/lib/institutionProfile.js'
import { useInstitutionProfile } from '../src/composables/useInstitutionProfile.js'

const NOW = Date.parse('2026-10-04T20:00:00Z')
const stanford = { id: 'stanford', name: 'Stanford University' }
const ucsf = { id: 'uc-san-francisco', name: 'University of California, San Francisco' }
const token = expiresAt => `header.${Buffer.from(JSON.stringify({ exp: expiresAt / 1000 })).toString('base64url')}.signature`
const profile = (university = stanford, retrievedAt = NOW) => ({ university, reviewers: [{ name: 'Public reviewer', role: 'IRB member' }], policies: [], sources: [], retrievedAt: new Date(retrievedAt).toISOString(), status: 'partial' })
const result = (university = stanford) => ({ profile: profile(university), token: token(NOW + 10 * 60 * 60 * 1000), provider: 'openai', model: 'research-model' })
const response = (data, ok = true) => ({ ok, json: async () => data })
const scope = (university = stanford, accountId = 'alice') => ({ accountId, university, openaiConnected: true, anthropicConnected: false })
const drain = () => new Promise(resolve => setImmediate(resolve))

test('snapshot reuse needs matching university, recent sources, and an unexpired server token', () => {
  const snapshot = result()
  assert.equal(isInstitutionSnapshotFresh(snapshot, stanford, { now: NOW }), true)
  assert.equal(isInstitutionSnapshotFresh(snapshot, ucsf, { now: NOW }), false)
  assert.equal(isInstitutionSnapshotFresh({ ...snapshot, token: token(NOW) }, stanford, { now: NOW }), false)
  assert.equal(isInstitutionSnapshotFresh({ ...snapshot, profile: profile(stanford, NOW - INSTITUTION_MAX_AGE_MS) }, stanford, { now: NOW }), false)
  assert.equal(isInstitutionSnapshotFresh({ ...snapshot, profile: profile(stanford, NOW + 1) }, stanford, { now: NOW }), false)
  assert.equal(isInstitutionSnapshotFresh({ ...snapshot, token: '' }, stanford, { now: NOW }), false)
  assert.equal(isInstitutionSnapshotFresh({ ...snapshot, token: '' }, stanford, { now: NOW, requireToken: false }), true)
  for (const invalid of [null, '', 'a.b', 'a.invalid.c', token(NOW).replace(/\.[^.]+$/, '')]) assert.equal(institutionTokenExpiresAt(invalid), null)
})

test('lookup automatically searches once and safely reuses a fresh university snapshot in the same account', async t => {
  const calls = []
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return response(result(JSON.parse(options.body).university))
  } })
  t.after(controller.dispose)
  await controller.setScope(scope())
  assert.equal(controller.state.state, 'ready')
  assert.equal(controller.state.signed, true)
  assert.equal(controller.state.provider, 'openai')
  assert.equal(calls[0].url, '/api/institution')
  assert.equal(calls[0].options.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(calls[0].options.body), { university: stanford })
  await controller.setScope(scope())
  assert.equal(calls.length, 1)
  await controller.setScope(scope(ucsf))
  await controller.setScope(scope())
  assert.equal(calls.length, 2)
  assert.equal(controller.state.profile.university.id, 'stanford')
})

test('a public preview is fetched before connection and exchanged for a signed snapshot when a provider connects', async t => {
  const calls = []
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return response(url.endsWith('preview') ? { profile: profile() } : { ...result(), provider: 'anthropic' })
  } })
  t.after(controller.dispose)
  await controller.setScope({ ...scope(), openaiConnected: false })
  assert.equal(calls[0].url, '/api/institution-preview')
  assert.equal(controller.state.state, 'ready')
  assert.equal(controller.state.signed, false)
  assert.equal(controller.state.token, '')
  await controller.setScope({ ...scope(), openaiConnected: false, anthropicConnected: true })
  assert.equal(calls[1].url, '/api/institution')
  assert.equal(controller.state.signed, true)
  assert.equal(controller.state.provider, 'anthropic')
})

test('account switches abort an old lookup and late responses cannot replace the new account profile', async t => {
  const calls = []
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) })
  t.after(controller.dispose)
  const first = controller.setScope(scope())
  assert.equal(controller.state.state, 'loading')
  const second = controller.setScope(scope(ucsf, 'bob'))
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(controller.state.profile, null)
  calls[1].resolve(response(result(ucsf)))
  await second
  calls[0].resolve(response(result()))
  await first
  assert.equal(controller.state.profile.university.id, ucsf.id)
  const logout = controller.setScope({ accountId: null, university: null })
  await logout
  assert.equal(controller.state.state, 'idle')
  assert.equal(controller.state.profile, null)
  assert.equal(controller.state.token, '')
  const returnToAlice = controller.setScope(scope())
  assert.equal(calls.length, 3)
  calls[2].resolve(response(result()))
  await returnToAlice
})

test('university changes and disposal invalidate in-flight results even when fetch ignores cancellation', async () => {
  const calls = []
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) })
  const first = controller.setScope(scope())
  const second = controller.setScope(scope(ucsf))
  assert.equal(calls[0].options.signal.aborted, true)
  calls[0].resolve(response(result()))
  await first
  assert.equal(controller.state.state, 'loading')
  assert.equal(controller.state.profile, null)
  controller.dispose()
  assert.equal(calls[1].options.signal.aborted, true)
  calls[1].resolve(response(result(ucsf)))
  await second
  assert.equal(controller.state.profile, null)
})

test('lookup errors remain visible until retry succeeds, and mismatched profiles cannot be used', async t => {
  let attempt = 0
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: async () => {
    attempt++
    if (attempt === 1) return response({ error: 'Provider usage limit reached.' }, false)
    if (attempt === 2) return response(result(ucsf))
    return response(result())
  } })
  t.after(controller.dispose)
  await controller.setScope(scope())
  assert.equal(controller.state.state, 'fallback')
  assert.equal(controller.state.error, 'Provider usage limit reached.')
  assert.equal(controller.state.profile, null)
  await controller.refresh()
  assert.match(controller.state.error, /incomplete profile/)
  await controller.refresh()
  assert.equal(controller.state.state, 'ready')
  assert.equal(controller.state.error, '')
})

test('source lookups have a deadline and timeout gives an actionable retry error', async t => {
  const controller = createInstitutionProfileController({ now: () => NOW, timeoutMs: 10, fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
  }) })
  t.after(controller.dispose)
  await controller.setScope(scope())
  assert.equal(controller.state.state, 'fallback')
  assert.match(controller.state.error, /took too long.*Retry/)
})

test('independent research has explicit fictional reviewers without a network request or token', async t => {
  let calls = 0
  const controller = createInstitutionProfileController({ now: () => NOW, fetchImpl: async () => { calls++; throw new Error('Unexpected fetch') } })
  t.after(controller.dispose)
  await controller.setScope(scope({ id: 'independent', name: 'Independent researcher' }))
  assert.equal(calls, 0)
  assert.equal(controller.state.state, 'ready')
  assert.equal(controller.state.profile.reviewers.length, 3)
  assert.ok(controller.state.profile.reviewers.every(reviewer => reviewer.kind === 'composite'))
  assert.equal(controller.state.token, '')
  assert.equal(controller.state.signed, false)
})

test('the composable reacts to university selection, provider connection, and sign-out', async () => {
  const calls = []
  const account = reactive({ loading: true, user: null, openaiConnected: false, anthropicConnected: false })
  const university = ref(null)
  const effects = effectScope()
  const lookup = effects.run(() => useInstitutionProfile(account, university, { now: () => NOW, fetchImpl: async (url, options) => {
    calls.push(url)
    const selected = JSON.parse(options.body).university
    return response(url.endsWith('preview') ? { profile: profile(selected) } : result(selected))
  } }))
  try {
    account.loading = false
    account.user = { id: 'alice' }
    university.value = stanford
    await drain()
    assert.equal(calls[0], '/api/institution-preview')
    assert.equal(lookup.profile.value.university.id, 'stanford')
    account.openaiConnected = true
    await drain()
    assert.equal(calls[1], '/api/institution')
    assert.equal(lookup.signed.value, true)
    account.user = null
    assert.equal(lookup.state.value, 'idle')
    assert.equal(lookup.profile.value, null)
    assert.equal(lookup.token.value, '')
  } finally { effects.stop() }
})

test('a legacy chat with no setup inherits the saved university and obtains signed IRB profiles', async () => {
  const calls = []
  const context = await prepareInstitutionSimulationContext(null, stanford, { now: NOW, provider: 'anthropic', fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return response(result())
  } })
  assert.equal(calls[0].url, '/api/institution')
  assert.deepEqual(JSON.parse(calls[0].options.body), { university: stanford, provider: 'anthropic' })
  assert.deepEqual(context.university, stanford)
  assert.deepEqual(context.documents, [])
  assert.equal(context.institution.reviewers[0].name, 'Public reviewer')
  assert.equal(context.institutionToken, result().token)
})

test('run preparation preserves complete study material and an existing chat university after the account preference changes', async () => {
  const original = {
    overview: 'Study overview with participant requirements.', transcript: 'Full dictated study details.',
    documents: [{ id: 'consent', name: 'Consent form.txt', kind: 'txt', text: 'Complete consent text.' }],
    university: ucsf,
  }
  const before = structuredClone(original)
  const calls = []
  const context = await prepareInstitutionSimulationContext(original, stanford, { now: NOW, snapshot: result(), fetchImpl: async (_url, options) => {
    calls.push(JSON.parse(options.body))
    return response(result(ucsf))
  } })
  assert.deepEqual(calls, [{ university: ucsf }])
  assert.deepEqual(context.university, ucsf)
  assert.deepEqual(context.documents, original.documents)
  assert.equal(context.overview, original.overview)
  assert.equal(context.transcript, original.transcript)
  assert.deepEqual(original, before)
  context.documents[0].text = 'Changed after preparation'
  assert.equal(original.documents[0].text, 'Complete consent text.')
})

test('fresh signed session snapshots and matching shared snapshots are reused without another lookup', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw new Error('Unexpected fetch') }
  const saved = result()
  const existing = await prepareInstitutionSimulationContext({ university: stanford, institution: saved.profile, institutionToken: saved.token }, ucsf, { now: NOW, fetchImpl })
  assert.equal(existing.institutionToken, saved.token)
  const inherited = await prepareInstitutionSimulationContext({ overview: 'Preserved study' }, stanford, { now: NOW, snapshot: saved, fetchImpl })
  assert.equal(inherited.institutionToken, saved.token)
  assert.equal(inherited.overview, 'Preserved study')
  assert.equal(calls, 0)
})

test('freshness is checked after retrieval so sources checked during a slow lookup remain usable', async () => {
  let clock = NOW
  const context = await prepareInstitutionSimulationContext(null, stanford, { now: () => clock, fetchImpl: async () => {
    clock += 30000
    return response({ ...result(), profile: profile(stanford, clock) })
  } })
  assert.equal(context.institution.retrievedAt, new Date(clock).toISOString())
})

test('expired or unsigned snapshots are refreshed before a run, and wrong-university responses are refused', async () => {
  let calls = 0
  const expired = { ...result(), token: token(NOW - 1) }
  const prepared = await prepareInstitutionSimulationContext({ university: stanford, institution: expired.profile, institutionToken: expired.token }, stanford, { now: NOW, snapshot: { ...result(), token: '' }, fetchImpl: async () => {
    calls++
    return response(result())
  } })
  assert.equal(calls, 1)
  assert.equal(prepared.institutionToken, result().token)
  await assert.rejects(prepareInstitutionSimulationContext(null, stanford, { now: NOW, fetchImpl: async () => response(result(ucsf)) }), /different university/)
  await assert.rejects(prepareInstitutionSimulationContext(null, stanford, { now: NOW, fetchImpl: async () => response({ profile: profile() }) }), /signed reviewer profile/)
  await assert.rejects(prepareInstitutionSimulationContext(null, stanford, { now: NOW, fetchImpl: async () => response(expired) }), /verification expired/)
  await assert.rejects(prepareInstitutionSimulationContext(null, stanford, { now: NOW, fetchImpl: async () => response({ error: 'Connect your AI provider.' }, false) }), /Connect your AI provider/)
})

test('independent run preparation uses composites and aborting a lookup prevents it from attaching data', async () => {
  const independent = { id: 'independent', name: 'Independent researcher' }
  const local = await prepareInstitutionSimulationContext({ transcript: 'Complete dictation.' }, independent, { now: NOW, fetchImpl: async () => { throw new Error('Unexpected fetch') } })
  assert.equal(local.transcript, 'Complete dictation.')
  assert.equal(local.institutionToken, '')
  assert.ok(local.institution.reviewers.every(reviewer => reviewer.kind === 'composite'))
  const controller = new AbortController()
  let resolve
  const pending = prepareInstitutionSimulationContext(null, stanford, { now: NOW, signal: controller.signal, fetchImpl: () => new Promise(done => { resolve = done }) })
  controller.abort(new Error('Account changed'))
  resolve(response(result()))
  await assert.rejects(pending, /Account changed/)
})
