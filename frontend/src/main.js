import { createApp } from 'vue'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App.vue'
import './style.css'

// After a deploy, an open tab can reference chunk files that no longer exist.
// Reload once to pick up the new build instead of leaving a view blank.
const RELOAD_FLAG = 'microfish:chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* storage unavailable */
  }
})

createApp(App).mount('#app')
