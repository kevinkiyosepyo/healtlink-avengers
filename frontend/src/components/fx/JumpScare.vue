<script setup>
// Hidden easter egg. Trigger (outside text fields): ↑ ↑ ↓ ↓ then K I N G.
// A sequence, not a chord, so it can't collide with OS/browser shortcuts.
// Local only: an original uncanny vector silhouette, no flashing (photosensitivity),
// short synthesized sting, dismiss with any key/click; reduced motion = no zoom or sound.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { prefersReducedMotion } from "../../composables/useMotion.js";

const SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "k", "i", "n", "g"];
const visible = ref(false);
let position = 0;
let lastKey = 0;
let hideTimer;

function sting() {
  if (prefersReducedMotion()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    gain.connect(ctx.destination);
    // A dissonant cluster sliding down: unsettling, short, not ear-splitting.
    for (const freq of [233, 247, 370, 523]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, ctx.currentTime + 0.9);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.95);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio unavailable — the visual still works */
  }
}

function show() {
  visible.value = true;
  sting();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 2400);
}
function hide() {
  visible.value = false;
}

function onKeydown(event) {
  if (visible.value) {
    hide();
    return;
  }
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const now = Date.now();
  if (now - lastKey > 2500) position = 0;
  lastKey = now;
  if (key === SEQUENCE[position]) {
    position += 1;
    if (position === SEQUENCE.length) {
      position = 0;
      show();
    }
  } else {
    position = key === SEQUENCE[0] ? 1 : 0;
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  clearTimeout(hideTimer);
});
</script>

<template>
  <Transition name="scare">
    <div v-if="visible" class="scare" aria-hidden="true" @click="hide">
      <svg viewBox="0 0 400 520" class="figure">
        <defs>
          <filter id="scare-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="23" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <radialGradient id="scare-eye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#f4f1e8" />
            <stop offset="45%" stop-color="#d9d2bf" />
            <stop offset="100%" stop-color="#d9d2bf" stop-opacity="0" />
          </radialGradient>
        </defs>
        <!-- crown, slightly askew -->
        <path class="ink" transform="rotate(-6 200 52)" d="M140 70 L152 28 L176 56 L200 18 L224 56 L248 28 L260 70 Z" />
        <!-- elongated, too-tall head -->
        <path class="ink" d="M200 72 C262 72 292 122 292 196 C292 268 276 326 244 362 C228 380 214 388 200 388 C186 388 172 380 156 362 C124 326 108 268 108 196 C108 122 138 72 200 72 Z" />
        <!-- headband -->
        <path class="band" d="M112 150 C160 132 240 132 288 150 L286 172 C238 156 162 156 114 172 Z" />
        <!-- beard -->
        <path class="beard" d="M134 280 C150 352 178 396 200 400 C222 396 250 352 266 280 C246 318 226 330 200 330 C174 330 154 318 134 280 Z" />
        <!-- hollow eyes that are a little too far apart -->
        <ellipse cx="152" cy="214" rx="24" ry="15" fill="url(#scare-eye)" />
        <ellipse cx="248" cy="214" rx="24" ry="15" fill="url(#scare-eye)" />
        <circle class="pupil" cx="156" cy="215" r="3.2" />
        <circle class="pupil" cx="244" cy="215" r="3.2" />
        <!-- grin that's far too wide -->
        <path class="grin" d="M138 292 C170 318 230 318 262 292 C232 304 168 304 138 292 Z" />
        <path class="teeth" d="M150 298 L154 304 M164 302 L167 309 M180 305 L182 312 M200 306 L200 313 M220 305 L218 312 M236 302 L233 309 M250 298 L246 304" />
        <!-- shoulders + jersey -->
        <path class="ink" d="M40 520 C52 440 110 410 168 404 L200 430 L232 404 C290 410 348 440 360 520 Z" />
        <text x="200" y="492" text-anchor="middle" class="num">23</text>
        <rect width="400" height="520" filter="url(#scare-grain)" />
      </svg>
      <p class="caption mono">you weren't supposed to find this</p>
    </div>
  </Transition>
</template>

<style scoped>
.scare {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  background: radial-gradient(ellipse at 50% 40%, #1a1714 0%, #050404 70%);
  cursor: pointer;
}
.figure {
  width: min(78vw, 520px);
  height: auto;
  animation: lunge 420ms cubic-bezier(0.2, 1.6, 0.4, 1) both, sway 2.4s ease-in-out 420ms infinite;
}
.ink {
  fill: #0b0a09;
  stroke: #e8e2d4;
  stroke-width: 2.5;
  stroke-linejoin: round;
}
.band {
  fill: #e8e2d4;
  opacity: 0.85;
}
.beard {
  fill: #151311;
  stroke: #8e8b82;
  stroke-width: 1.5;
}
.pupil {
  fill: #050404;
}
.grin {
  fill: #050404;
  stroke: #e8e2d4;
  stroke-width: 2;
}
.teeth {
  stroke: #e8e2d4;
  stroke-width: 2;
  stroke-linecap: round;
}
.num {
  fill: none;
  stroke: #e8e2d4;
  stroke-width: 2;
  font: 700 64px var(--font-sans-stack);
}
.caption {
  color: #8e8b82;
}
@keyframes lunge {
  from {
    transform: scale(0.35) translateY(30px);
  }
  to {
    transform: scale(1);
  }
}
@keyframes sway {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(1.2deg) translateY(-3px);
  }
}
.scare-leave-active {
  transition: opacity 300ms ease;
}
.scare-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .figure {
    animation: none;
  }
}
</style>
