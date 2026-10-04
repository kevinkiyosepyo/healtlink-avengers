import { readonly, ref } from 'vue'
import { readJson, writeJson } from '../lib/storage.js'

export const WORKSPACE_THEME_KEY = 'microfish:workspace-theme'
const theme = ref('light')
let initialized = false

const validTheme = value => value === 'dark' ? 'dark' : 'light'

function applyTheme(value) {
  theme.value = validTheme(value)
  const root = globalThis.document?.documentElement
  if (!root) return
  root.dataset.theme = theme.value
  root.style.colorScheme = theme.value
  // Also covers the interval before Vite's stylesheet has loaded.
  const background = theme.value === 'dark' ? '#12110f' : '#ffffff'
  root.style.backgroundColor = background
  globalThis.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
}

export function initializeWorkspaceTheme() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  applyTheme(readJson(WORKSPACE_THEME_KEY, 'light'))
  window.addEventListener('storage', event => {
    if (event.key !== WORKSPACE_THEME_KEY && event.key !== null) return
    // Re-read local storage so session-storage events cannot change appearance.
    applyTheme(readJson(WORKSPACE_THEME_KEY, 'light'))
  })
}

export function useWorkspaceTheme() {
  initializeWorkspaceTheme()
  return {
    theme: readonly(theme),
    setTheme(value) {
      applyTheme(value)
      writeJson(WORKSPACE_THEME_KEY, theme.value)
    },
  }
}
