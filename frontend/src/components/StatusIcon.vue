<script setup>
// Geometric status icons in the style of Linear's issue states: hairline
// strokes, no glow. Running shows real progress as a filling pie when it's
// known, otherwise a slowly rotating arc.
import { computed } from "vue";

const props = defineProps({
  status: { type: String, default: "draft" }, // draft | running | completed | stopped | error
  progress: { type: Number, default: null }, // 0–100 while running
  size: { type: Number, default: 14 },
});

// Pie via a fat stroke: r = 2.75, stroke-width 5.5 → circumference ≈ 17.28.
const PIE = 2 * Math.PI * 2.75;
const pie = computed(() => {
  const p = Math.min(100, Math.max(0, props.progress ?? 0));
  return `${(p / 100) * PIE} ${PIE}`;
});
const determinate = computed(() => props.status === "running" && Number.isFinite(props.progress));
</script>

<template>
  <svg class="status-icon" :class="`is-${status}`" :width="size" :height="size" viewBox="0 0 14 14" aria-hidden="true">
    <template v-if="status === 'draft'">
      <circle cx="7" cy="7" r="5.5" class="ring" stroke-dasharray="2.2 1.9" />
    </template>
    <template v-else-if="status === 'running'">
      <circle cx="7" cy="7" r="5.5" class="ring" />
      <circle v-if="determinate" cx="7" cy="7" r="2.75" class="pie" :stroke-dasharray="pie" transform="rotate(-90 7 7)" />
      <circle v-else cx="7" cy="7" r="5.5" class="arc" stroke-dasharray="8.6 26" />
    </template>
    <template v-else-if="status === 'completed'">
      <circle cx="7" cy="7" r="6.25" class="fill" />
      <path d="M4.3 7.2 6.2 9 9.8 5.2" class="mark" />
    </template>
    <template v-else-if="status === 'stopped'">
      <circle cx="7" cy="7" r="5.5" class="ring" />
      <rect x="5" y="5" width="4" height="4" rx="0.8" class="solid" />
    </template>
    <template v-else>
      <circle cx="7" cy="7" r="6.25" class="fill" />
      <path d="M5 5l4 4M9 5 5 9" class="mark" />
    </template>
  </svg>
</template>

<style scoped>
.status-icon {
  --tone: var(--faint);
  flex-shrink: 0;
  overflow: visible;
}
.is-running {
  --tone: var(--accent);
}
.is-completed {
  --tone: var(--teal);
}
.is-stopped {
  --tone: var(--muted);
}
.is-error {
  --tone: var(--danger);
}
.ring {
  fill: none;
  stroke: var(--tone);
  stroke-width: 1.5;
}
.is-running .ring {
  stroke: color-mix(in srgb, var(--tone) 35%, transparent);
}
.pie {
  fill: none;
  stroke: var(--tone);
  stroke-width: 5.5;
  transition: stroke-dasharray 250ms linear;
}
.arc {
  fill: none;
  stroke: var(--tone);
  stroke-width: 1.5;
  stroke-linecap: round;
  transform-origin: 7px 7px;
  animation: status-spin 1.1s linear infinite;
}
.fill,
.solid {
  fill: var(--tone);
}
.mark {
  fill: none;
  stroke: var(--canvas);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@keyframes status-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .arc {
    animation: none;
  }
}
</style>
