import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

async function withServer(options, fn) {
  const server = createApp(options).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('health responds and unknown API routes 404', async () => {
  await withServer({ serveStatic: false }, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true })
    assert.equal((await fetch(`${base}/api/stance`, { method: 'POST' })).status, 404, 'no model proxy exists')
  })
})

test('security headers permit the configured research APIs and Google sign-in only', async () => {
  await withServer({ serveStatic: false }, async (base) => {
    const response = await fetch(`${base}/api/health`)
    const csp = response.headers.get('content-security-policy')
    assert.match(csp, /connect-src 'self' https:\/\/api\.openai\.com/)
    const connect = csp.split('; ').find(part => part.startsWith('connect-src ')).split(' ').slice(1)
    assert.deepEqual(connect, ["'self'", 'https://api.openai.com', 'https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co', 'https://api.openalex.org', 'https://www.ebi.ac.uk', 'https://clinicaltrials.gov'])
    assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com(?:;|$)/)
    assert.match(csp, /img-src 'self' data: blob: https:\/\/\*\.googleusercontent\.com/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('x-powered-by'), null)
  })
})

test('Express serves the shared account API without intercepting unknown routes', async () => {
  await withServer({ serveStatic: false, env: {} }, async (base) => {
    const response = await fetch(`${base}/api/account`)
    assert.equal(response.status, 200)
    const account = await response.json()
    assert.equal(account.configured, false)
    assert.equal(account.user, null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404)
  })
})

test('serves the SPA when a build exists', async () => {
  await withServer({ serveStatic: true }, async (base) => {
    const response = await fetch(`${base}/some/deep/link`)
    if (response.status === 404) return // no frontend build in this checkout
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<div id="app">/)
  })
})


test('Express routes institution lookup and transcription through the shared API', async () => {
  await withServer({ serveStatic: false, env: {} }, async (base) => {
    for (const path of ['/api/institution', '/api/transcribe', '/api/evidence', '/api/anthropic']) {
      const response = await fetch(`${base}${path}`, { method: 'POST' })
      assert.equal(response.status, 503)
      assert.equal((await response.json()).code, 'auth_not_configured')
    }
  })
})

test('Express exposes credential-free university preview while preserving account boundaries', async () => {
  await withServer({ serveStatic: false, env: {} }, async (base) => {
    const response = await fetch(`${base}/api/institution-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ university: 'harvard' }),
    })
    assert.equal(response.status, 200)
    const preview = await response.json()
    assert.equal(preview.profile.university.id, 'harvard')
    assert.equal(preview.profile.status, 'composite')
    assert.equal(preview.token, undefined)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await fetch(`${base}/api/institution-preview`)).status, 405)
    const forbidden = await fetch(`${base}/api/institution-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify({ university: 'harvard' }),
    })
    assert.equal(forbidden.status, 403)
  })
})
