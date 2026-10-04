<script setup>
// Mikey's Lookahead wordmark: the “oo” are eyes glancing toward what's ahead.
defineProps({
  animate: { type: Boolean, default: false },
  iconOnly: { type: Boolean, default: false },
})
</script>

<template>
  <span
    class="lookahead-logo"
    :class="{ 'is-playing': animate, 'is-icon': iconOnly }"
    aria-label="Lookahead"
    role="img"
  >
    <span v-if="!iconOnly" class="lookahead-glyph" aria-hidden="true">l</span>
    <span class="lookahead-eyes lookahead-glyph" aria-hidden="true"><i></i><i></i></span>
    <template v-if="!iconOnly">
      <span v-for="(char, index) in 'kahead'" :key="index" class="lookahead-glyph" aria-hidden="true">{{ char }}</span>
      <span class="lookahead-dot lookahead-glyph" aria-hidden="true">.</span>
    </template>
  </span>
</template>

<style scoped>
.lookahead-logo {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--font-brand, var(--font-body, ui-sans-serif, system-ui, sans-serif));
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.15;
  white-space: nowrap;
}
.lookahead-glyph {
  display: inline-block;
}
.lookahead-logo > .lookahead-eyes {
  display: inline-flex;
  gap: 0.035em;
  margin: 0 0.02em;
}
.lookahead-logo.is-icon {
  align-items: center;
  line-height: 1;
}
.lookahead-eyes i {
  position: relative;
  display: inline-block;
  width: 0.52em;
  height: 0.52em;
  border: 0.085em solid currentColor;
  border-radius: 999px;
}
.lookahead-eyes i::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.2em;
  height: 0.2em;
  border-radius: 999px;
  background: var(--ui-accent, var(--accent, #2457D6));
  transform: translate(-0.02em, -50%);
}
.lookahead-logo:hover .lookahead-eyes i::after,
.lookahead-logo.is-playing .lookahead-eyes i::after {
  animation: lookahead-glance var(--lookahead-glance-duration, 1.6s) cubic-bezier(0.6, 0, 0.2, 1) both;
  animation-delay: var(--lookahead-glance-delay, 0s);
}
.lookahead-logo:hover .lookahead-eyes i:nth-child(2)::after,
.lookahead-logo.is-playing .lookahead-eyes i:nth-child(2)::after {
  animation-delay: calc(var(--lookahead-glance-delay, 0s) + 30ms);
}
.lookahead-dot {
  color: var(--ui-accent, var(--accent, #2457D6));
}
@keyframes lookahead-glance {
  0%, 70%, 100% { transform: translate(-0.02em, -50%); }
  25%, 45% { transform: translate(-0.3em, -50%); }
}
@media (prefers-reduced-motion: reduce) {
  .lookahead-eyes i::after { animation: none !important; }
}
</style>
