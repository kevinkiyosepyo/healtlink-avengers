<script setup>
// Status signature modeled on Vercel's deployment states: a dot with a soft
// halo, a sans label, and optional mono metadata (progress, duration, counts).
import { computed } from "vue";

const props = defineProps({
  status: { type: String, default: "draft" }, // running | completed | stopped | draft | error
  label: { type: String, default: "" },
  meta: { type: [String, Array], default: "" },
  variant: { type: String, default: "inline" }, // inline | chip
  size: { type: String, default: "md" }, // sm | md
});

const LABELS = { running: "running", completed: "ready", stopped: "stopped", draft: "draft", error: "blocked" };
const text = computed(() => props.label || LABELS[props.status] || props.status);
const metaParts = computed(() => (Array.isArray(props.meta) ? props.meta : [props.meta]).filter(Boolean));
</script>

<template>
  <span class="status" :class="[`is-${status}`, `v-${variant}`, `s-${size}`]">
    <span class="status-dot" aria-hidden="true"></span>
    <span class="status-label">{{ text }}</span>
    <span v-for="(part, index) in metaParts" :key="index" class="status-meta">{{ part }}</span>
  </span>
</template>

<style scoped>
.status {
  --tone: var(--faint);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
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
.v-chip {
  height: 24px;
  padding: 0 10px 0 9px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: var(--surface);
}
.status-dot {
  position: relative;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tone);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 18%, transparent);
}
.s-sm .status-dot {
  width: 6px;
  height: 6px;
  box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--tone) 16%, transparent);
}
.is-draft .status-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--faint);
}
/* running: a halo ripples outward (no blinking) */
.is-running .status-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--tone);
  animation: status-ripple 1.8s cubic-bezier(0.2, 0.7, 0.2, 1) infinite;
}
@keyframes status-ripple {
  from {
    opacity: 0.55;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(2.6);
  }
}
.status-label {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
}
.s-sm .status-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 450;
}
.status-meta {
  overflow: hidden;
  color: var(--faint);
  font-family: var(--font-mono-stack);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}
.status-meta::before {
  content: "·";
  margin-right: 8px;
  color: color-mix(in srgb, var(--faint) 60%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .is-running .status-dot::after {
    animation: none;
  }
}
</style>
