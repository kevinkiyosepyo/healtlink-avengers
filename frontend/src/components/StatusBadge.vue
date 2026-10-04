<script setup>
// Status signature: a geometric StatusIcon (Linear-style states), a sans
// label, and optional mono metadata (progress, duration, counts).
import { computed } from "vue";
import StatusIcon from "./StatusIcon.vue";

const props = defineProps({
  status: { type: String, default: "draft" }, // running | completed | stopped | draft | error
  label: { type: String, default: "" },
  meta: { type: [String, Array], default: "" },
  progress: { type: Number, default: null }, // fills the running icon when known
  variant: { type: String, default: "inline" }, // inline | chip
  size: { type: String, default: "md" }, // sm | md
});

const LABELS = { running: "running", completed: "ready", stopped: "stopped", draft: "draft", error: "blocked" };
const text = computed(() => props.label || LABELS[props.status] || props.status);
const metaParts = computed(() => (Array.isArray(props.meta) ? props.meta : [props.meta]).filter(Boolean));
</script>

<template>
  <span class="status" :class="[`v-${variant}`, `s-${size}`]">
    <StatusIcon :status="status" :progress="progress" :size="size === 'sm' ? 12 : 14" />
    <span class="status-label">{{ text }}</span>
    <span v-for="(part, index) in metaParts" :key="index" class="status-meta">{{ part }}</span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  white-space: nowrap;
}
.v-chip {
  height: 24px;
  padding: 0 9px 0 7px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: var(--surface);
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
  margin-right: 7px;
  color: color-mix(in srgb, var(--faint) 60%, transparent);
}
</style>
