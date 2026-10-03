<script setup>
import { computed, useId } from "vue";

const props = defineProps({
  run: { type: Object, default: null },
  sessionTitle: { type: String, default: "" },
});

const graphId = useId();
const positions = [
  { x: 228, y: 188, size: 23, label: "01", kind: "core" },
  { x: 124, y: 117, size: 17, label: "02", kind: "mint" },
  { x: 337, y: 118, size: 19, label: "03", kind: "blue" },
  { x: 352, y: 245, size: 16, label: "04", kind: "mint" },
  { x: 164, y: 291, size: 19, label: "05", kind: "blue" },
  { x: 76, y: 220, size: 14, label: "06", kind: "cream" },
  { x: 233, y: 62, size: 13, label: "07", kind: "cream" },
  { x: 410, y: 177, size: 12, label: "08", kind: "cream" },
  { x: 296, y: 330, size: 14, label: "09", kind: "cream" },
  { x: 66, y: 70, size: 10, label: "10", kind: "mint" },
  { x: 85, y: 328, size: 11, label: "11", kind: "mint" },
  { x: 403, y: 70, size: 10, label: "12", kind: "blue" },
];

const connections = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [1, 5],
  [1, 6],
  [1, 9],
  [2, 6],
  [2, 7],
  [2, 11],
  [3, 7],
  [3, 8],
  [4, 5],
  [4, 8],
  [4, 10],
  [5, 10],
];

const progress = computed(() => {
  if (props.run?.status === "completed") return 100;
  return Math.min(100, Math.max(0, Number(props.run?.progress) || 0));
});
const nodes = computed(() => {
  const count = Math.min(
    12,
    Math.max(1, Math.floor(Number(props.run?.agentCount) || 12)),
  );
  return positions.slice(0, count);
});
const edges = computed(() =>
  connections.filter(
    ([a, b]) => a < nodes.value.length && b < nodes.value.length,
  ),
);
const activeNodeCount = computed(() =>
  Math.max(1, Math.ceil((progress.value / 100) * nodes.value.length)),
);
const statusLabel = computed(
  () =>
    ({ running: "Running", completed: "Complete", stopped: "Stopped" })[
      props.run?.status
    ] || "Ready",
);
const stageLabel = computed(
  () =>
    props.run?.stage ||
    {
      running: "Exploring connections",
      completed: "Demo complete",
      stopped: "Demo stopped",
    }[props.run?.status] ||
    "Ready to explore",
);
</script>

<template>
  <section class="simulation-graph" :aria-labelledby="`${graphId}-heading`">
    <header class="graph-header">
      <div class="graph-heading-group">
        <span class="graph-eyebrow">THE BIG PICTURE</span>
        <h2 :id="`${graphId}-heading`">Simulation graph</h2>
      </div>
      <span class="topology-badge">Demo topology</span>
    </header>

    <div v-if="!run" class="graph-empty">
      <div class="empty-orbit" aria-hidden="true">
        <svg viewBox="0 0 220 180" fill="none">
          <circle
            cx="110"
            cy="90"
            r="73"
            stroke="currentColor"
            stroke-dasharray="3 7"
          />
          <path
            d="M57 60L113 94L170 53M113 94L152 145M113 94L48 135"
            stroke="currentColor"
          />
          <circle cx="113" cy="94" r="22" fill="#d6e7dc" stroke="#8ca895" />
          <circle cx="57" cy="60" r="13" fill="#f4f5ee" stroke="#aebdae" />
          <circle cx="170" cy="53" r="11" fill="#e1e8ee" stroke="#adbdc8" />
          <circle cx="152" cy="145" r="14" fill="#e1e8ee" stroke="#adbdc8" />
          <circle cx="48" cy="135" r="9" fill="#f4f5ee" stroke="#aebdae" />
          <path
            d="M107 94h12m-6-6v12"
            stroke="#5b7b64"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <h3>A little world of possibilities.</h3>
      <p>
        Start a simulation to see its agents<br class="optional-break" />
        and connections take shape.
      </p>
      <span class="empty-caption">Each chat has a world of its own</span>
    </div>

    <template v-else>
      <div class="graph-run-heading">
        <span class="run-status" :class="run.status"
          ><i aria-hidden="true"></i>{{ statusLabel }}</span
        >
        <span class="run-stage">{{ stageLabel }}</span>
      </div>

      <div class="network-canvas">
        <div class="canvas-caption">
          <span class="caption-rule"></span> A SHARED WORLD
        </div>
        <svg
          class="network-svg"
          viewBox="0 0 470 390"
          role="img"
          :aria-labelledby="`${graphId}-title ${graphId}-description`"
        >
          <title :id="`${graphId}-title`">
            Illustrative agent network{{
              sessionTitle ? ` for ${sessionTitle}` : ""
            }}
          </title>
          <desc :id="`${graphId}-description`">
            A synthetic demo topology with {{ nodes.length }} agents and
            {{ edges.length }} connections. Highlighted agents illustrate demo
            progress at {{ Math.round(progress) }} percent. This is not a
            medical prediction.
          </desc>
          <defs>
            <pattern
              :id="`${graphId}-dots`"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.7" fill="#b1b9aa" opacity="0.42" />
            </pattern>
          </defs>
          <rect width="470" height="390" :fill="`url(#${graphId}-dots)`" />
          <circle class="network-orbit" cx="230" cy="193" r="151" />
          <circle class="network-orbit inner" cx="230" cy="193" r="102" />
          <g class="network-connections">
            <line
              v-for="([a, b], index) in edges"
              :key="`edge-${index}`"
              :x1="nodes[a].x"
              :y1="nodes[a].y"
              :x2="nodes[b].x"
              :y2="nodes[b].y"
              :class="{
                'edge-active': a < activeNodeCount && b < activeNodeCount,
              }"
            />
          </g>
          <g
            v-for="(node, index) in nodes"
            :key="node.label"
            class="network-node"
            :class="[node.kind, { 'node-active': index < activeNodeCount }]"
          >
            <circle
              v-if="index === 0"
              class="node-halo"
              :cx="node.x"
              :cy="node.y"
              :r="node.size + 9"
            />
            <circle
              class="node-body"
              :cx="node.x"
              :cy="node.y"
              :r="node.size"
            />
            <text
              :x="node.x"
              :y="node.y + 0.5"
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {{ node.label }}
            </text>
            <text
              v-if="index === 0"
              class="node-caption"
              :x="node.x"
              :y="node.y + node.size + 24"
              text-anchor="middle"
            >
              YOUR SCENARIO
            </text>
          </g>
        </svg>
        <div class="canvas-legend">
          <span><i class="legend-node"></i> Illustrative agent</span
          ><span><i class="legend-line"></i> Connection</span>
        </div>
      </div>

      <div class="graph-progress">
        <div class="progress-copy">
          <span>{{
            run.status === "completed"
              ? "World explored"
              : run.status === "stopped"
                ? "Progress saved"
                : "Exploring this world"
          }}</span
          ><strong>{{ Math.round(progress) }}<span>%</span></strong>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          :aria-label="'Demo simulation progress'"
          :aria-valuenow="Math.round(progress)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${progress}%` }"></span>
        </div>
      </div>

      <footer class="graph-footer">
        <div class="graph-count">
          <strong>{{ String(nodes.length).padStart(2, "0") }}</strong
          ><span>agents</span>
        </div>
        <div class="graph-count">
          <strong>{{ String(edges.length).padStart(2, "0") }}</strong
          ><span>connections</span>
        </div>
        <span class="synthetic-label">Synthetic<br />demo data</span>
      </footer>
      <p class="graph-disclaimer">
        Illustrative activity only. No medical predictions.
      </p>
    </template>
  </section>
</template>

<style scoped>
.simulation-graph {
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #31473b;
  background: #f5f7f0;
  border: 1px solid #dfe5da;
  border-radius: 18px;
  overflow: hidden;
}
.graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 27px 26px 22px;
}
.graph-heading-group {
  min-width: 0;
}
.graph-eyebrow {
  display: block;
  margin-bottom: 8px;
  color: #65715f;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.7px;
}
.graph-heading-group h2 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 23px;
  font-weight: 400;
  letter-spacing: -0.6px;
  line-height: 1.2;
}
.topology-badge {
  flex-shrink: 0;
  padding: 5px 8px;
  border: 1px solid #dbe2d4;
  border-radius: 5px;
  color: #5f705f;
  font-size: 9px;
  line-height: 1.3;
}
.graph-empty {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 24px 72px;
  text-align: center;
}
.empty-orbit {
  width: 220px;
  max-width: 80%;
  color: #65715f;
  margin-bottom: 20px;
}
.empty-orbit svg {
  width: 100%;
  display: block;
}
.graph-empty h3 {
  margin: 0 0 12px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 23px;
  font-weight: 400;
  letter-spacing: -0.5px;
}
.graph-empty p {
  margin: 0;
  color: #65715f;
  font-size: 12px;
  line-height: 1.8;
}
.empty-caption {
  color: #65715f;
  font-size: 9px;
  letter-spacing: 0.15px;
  margin-top: 44px;
}
.graph-run-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 26px 7px;
  min-height: 29px;
}
.run-status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  color: #65715f;
  font-size: 10px;
}
.run-status i {
  height: 5px;
  width: 5px;
  border-radius: 50%;
  background: #929d8c;
}
.run-status.running,
.run-status.completed {
  color: #50795d;
}
.run-status.running i,
.run-status.completed i {
  background: #679b72;
  box-shadow: 0 0 0 3px #e5ede0;
}
.run-status.stopped i {
  background: #b29a71;
}
.run-stage {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: #65715f;
}
.network-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  min-height: 275px;
  padding: 20px 7px 8px;
}
.canvas-caption {
  position: absolute;
  top: 23px;
  left: 27px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #65715f;
  font-size: 8px;
  letter-spacing: 1.3px;
}
.caption-rule {
  width: 13px;
  height: 1px;
  background: #adb9a5;
}
.network-svg {
  display: block;
  width: 100%;
  max-height: 455px;
  min-height: 230px;
}
.network-orbit {
  fill: none;
  stroke: #e1e6dc;
  stroke-width: 1;
  stroke-dasharray: 3 8;
}
.network-orbit.inner {
  stroke: #e7ebe1;
  stroke-dasharray: none;
}
.network-connections line {
  stroke: #ccd5c6;
  stroke-width: 1;
  opacity: 0.65;
  transition:
    stroke 500ms,
    opacity 500ms;
}
.network-connections line.edge-active {
  stroke: #8ba892;
  opacity: 0.85;
}
.node-body {
  fill: #f3f6ed;
  stroke: #c7d1c1;
  stroke-width: 1.2;
  transition:
    fill 500ms,
    stroke 500ms;
}
.node-active.mint .node-body {
  fill: #d3e5d5;
  stroke: #93b299;
}
.node-active.blue .node-body {
  fill: #dde7e9;
  stroke: #a3b8bd;
}
.node-active.cream .node-body {
  fill: #eceada;
  stroke: #bebb9e;
}
.node-active.core .node-body {
  fill: #61846b;
  stroke: #50745a;
}
.node-halo {
  fill: #e2ebdc;
  stroke: #d6e3ce;
  stroke-width: 1;
}
.network-node text {
  fill: #8c9a85;
  font-size: 9px;
  font-family: inherit;
  font-weight: 500;
}
.network-node.node-active text {
  fill: #5d7664;
}
.network-node.core text {
  fill: #fff;
  font-size: 11px;
}
.network-node text.node-caption {
  fill: #7a8975;
  font-size: 7px;
  letter-spacing: 1px;
  font-weight: 400;
}
.canvas-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 23px;
  color: #65715f;
  font-size: 9px;
  padding: 4px 0 10px;
}
.canvas-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-node {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b6cfb5;
  border: 1px solid #94b291;
}
.legend-line {
  width: 13px;
  height: 1px;
  background: #95ad90;
}
.graph-progress {
  padding: 20px 26px 24px;
}
.progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #65715f;
  font-size: 10px;
}
.progress-copy strong {
  font-size: 12px;
  font-weight: 500;
  color: #5d775d;
  font-variant-numeric: tabular-nums;
}
.progress-copy strong span {
  font-size: 9px;
  margin-left: 2px;
}
.progress-track {
  height: 3px;
  border-radius: 4px;
  background: #e0e7d9;
  overflow: hidden;
}
.progress-track > span {
  display: block;
  height: 100%;
  background: #789b74;
  border-radius: 4px;
  transition: width 500ms ease;
}
.graph-footer {
  display: flex;
  align-items: center;
  gap: 28px;
  margin: 0 26px;
  padding: 21px 0 16px;
  border-top: 1px solid #dde5d7;
}
.graph-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.graph-count strong {
  color: #53684d;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 25px;
  font-weight: 400;
  letter-spacing: -1px;
}
.graph-count span {
  color: #65715f;
  font-size: 9px;
}
.synthetic-label {
  margin-left: auto;
  color: #65715f;
  text-align: right;
  font-size: 8px;
  line-height: 1.5;
}
.graph-disclaimer {
  margin: 0;
  padding: 0 26px 20px;
  color: #65715f;
  font-size: 9px;
  line-height: 1.5;
}
@media (max-width: 600px) {
  .graph-header {
    padding: 23px 20px 19px;
  }
  .graph-heading-group h2 {
    font-size: 21px;
  }
  .graph-run-heading {
    padding-right: 20px;
    padding-left: 20px;
  }
  .graph-footer {
    gap: 19px;
    margin: 0 20px;
  }
  .graph-progress {
    padding-right: 20px;
    padding-left: 20px;
  }
  .graph-disclaimer {
    padding-left: 20px;
    padding-right: 20px;
  }
  .graph-empty {
    min-height: 360px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .network-connections line,
  .node-body,
  .progress-track > span {
    transition: none;
  }
}
</style>
