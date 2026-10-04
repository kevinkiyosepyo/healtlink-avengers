import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

export function useResearcherAccount() {
  const account = reactive({ loading: true, configured: false, user: null, openaiConnected: false })
  const busy = ref(false)
  const error = ref('')
  const ready = computed(() => Boolean(account.user && account.openaiConnected))
  let refreshGeneration = 0
  let refreshError = false

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options })
    const isJSON = response.headers.get('content-type')?.includes('application/json')
    if (!isJSON) throw new Error('Account services are unavailable. You can still explore the demo.')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'The request could not be completed. Please try again.')
    return result
  }

  async function refresh() {
    const generation = ++refreshGeneration
    try {
      const result = await request('/api/account')
      if (generation !== refreshGeneration) return
      Object.assign(account, { configured: result.configured === true, user: result.user || null, openaiConnected: result.openaiConnected === true })
      if (refreshError) error.value = ''
      refreshError = false
    } catch (cause) {
      if (generation !== refreshGeneration) return
      Object.assign(account, { configured: false, user: null, openaiConnected: false })
      error.value = cause.name === 'TimeoutError' ? 'Account services took too long to respond. Please try again.' : cause.message
      refreshError = true
    } finally {
      if (generation === refreshGeneration) account.loading = false
    }
  }

  async function action(operation) {
    if (busy.value) return
    busy.value = true
    refreshGeneration++
    refreshError = false
    error.value = ''
    try { await operation() } catch (cause) { error.value = cause.message }
    finally { busy.value = false }
  }

  async function authAction(name) {
    const { csrfToken } = await request('/api/auth/csrf')
    if (!csrfToken) throw new Error('Could not start a secure sign-in session. Please reload and try again.')
    return request(`/api/auth/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      body: new URLSearchParams({ csrfToken, callbackUrl: `${window.location.origin}/#/login` }),
    })
  }

  const google = () => action(async () => {
    if (!account.configured) throw new Error('Google sign-in is being configured. Explore the demo for now.')
    const result = await authAction('signin/google')
    const destination = new URL(result.url, window.location.origin)
    if (destination.origin !== window.location.origin && destination.origin !== 'https://accounts.google.com') {
      throw new Error('The sign-in destination could not be verified.')
    }
    window.location.assign(destination.href)
  })

  const connect = apiKey => action(async () => {
    await request('/api/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }),
    })
    await refresh()
  })
  const disconnect = () => action(async () => {
    await request('/api/openai', { method: 'DELETE' })
    await refresh()
  })
  const signout = () => action(async () => {
    await authAction('signout')
    await refresh()
  })

  const onFocus = () => { if (!busy.value) refresh() }
  onMounted(() => {
    const query = new URLSearchParams(window.location.search || window.location.hash.split('?')[1])
    if (query.has('error')) error.value = 'Sign-in did not complete. Please try again.'
    refresh()
    window.addEventListener('focus', onFocus)
  })
  onUnmounted(() => { refreshGeneration++; window.removeEventListener('focus', onFocus) })
  return { account, busy, error, ready, refresh, google, connect, disconnect, signout }
}
