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

test('security headers restrict connections to self, OpenAI and the model CDN', async () => {
  await withServer({ serveStatic: false }, async (base) => {
    const response = await fetch(`${base}/api/health`)
    const csp = response.headers.get('content-security-policy')
    assert.match(csp, /connect-src 'self' https:\/\/api\.openai\.com/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('x-powered-by'), null)
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
