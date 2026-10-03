<script setup>
// Loading animation for a running demo: a rack of sample tubes that fill in
// sequence with the run's progress, plus a suspicious little fish that peeks
// over the rack at random intervals. An original homage to "processing
// samples" mini-games — no third-party characters or artwork.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { prefersReducedMotion } from "../../composables/useMotion.js";

const props = defineProps({
  progress: { type: Number, default: 0 },
});

const TUBES = 5;
const colors = ["--kg-community", "--kg-provider", "--kg-policy", "--kg-media", "--kg-economy"];
const reducedMotion = prefersReducedMotion();

// Each tube owns an equal slice of the run; fill 0–1 within its slice.
const fills = computed(() =>
  Array.from({ length: TUBES }, (_, index) => {
    const slice = 100 / TUBES;
    return Math.min(1, Math.max(0, (props.progress - index * slice) / slice));
  }),
);
const done = computed(() => fills.value.filter((fill) => fill >= 1).length);

// --- the impostor ---
const peek = ref(null); // { slot, look } while visible
let timer;
function schedule() {
  timer = window.setTimeout(pop, 3500 + Math.random() * 5500);
}
function pop() {
  // Hide behind a random gap between tubes; glance left or right.
  peek.value = { slot: Math.floor(Math.random() * (TUBES - 1)), look: Math.random() < 0.5 ? -1 : 1 };
  timer = window.setTimeout(() => {
    peek.value = null;
    schedule();
  }, 1600);
}
onMounted(() => {
  if (!reducedMotion) schedule();
});
onBeforeUnmount(() => window.clearTimeout(timer));

const TUBE_W = 14;
const GAP = 14;
const width = TUBES * TUBE_W + (TUBES - 1) * GAP + 16;
const tubeX = (index) => 8 + index * (TUBE_W + GAP);
</script>

<template>
  <div class="rack" role="img" :aria-label="`Processing samples: ${done} of ${TUBES} complete`">
    <svg :viewBox="`0 0 ${width} 64`" :width="width" height="64" aria-hidden="true">
      <!-- the impostor, drawn behind the rack and clipped at the bar so it can duck out of sight -->
      <clipPath id="sus-window"><rect x="0" y="-24" :width="width" height="68" /></clipPath>
      <g clip-path="url(#sus-window)">
      <g
        class="sus"
        :class="{ up: peek }"
        :style="{ '--x': `${peek ? tubeX(peek.slot) + TUBE_W + GAP / 2 : -40}px`, '--look': peek?.look ?? 1 }"
      >
        <g class="sus-body">
          <path d="M-9 4c0-7 4-11 9-11s9 4 9 11v6h-18z" class="sus-fill" />
          <path d="M8 -2l5-4v10z" class="sus-fill" />
          <ellipse class="sus-visor" cx="2.5" cy="-1.5" rx="4.2" ry="2.6" />
          <circle class="sus-pupil" cx="3.6" cy="-1.6" r="1.1" />
        </g>
      </g>
      </g>

      <!-- rack -->
      <rect x="2" y="44" :width="width - 4" height="4" rx="2" class="rack-bar" />
      <g v-for="(fill, index) in fills" :key="index" :style="{ '--liquid': `var(${colors[index]})` }">
        <clipPath :id="`tube-${index}`">
          <rect :x="tubeX(index)" y="10" :width="TUBE_W" height="44" :rx="TUBE_W / 2" />
        </clipPath>
        <rect :x="tubeX(index)" y="10" :width="TUBE_W" height="44" :rx="TUBE_W / 2" class="tube-glass" />
        <g :clip-path="`url(#tube-${index})`">
          <rect
            class="liquid"
            :class="{ active: fill > 0 && fill < 1 }"
            :x="tubeX(index)"
            :y="54 - 40 * fill"
            :width="TUBE_W"
            :height="40 * fill + 2"
          />
          <template v-if="fill > 0 && fill < 1 && !reducedMotion">
            <circle class="bubble" :cx="tubeX(index) + 4" cy="52" r="1.2" />
            <circle class="bubble b2" :cx="tubeX(index) + 9" cy="52" r="1" />
          </template>
        </g>
        <rect :x="tubeX(index) - 2" y="7" :width="TUBE_W + 4" height="4" rx="1.5" class="tube-cap" />
      </g>
    </svg>
    <span class="mono rack-label">processing samples · {{ done }}/{{ TUBES }}</span>
  </div>
</template>

<style scoped>
.rack {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin: 12px 0 2px;
}
.rack svg {
  overflow: visible;
}
.rack-label {
  color: var(--faint);
}
.rack-bar {
  fill: var(--hairline);
}
.tube-glass {
  fill: color-mix(in srgb, var(--ink) 4%, transparent);
  stroke: var(--hairline);
  stroke-width: 1;
}
.tube-cap {
  fill: var(--surface-hover);
}
.liquid {
  fill: color-mix(in srgb, var(--liquid) 70%, var(--canvas));
  transition:
    y 250ms linear,
    height 250ms linear;
}
.liquid.active {
  fill: var(--liquid);
}
.bubble {
  fill: color-mix(in srgb, var(--ink) 55%, transparent);
  animation: rise 1.4s ease-in infinite;
}
.bubble.b2 {
  animation-delay: 0.7s;
}
@keyframes rise {
  from {
    transform: translateY(0);
    opacity: 0.8;
  }
  to {
    transform: translateY(-26px);
    opacity: 0;
  }
}

/* impostor: hides below the rack bar, pops up between two tubes */
.sus {
  transform: translate(var(--x), 60px);
  transition: transform 260ms cubic-bezier(0.3, 1.4, 0.5, 1);
}
.sus.up {
  transform: translate(var(--x), 4px);
}
.sus-body {
  transform: scaleX(var(--look));
}
.sus.up .sus-body {
  animation: glance-up 1.6s steps(1) both;
}
@keyframes glance-up {
  0% {
    transform: scaleX(var(--look));
  }
  45% {
    transform: scaleX(calc(var(--look) * -1));
  }
  75% {
    transform: scaleX(var(--look));
  }
}
.sus-fill {
  fill: var(--accent);
}
.sus-visor {
  fill: color-mix(in srgb, var(--teal) 55%, #dfeef0);
}
.sus-pupil {
  fill: var(--canvas);
}

@media (prefers-reduced-motion: reduce) {
  .liquid {
    transition: none;
  }
}
</style>
