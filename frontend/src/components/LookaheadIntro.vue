<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LookaheadLogo from './LookaheadLogo.vue'

const SESSION_KEY = 'lookahead.intro.v1'
const INTRO_DURATION_MS = 1350
const visible = ref(false)
let timeout
let motionPreference

function clearListeners() {
  window.clearTimeout(timeout)
  motionPreference?.removeEventListener?.('change', handleMotionChange)
  document.removeEventListener('pointerdown', finish, true)
  document.removeEventListener('keydown', finish, true)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}

function finish() {
  visible.value = false
  clearListeners()
}

function handleMotionChange(event) {
  if (event.matches) finish()
}

function handleVisibilityChange() {
  if (document.hidden) finish()
}

function handleAnimationEnd(event) {
  if (event.target === event.currentTarget) finish()
}

onMounted(() => {
  motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (motionPreference?.matches || document.hidden) return
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return
    window.sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    // A blocked storage API should never hold up the workspace.
  }
  visible.value = true
  motionPreference?.addEventListener?.('change', handleMotionChange)
  // Any interaction skips the visual without intercepting the user's action.
  document.addEventListener('pointerdown', finish, true)
  document.addEventListener('keydown', finish, true)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // Timers still release the visual if CSS animation events do not arrive.
  timeout = window.setTimeout(finish, INTRO_DURATION_MS)
})

onBeforeUnmount(clearListeners)
</script>

<template>
  <div v-if="visible" class="lookahead-intro" aria-hidden="true" @animationend="handleAnimationEnd">
    <div class="lookahead-intro-word"><LookaheadLogo animate /></div>
    <span class="lookahead-intro-caption">looking ahead — rehearsing your trial before it runs</span>
  </div>
</template>

<style scoped>
.lookahead-intro {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: var(--ui-canvas, #FFFFFF);
  color: var(--ui-text, #1D1D1F);
  animation: lookahead-intro-out 1.35s ease-in-out both;
  --lookahead-glance-duration: 0.62s;
  --lookahead-glance-delay: 0.38s;
}
.lookahead-intro-word {
  display: flex;
  font-size: clamp(2rem, 5vw, 2.5rem);
}
.lookahead-intro-word :deep(.lookahead-glyph) {
  animation: lookahead-glyph-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(2)) { animation-delay: 25ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(3)) { animation-delay: 50ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(4)) { animation-delay: 75ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(5)) { animation-delay: 100ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(6)) { animation-delay: 125ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(7)) { animation-delay: 150ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(8)) { animation-delay: 175ms; }
.lookahead-intro-word :deep(.lookahead-glyph:nth-child(9)) { animation-delay: 200ms; }
.lookahead-intro-caption {
  position: absolute;
  right: 24px;
  bottom: 32px;
  left: 24px;
  color: var(--ui-muted, #5D616B);
  font-family: var(--font-data, ui-monospace, monospace);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  text-align: center;
  animation: lookahead-caption-in 0.22s ease-out 0.2s both;
}
@keyframes lookahead-glyph-in {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes lookahead-caption-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes lookahead-intro-out {
  0%, 83% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .lookahead-intro { display: none; }
  .lookahead-intro, .lookahead-intro-word :deep(.lookahead-glyph), .lookahead-intro-caption {
    animation: none !important;
  }
}
</style>
