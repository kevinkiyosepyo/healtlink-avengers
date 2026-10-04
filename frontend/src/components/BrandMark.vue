<script setup>
// The lookahead wordmark: the "oo" are a pair of eyes whose pupils glance
// right, toward what's coming. `animate` plays the glance once (boot screen);
// otherwise it plays on hover. Each glyph is its own span so the boot screen
// can stagger them in.
defineProps({
  animate: { type: Boolean, default: false },
});
</script>

<template>
  <span class="brand-mark" :class="{ play: animate }" aria-label="lookahead" role="img">
    <span aria-hidden="true">l</span><span class="eyes" aria-hidden="true"><i></i><i></i></span><span v-for="(char, i) in 'kahead'" :key="i" aria-hidden="true">{{ char }}</span><span class="dot" aria-hidden="true">.</span>
  </span>
</template>

<style scoped>
.brand-mark > span {
  display: inline-block;
}
.brand-mark {
  display: inline-flex;
  align-items: baseline;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.brand-mark > .eyes {
  display: inline-flex;
  gap: 0.035em;
  margin: 0 0.02em;
}
.eyes i {
  position: relative;
  display: inline-block;
  width: 0.52em;
  height: 0.52em;
  border: 0.085em solid currentColor;
  border-radius: 999px;
}
/* pupils rest looking ahead (right) */
.eyes i::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.2em;
  height: 0.2em;
  border-radius: 999px;
  background: var(--accent);
  transform: translate(-0.02em, -50%);
}
.brand-mark:hover .eyes i::after,
.brand-mark.play .eyes i::after {
  animation: glance 1.6s cubic-bezier(0.6, 0, 0.2, 1) both;
}
.brand-mark.play .eyes i:nth-child(2)::after,
.brand-mark:hover .eyes i:nth-child(2)::after {
  animation-delay: 30ms;
}
@keyframes glance {
  0% {
    transform: translate(-0.02em, -50%);
  }
  25% {
    transform: translate(-0.3em, -50%);
  }
  45% {
    transform: translate(-0.3em, -50%);
  }
  70%,
  100% {
    transform: translate(-0.02em, -50%);
  }
}
.dot {
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .eyes i::after {
    animation: none !important;
  }
}
</style>
