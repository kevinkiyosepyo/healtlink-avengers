import { createApp } from 'vue'
import App from './App.vue'
import { initializeWorkspaceTheme } from './composables/useWorkspaceTheme.js'
import '@fontsource-variable/geist'
import './style.css'
import './workspace-theme.css'

export function mountWorkspace() {
  initializeWorkspaceTheme()
  createApp(App).mount('#app')
}
