<script setup>
import { computed, markRaw, onBeforeUnmount, reactive, ref, useId, watch } from "vue";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { Maximize2, Minus, Plus, X } from "@lucide/vue";
import { useDebounceFn, useResizeObserver } from "@vueuse/core";
import AgentNode from "./AgentNode.vue";

const props = defineProps({
  run: { type: Object, default: null },
  sessionTitle: { type: String, default: "" },
});

const flowId = `graph-${useId()}`;
const nodeTypes = { agent: markRaw(AgentNode) };
const { zoomIn, zoomOut, fitView, setCenter } = useVueFlow(flowId);
// Keep the whole graph in frame when the pane changes size (view switch, split drag).
const canvas = ref(null);
useResizeObserver(canvas, useDebounceFn(() => fitView({ padding: 0.2, duration: 200 }), 120));

// Illustrative knowledge graph: who influences whom around one scenario.
const agents = [
  { label: "your scenario", category: "core", x: 228, y: 188 },
  { label: "residents", category: "community", x: 124, y: 117 },
  { label: "clinic staff", category: "provider", x: 337, y: 118 },
  { label: "local press", category: "media", x: 352, y: 245 },
  { label: "caregivers", category: "community", x: 164, y: 291 },
  { label: "commuters", category: "community", x: 76, y: 220 },
  { label: "city council", category: "policy", x: 233, y: 62 },
  { label: "insurers", category: "economy", x: 410, y: 177 },
  { label: "pharmacies", category: "provider", x: 296, y: 330 },
  { label: "students", category: "community", x: 66, y: 70 },
  { label: "seniors", category: "community", x: 85, y: 328 },
  { label: "employers", category: "economy", x: 403, y: 70 },
];
const relations = [
  [0, 1, "affects"], [0, 2, "staffs"], [0, 3, "covered by"], [0, 4, "affects"],
  [0, 5, "affects"], [0, 6, "approved by"], [1, 5, "overlaps"], [1, 6, "lobbies"],
  [1, 9, "includes"], [2, 6, "reports to"], [2, 7, "bills"], [2, 11, "partners"],
  [3, 7, "scrutinizes"], [3, 8, "reports on"], [4, 5, "carpools"], [4, 8, "relies on"],
  [4, 10, "cares for"], [5, 10, "shares transit"],
];
const categories = ["core", "community", "provider", "policy", "media", "economy"];
const ids = agents.map((_, index) => String(index + 1).padStart(2, "0"));

const degree = agents.map((_, index) => relations.filter(([a, b]) => a === index || b === index).length);
const radius = degree.map((count) => 9 + count * 2.2);

// ---------- force layout ----------
const positions = reactive(Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }])));
const simNodes = agents.map((agent, index) => ({ id: ids[index], x: agent.x * 2.2, y: agent.y * 1.8 }));
const simulation = forceSimulation(simNodes)
  .force("link", forceLink(relations.map(([a, b]) => ({ source: ids[a], target: ids[b] }))).id((n) => n.id).distance(120).strength(0.5))
  .force("charge", forceManyBody().strength(-420))
  .force("collide", forceCollide((n) => radius[ids.indexOf(n.id)] + 34))
  .force("center", forceCenter(500, 340))
  .stop();
simulation.tick(300);
syncPositions();

function syncPositions() {
  simNodes.forEach((node, index) => {
    positions[node.id].x = node.x - radius[index];
    positions[node.id].y = node.y - radius[index];
  });
}
let frame = 0;
function loop() {
  simulation.tick();
  syncPositions();
  frame = simulation.alpha() > simulation.alphaMin() ? requestAnimationFrame(loop) : 0;
}
function reheat(target) {
  simulation.alphaTarget(target);
  if (target) simulation.alpha(Math.max(simulation.alpha(), 0.3));
  if (!frame) frame = requestAnimationFrame(loop);
}
// Dragging pins the node; neighbours follow through the link forces.
function onDragStart({ node }) {
  reheat(0.25);
  pin(node);
}
function onDrag({ node }) {
  pin(node);
}
function onDragStop({ node }) {
  const sim = simNodes[ids.indexOf(node.id)];
  sim.fx = null;
  sim.fy = null;
  reheat(0);
}
function pin(node) {
  const index = ids.indexOf(node.id);
  simNodes[index].fx = node.position.x + radius[index];
  simNodes[index].fy = node.position.y + radius[index];
}
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  simulation.stop();
});

// ---------- run state ----------
const status = computed(() => props.run?.status ?? "idle");
const progress = computed(() => {
  if (status.value === "completed") return 100;
  return Math.min(100, Math.max(0, Number(props.run?.progress) || 0));
});
const agentCount = computed(() =>
  Math.min(agents.length, Math.max(1, Math.floor(Number(props.run?.agentCount) || 12))),
);
const reached = computed(() =>
  props.run ? Math.max(1, Math.ceil((progress.value / 100) * agentCount.value)) : 0,
);
function nodeState(index) {
  if (index >= reached.value) return status.value === "stopped" ? "stopped" : "idle";
  return { running: "running", completed: "done", stopped: "stopped" }[status.value] ?? "idle";
}
// Each newly reached agent gives the layout a small nudge so the graph feels alive.
watch(reached, (now, before) => {
  if (now > before) {
    simulation.alpha(0.12);
    reheat(0);
  }
});

// ---------- interaction ----------
const hoveredId = ref(null);
const selectedId = ref(null);
const hidden = reactive(new Set());
const focusId = computed(() => hoveredId.value ?? selectedId.value);
const neighbours = computed(() => {
  if (!focusId.value) return null;
  const index = ids.indexOf(focusId.value);
  const set = new Set([index]);
  relations.forEach(([a, b]) => {
    if (a === index) set.add(b);
    if (b === index) set.add(a);
  });
  return set;
});
function isVisible(index) {
  return index < agentCount.value && !hidden.has(agents[index].category);
}
function toggleCategory(category) {
  if (hidden.has(category)) hidden.delete(category);
  else hidden.add(category);
  if (selectedId.value && !isVisible(ids.indexOf(selectedId.value))) selectedId.value = null;
}
function selectNode(id) {
  selectedId.value = id;
  const index = ids.indexOf(id);
  setCenter(positions[id].x + radius[index], positions[id].y + radius[index], { zoom: 1.15, duration: 400 });
}

const nodes = computed(() =>
  agents.map((agent, index) => ({
    id: ids[index],
    type: "agent",
    position: { x: positions[ids[index]].x, y: positions[ids[index]].y },
    hidden: !isVisible(index),
    connectable: false,
    data: {
      index,
      label: agent.label,
      category: agent.category,
      degree: degree[index],
      radius: radius[index],
      state: nodeState(index),
      dim: Boolean(neighbours.value && !neighbours.value.has(index)),
      focus: focusId.value === ids[index],
      selected: selectedId.value === ids[index],
    },
  })),
);
const edges = computed(() =>
  relations.map(([a, b, relation]) => {
    const live = a < reached.value && b < reached.value;
    const flowing = live && status.value === "running";
    const index = ids.indexOf(focusId.value);
    const lit = Boolean(focusId.value) && (a === index || b === index);
    return {
      id: `e${a}-${b}`,
      source: ids[a],
      target: ids[b],
      type: "straight",
      hidden: !isVisible(a) || !isVisible(b),
      animated: flowing,
      label: lit ? relation : undefined,
      class: [
        "kg-edge",
        live && "is-live",
        flowing && "is-flowing",
        lit && "is-lit",
        focusId.value && !lit && "is-dim",
        status.value === "stopped" && "is-stopped",
      ].filter(Boolean).join(" "),
    };
  }),
);

const selected = computed(() => {
  if (!selectedId.value) return null;
  const index = ids.indexOf(selectedId.value);
  return {
    ...agents[index],
    id: selectedId.value,
    state: nodeState(index),
    links: relations
      .filter(([a, b]) => a === index || b === index)
      .map(([a, b, relation]) => {
        const other = a === index ? b : a;
        return { id: ids[other], label: agents[other].label, category: agents[other].category, relation, outgoing: a === index };
      })
      .filter((link) => isVisible(ids.indexOf(link.id))),
  };
});
const visibleCount = computed(() => nodes.value.filter((node) => !node.hidden).length);
const visibleEdges = computed(() => edges.value.filter((edge) => !edge.hidden).length);
const stageLabel = computed(
  () =>
    props.run?.stage ||
    { running: "exploring connections", completed: "demo complete", stopped: "demo stopped" }[status.value] ||
    "waiting for a run",
);
const stateLabel = { idle: "not reached", running: "active", done: "explored", stopped: "stopped" };
</script>

<template>
  <section class="sim-graph" :aria-labelledby="`${flowId}-title`">
    <header class="graph-head">
      <div class="graph-head-left">
        <h2 :id="`${flowId}-title`" class="mono">knowledge graph</h2>
        <span v-if="run" class="pill mono"
          ><span class="dot" :class="status"></span>{{ status === "completed" ? "done" : status }}
          · {{ Math.round(progress) }}%</span
        >
      </div>
      <span class="mono graph-stage">{{ stageLabel.toLowerCase() }}</span>
    </header>

    <div ref="canvas" class="graph-canvas">
      <VueFlow
        :id="flowId"
        :nodes="nodes"
        :edges="edges"
        :node-types="nodeTypes"
        :nodes-connectable="false"
        :zoom-on-double-click="false"
        :min-zoom="0.35"
        :max-zoom="2"
        fit-view-on-init
        :fit-view-params="{ padding: 0.2 }"
        :aria-label="`Illustrative knowledge graph${sessionTitle ? ` for ${sessionTitle}` : ''}`"
        @node-drag-start="onDragStart"
        @node-drag="onDrag"
        @node-drag-stop="onDragStop"
        @node-mouse-enter="({ node }) => (hoveredId = node.id)"
        @node-mouse-leave="hoveredId = null"
        @node-click="({ node }) => selectNode(node.id)"
        @pane-click="selectedId = null"
      >
        <Background variant="dots" :gap="24" :size="1" />
      </VueFlow>

      <div class="kg-legend" role="group" aria-label="Filter categories">
        <button
          v-for="category in categories"
          :key="category"
          class="kg-chip mono"
          :class="{ off: hidden.has(category) }"
          :aria-pressed="!hidden.has(category)"
          :style="{ '--cat': `var(--kg-${category})` }"
          @click="toggleCategory(category)"
        >
          <i></i>{{ category }}
        </button>
      </div>

      <div class="kg-controls" role="group" aria-label="Zoom">
        <button class="icon-btn" aria-label="Zoom in" @click="zoomIn({ duration: 200 })"><Plus :size="14" /></button>
        <button class="icon-btn" aria-label="Zoom out" @click="zoomOut({ duration: 200 })"><Minus :size="14" /></button>
        <button class="icon-btn" aria-label="Fit graph" @click="fitView({ padding: 0.2, duration: 300 })"><Maximize2 :size="13" /></button>
      </div>

      <Transition name="panel">
        <aside v-if="selected" class="kg-panel" :style="{ '--cat': `var(--kg-${selected.category})` }">
          <div class="kg-panel-head">
            <span class="kg-swatch"></span>
            <div>
              <strong>{{ selected.label }}</strong>
              <span class="mono">agent {{ selected.id }} — {{ selected.category }} — {{ stateLabel[selected.state] }}</span>
            </div>
            <button class="icon-btn" aria-label="Close details" @click="selectedId = null"><X :size="14" /></button>
          </div>
          <p class="mono kg-panel-label">relations · {{ selected.links.length }}</p>
          <ul>
            <li v-for="link in selected.links" :key="link.id">
              <button class="kg-link" :style="{ '--cat': `var(--kg-${link.category})` }" @click="selectNode(link.id)">
                <span class="mono kg-rel">{{ link.outgoing ? "" : "← " }}{{ link.relation }}{{ link.outgoing ? " →" : "" }}</span>
                <i></i><span>{{ link.label }}</span>
              </button>
            </li>
          </ul>
        </aside>
      </Transition>

      <div v-if="!run" class="graph-empty">
        <p class="mono">no run yet</p>
        <p>start a simulation to bring the graph to life.</p>
      </div>
    </div>

    <footer class="graph-foot mono">
      <span>{{ String(visibleCount).padStart(2, "0") }} agents — {{ String(visibleEdges).padStart(2, "0") }} relations — drag, hover, click</span>
      <span>illustrative topology — not model output</span>
    </footer>
  </section>
</template>

<style scoped>
.sim-graph {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--canvas);
}
.graph-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid var(--hairline);
}
.graph-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.graph-head h2 {
  margin: 0;
  color: var(--muted);
  font-weight: 400;
}
.graph-stage {
  overflow: hidden;
  color: var(--faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-canvas {
  position: relative;
  flex: 1;
  min-height: 280px;
}

/* legend / filters */
.kg-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100% - 120px);
}
.kg-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: color-mix(in srgb, var(--canvas) 85%, transparent);
  color: var(--muted);
  transition:
    color 120ms var(--ease),
    opacity 120ms var(--ease),
    border-color 120ms var(--ease);
}
.kg-chip i {
  width: 7px;
  height: 7px;
  border: 1.5px solid var(--cat);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cat) 35%, transparent);
}
.kg-chip:hover {
  border-color: color-mix(in srgb, var(--cat) 50%, var(--hairline));
  color: var(--ink);
}
.kg-chip.off {
  opacity: 0.45;
  text-decoration: line-through;
}

/* zoom controls */
.kg-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: grid;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface-raised);
}
.kg-controls .icon-btn {
  width: 26px;
  height: 26px;
}

/* detail panel */
.kg-panel {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 6;
  width: min(280px, calc(100% - 24px));
  max-height: calc(100% - 64px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  background: var(--surface-raised);
  box-shadow: var(--overlay-shadow);
}
.kg-panel-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 10px;
}
.kg-panel-head strong {
  display: block;
  color: var(--ink);
  font-size: 14px;
  font-weight: 500;
}
.kg-panel-head .mono {
  color: var(--faint);
}
.kg-swatch {
  width: 12px;
  height: 12px;
  margin-top: 3px;
  border: 1.5px solid var(--cat);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cat) 35%, var(--canvas));
}
.kg-panel-label {
  margin: 12px 0 4px;
  color: var(--faint);
}
.kg-panel ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.kg-link {
  display: grid;
  grid-template-columns: 92px auto 1fr;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--body);
  font-size: 13px;
  text-align: left;
  transition: background 120ms var(--ease);
}
.kg-link:hover {
  background: var(--surface-hover);
  color: var(--ink);
}
.kg-link i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--cat);
}
.kg-rel {
  overflow: hidden;
  color: var(--faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 180ms var(--ease),
    transform 180ms var(--ease);
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 6px;
  text-align: center;
  pointer-events: none;
  background: color-mix(in srgb, var(--canvas) 55%, transparent);
}
.graph-empty p {
  margin: 0;
  color: var(--muted);
}
.graph-empty .mono {
  color: var(--faint);
}
.graph-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--hairline);
  color: var(--faint);
}

/* edges */
:deep(.kg-edge .vue-flow__edge-path) {
  stroke: var(--kg-edge);
  stroke-width: 1;
  transition:
    stroke 250ms var(--ease),
    stroke-width 150ms var(--ease),
    opacity 300ms var(--ease);
}
:deep(.kg-edge.is-live .vue-flow__edge-path) {
  stroke: color-mix(in srgb, var(--muted) 55%, var(--kg-edge));
}
:deep(.kg-edge.is-flowing .vue-flow__edge-path) {
  stroke: color-mix(in srgb, var(--accent) 70%, var(--kg-edge));
  stroke-dasharray: 4 6;
  animation-duration: 1.6s;
}
:deep(.kg-edge.is-lit .vue-flow__edge-path) {
  stroke: var(--muted);
  stroke-width: 1.5;
}
:deep(.kg-edge.is-dim .vue-flow__edge-path) {
  opacity: 0.15;
}
:deep(.kg-edge.is-stopped .vue-flow__edge-path) {
  opacity: 0.4;
}
:deep(.vue-flow__edge-textbg) {
  fill: var(--surface-raised);
}
:deep(.vue-flow__edge-text) {
  fill: var(--muted);
  font-family: var(--font-mono-stack);
  font-size: 10px;
}
:deep(.vue-flow__node) {
  cursor: grab;
}
:deep(.vue-flow__node.dragging) {
  cursor: grabbing;
}

@media (max-width: 640px) {
  .graph-foot span:last-child {
    display: none;
  }
  .kg-legend {
    max-width: calc(100% - 60px);
  }
}
@media (prefers-reduced-motion: reduce) {
  :deep(.kg-edge.is-flowing .vue-flow__edge-path) {
    animation: none;
  }
}
</style>
