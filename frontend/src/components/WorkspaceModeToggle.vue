<script setup>
import { useWorkspaceTheme } from '../composables/useWorkspaceTheme.js'

const { theme, setTheme } = useWorkspaceTheme()
</script>

<template>
  <div class="workspace-mode-toggle" role="group" aria-label="Appearance">
    <button type="button" :aria-pressed="theme === 'light'" aria-label="Light appearance" @click="setTheme('light')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <span>Light</span>
    </button>
    <button type="button" :aria-pressed="theme === 'dark'" aria-label="Dark appearance" @click="setTheme('dark')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20.7 13.3A9 9 0 0 1 10.7 3.3a9 9 0 1 0 10 10Z" />
      </svg>
      <span>Dark</span>
    </button>
  </div>
</template>

<style scoped>
.workspace-mode-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-alt); flex-shrink: 0; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 9px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ui-muted); font: .6875rem var(--font-data); cursor: pointer; }
button:hover { color: var(--ui-text); background: var(--ui-hover); }
button[aria-pressed='true'] { color: var(--ui-accent); background: var(--ui-surface); border-color: var(--ui-border); }
button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
@media (pointer: coarse), (max-width: 760px) { button { min-height: 38px; min-width: 38px; } }
@media (max-width: 540px) { button { padding-inline: 8px; } .topbar .workspace-mode-toggle button span { display: none; } }
</style>
