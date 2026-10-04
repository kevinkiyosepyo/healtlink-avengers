<script setup>
import { Handle, Position } from "@vue-flow/core";

defineProps({
  data: { type: Object, required: true },
});
</script>

<template>
  <div
    class="kg-node"
    :class="[
      `is-${data.state}`,
      { 'is-dim': data.dim, 'is-focus': data.focus, 'is-selected': data.selected },
    ]"
    :style="{
      '--size': `${data.radius * 2}px`,
      '--cat': data.color ?? `var(--kg-${data.category})`,
      '--stagger': `${data.index * 140}ms`,
    }"
  >
    <Handle type="target" :position="Position.Top" class="kg-handle" />
    <span class="kg-core"></span>
    <span class="kg-label">
      <span class="kg-name">{{ data.label }}</span>
      <span class="kg-meta mono">{{ data.category }} · {{ data.degree }} {{ data.degree === 1 ? "link" : "links" }}</span>
    </span>
    <Handle type="source" :position="Position.Bottom" class="kg-handle" />
  </div>
</template>

<style scoped>
.kg-node {
  position: relative;
  width: var(--size);
  height: var(--size);
  transition: opacity 400ms var(--ease);
}
.kg-core {
  position: absolute;
  inset: 0;
  border: 1.5px solid var(--cat);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cat) 22%, var(--canvas));
  transition:
    transform 200ms var(--ease),
    background 300ms var(--ease),
    border-color 300ms var(--ease),
    box-shadow 200ms var(--ease);
}
.kg-node:hover .kg-core,
.is-focus .kg-core {
  transform: scale(1.12);
  background: color-mix(in srgb, var(--cat) 38%, var(--canvas));
}
.is-selected .kg-core {
  box-shadow:
    0 0 0 3px var(--canvas),
    0 0 0 4.5px var(--cat);
}
.kg-label {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  display: grid;
  justify-items: center;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}
.kg-name {
  color: var(--body);
  font-size: 11.5px;
  font-weight: 500;
  transition: color 200ms var(--ease);
}
.kg-meta {
  color: var(--faint);
  font-size: 10px;
  opacity: 0;
  transform: translateY(-2px);
  transition:
    opacity 150ms var(--ease),
    transform 150ms var(--ease);
}
.kg-node:hover .kg-name,
.is-focus .kg-name,
.is-selected .kg-name {
  color: var(--ink);
}
.kg-node:hover .kg-meta,
.is-focus .kg-meta,
.is-selected .kg-meta {
  opacity: 1;
  transform: none;
}
.kg-handle {
  top: 50% !important;
  left: 50% !important;
  width: 1px !important;
  height: 1px !important;
  min-width: 0 !important;
  border: 0 !important;
  background: transparent !important;
  opacity: 0;
  pointer-events: none;
}

/* idle: not reached by the run yet — a ghost of its category */
.is-idle .kg-core {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--cat) 45%, transparent);
  background: var(--canvas);
}
.is-idle .kg-name {
  color: var(--faint);
}

/* running: a thin accent arc orbits the node (same language as StatusIcon) */
.is-running .kg-core::after {
  content: "";
  position: absolute;
  inset: -4px;
  border: 1.5px solid transparent;
  border-top-color: var(--accent);
  border-radius: 999px;
  animation: kg-orbit 1.4s linear infinite;
  animation-delay: calc(var(--stagger) * -1);
  pointer-events: none;
}
@keyframes kg-orbit {
  to {
    transform: rotate(360deg);
  }
}
.is-stopped {
  opacity: 0.45;
}
.is-dim {
  opacity: 0.18;
}

@media (prefers-reduced-motion: reduce) {
  .is-running .kg-core::after {
    display: none;
  }
}
</style>
