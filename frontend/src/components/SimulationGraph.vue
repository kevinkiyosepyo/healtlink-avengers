<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  triggerRef,
  useId,
  watch,
} from "vue";
import GraphIcon from "./GraphIcon.vue";
import {
  GRAPH_TYPES,
  createSimulationGraph,
  stepLayout,
  settleLayout,
  getNeighborhood,
  fitGraph,
  zoomCamera,
} from "../lib/simulationGraph.js";

const props = defineProps({
  run: { type: Object, default: null },
  sessionTitle: { type: String, default: "" },
  graphData: { type: Object, default: null },
  activeNodeIds: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: null },
  showDetails: { type: Boolean, default: true },
});
const emit = defineEmits(["node-select"]);
const graphId = useId();
const panel = ref(null);
const stage = ref(null);
const svg = ref(null);
const searchInput = ref(null);
const rootFontSize = ref(16);
const nodes = shallowRef([]);
const links = shallowRef([]);
const size = ref({ width: 800, height: 600 });
const camera = ref({ x: 400, y: 300, k: 1 });
const selectedId = ref(null);
const hoveredId = ref(null);
const search = ref("");
const hiddenTypes = ref([]);
const showLabels = ref(true);
const paused = ref(false);
const reducedMotion = ref(false);
const moving = ref(false);
const dragging = ref(false);
const fullscreen = ref(false);
// An external profile rail is outside the fullscreen element, so keep node
// details available inside the graph when it occupies the whole screen.
const detailsEnabled = computed(() => props.showDetails || fullscreen.value);
const canFullscreen = ref(false);
const notice = ref("");
const nodeById = computed(
  () => new Map(nodes.value.map((node) => [node.id, node])),
);
const selectedNode = computed(() => nodeById.value.get(selectedId.value));
const activeIds = computed(() => new Set(props.activeNodeIds));
const visibleNodes = computed(() =>
  nodes.value.filter((node) => !hiddenTypes.value.includes(node.type)),
);
const visibleIds = computed(
  () => new Set(visibleNodes.value.map((node) => node.id)),
);
const visibleLinks = computed(() =>
  links.value.filter(
    (link) =>
      visibleIds.value.has(link.source) && visibleIds.value.has(link.target),
  ),
);
const focusId = computed(() => hoveredId.value || selectedId.value);
const neighborhood = computed(() =>
  focusId.value ? getNeighborhood(focusId.value, links.value) : null,
);
const query = computed(() => search.value.trim().toLowerCase());
const matches = computed(() =>
  query.value
    ? nodes.value.filter((node) =>
        `${node.label} ${typeFor(node.type).label}`
          .toLowerCase()
          .includes(query.value),
      )
    : [],
);
const matchIds = computed(() => new Set(matches.value.map((node) => node.id)));
const selectedLinks = computed(() =>
  selectedNode.value
    ? links.value.filter(
        (link) =>
          link.source === selectedId.value || link.target === selectedId.value,
      )
    : [],
);
const progress = computed(() =>
  Math.min(100, Math.max(0, Number(props.run?.progress) || 0)),
);
const statusLabel = computed(() => {
  if (props.graphData) {
    return ({ running: "Scripted review playing", completed: "Replay complete", stopped: "Replay paused", paused: "Replay paused" })[
      props.run?.status
    ] || "Scripted demo";
  }
  return ({ running: "Running", completed: "Complete", stopped: "Stopped" })[
    props.run?.status
  ] || "Sample preview";
});
const transform = computed(
  () =>
    `translate(${camera.value.x},${camera.value.y}) scale(${camera.value.k})`,
);
const typeColors = {
  scenario: "var(--ui-accent)",
  agent: "var(--ui-info)",
  factor: "var(--ui-warning)",
  outcome: "var(--ui-purple)",
};
const graphTypes = computed(() => props.graphData?.types || GRAPH_TYPES);
const typeById = computed(() => new Map(
  graphTypes.value.map((type) => [type.id, {
    ...type,
    color: props.graphData ? type.color || "var(--ui-muted)" : typeColors[type.id],
  }]),
));
let frame = 0;
let alpha = 0;
let cameraTween = null;
let observer;
let motionQuery;
let initialized = false;
let lastTime = 0;
let dragState = null;
let suppressClick = false;
let suppressTimer;
const pointers = new Map();
let pinch = null;

function typeFor(id) {
  return typeById.value.get(id) || { label: id, color: "var(--ui-muted)" };
}
function labelFor(node) {
  const label =
    node.type === "agent"
      ? node.label.replace(/^Agent (\d+) · (.*)$/, "$2 $1")
      : node.label;
  return label.length > 21 ? `${label.slice(0, 19)}…` : label;
}
// Place labels in screen space so they stay readable without covering nearby nodes.
const labelPlacements = computed(() => {
  const result = new Map(),
    occupied = [];
  const k = camera.value.k;
  const candidates = [...visibleNodes.value].sort((a, b) => {
    const priority = (node) =>
      node.id === selectedId.value
        ? 100
        : matchIds.value.has(node.id)
          ? 80
          : node.type === "scenario"
            ? 60
            : node.type === "agent" || node.kind === "agent"
              ? 20
              : 0;
    return priority(b) - priority(a);
  });
  for (const node of candidates) {
    const forced =
      node.id === focusId.value ||
      node.id === selectedId.value ||
      matchIds.value.has(node.id);
    if (!showLabels.value && !forced) continue;
    // At overview scale, label each role once; its other lenses remain searchable.
    if (node.lensId && node.lensId !== "case-review" && k < 0.9 && !forced) continue;
    const font = rootFontSize.value * (node.type === "scenario" ? .875 : .75);
    const width = labelFor(node).length * font * 0.56;
    const x = node.x * k + camera.value.x,
      y = node.y * k + camera.value.y;
    const gap = node.radius * k + 7;
    const positions = [
      { x: gap, y: 4, anchor: "start" },
      { x: -gap, y: 4, anchor: "end" },
      { x: 0, y: -gap, anchor: "middle" },
      { x: 0, y: gap + font - 2, anchor: "middle" },
    ];
    for (let index = 0; index < positions.length; index++) {
      const position = positions[index];
      const left =
        x +
        position.x -
        (position.anchor === "end"
          ? width
          : position.anchor === "middle"
            ? width / 2
            : 0);
      const rect = {
        left,
        right: left + width,
        top: y + position.y - font,
        bottom: y + position.y + 3,
      };
      const overlap = occupied.some(
        (other) =>
          rect.left < other.right + 5 &&
          rect.right > other.left - 5 &&
          rect.top < other.bottom + 3 &&
          rect.bottom > other.top - 3,
      );
      const coversNode = visibleNodes.value.some((other) => {
        if (other.id === node.id) return false;
        const px = other.x * k + camera.value.x,
          py = other.y * k + camera.value.y;
        return (
          Math.hypot(
            px - Math.max(rect.left, Math.min(rect.right, px)),
            py - Math.max(rect.top, Math.min(rect.bottom, py)),
          ) < Math.max(15, other.radius * k + 4)
        );
      });
      const inView =
        rect.left > 6 &&
        rect.right < size.value.width - 6 &&
        rect.top > 6 &&
        rect.bottom < size.value.height - 6;
      if (
        (!overlap && !coversNode && inView) ||
        (forced && index === positions.length - 1)
      ) {
        result.set(node.id, {
          x: position.x / k,
          y: position.y / k,
          anchor: position.anchor,
          font: font / k,
        });
        occupied.push(rect);
        break;
      }
    }
  }
  return result;
});
function dimNode(node) {
  if (neighborhood.value) return !neighborhood.value.has(node.id);
  return Boolean(query.value) && !matchIds.value.has(node.id);
}
function highlightedLink(link) {
  return link.source === focusId.value || link.target === focusId.value;
}
function activeLink(link) {
  return !focusId.value && (activeIds.value.has(link.source) || activeIds.value.has(link.target));
}
function edgePath(link, index) {
  const a = nodeById.value.get(link.source);
  const b = nodeById.value.get(link.target);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = (index % 2 ? 1 : -1) * Math.min(28, length * 0.1);
  return `M${a.x},${a.y} Q${(a.x + b.x) / 2 - (dy / length) * bend},${(a.y + b.y) / 2 + (dx / length) * bend} ${b.x},${b.y}`;
}
function wake() {
  if (!frame) frame = requestAnimationFrame(animate);
}
function reheat(amount = 0.55) {
  if (paused.value || reducedMotion.value) return;
  alpha = Math.max(alpha, amount);
  moving.value = true;
  wake();
}
function animate(time) {
  frame = 0;
  const dt = Math.min(
    1.8,
    Math.max(0.3, lastTime ? (time - lastTime) / 16.67 : 1),
  );
  lastTime = time;
  if (alpha > 0.008 && !paused.value && !reducedMotion.value) {
    stepLayout(nodes.value, links.value, { alpha, dt });
    alpha *= Math.pow(0.965, dt);
    triggerRef(nodes);
  }
  moving.value = alpha > 0.008 && !paused.value && !reducedMotion.value;
  if (cameraTween) {
    const t = Math.min(1, (time - cameraTween.startedAt) / 260);
    const eased = 1 - Math.pow(1 - t, 3);
    const { from, to } = cameraTween;
    camera.value = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      k: from.k + (to.k - from.k) * eased,
    };
    if (t === 1) cameraTween = null;
  }
  if (moving.value || cameraTween) wake();
  else lastTime = 0;
}
function moveCamera(to, smooth = true) {
  if (!smooth || reducedMotion.value) {
    cameraTween = null;
    camera.value = to;
    return;
  }
  cameraTween = { from: { ...camera.value }, to, startedAt: performance.now() };
  wake();
}
function usableWidth() {
  return detailsEnabled.value && selectedNode.value && size.value.width >= 700
    ? size.value.width - 300
    : size.value.width;
}
function fitView(smooth = true) {
  moveCamera(
    fitGraph(visibleNodes.value, usableWidth(), size.value.height, 42),
    smooth,
  );
}
function zoomBy(
  factor,
  point = { x: usableWidth() / 2, y: size.value.height / 2 },
  smooth = true,
) {
  moveCamera(zoomCamera(camera.value, factor, point, 0.25, 3), smooth);
}
function selectNode(id, center = false, notify = true) {
  const node = nodeById.value.get(id);
  if (!node) return;
  selectedId.value = id;
  hoveredId.value = null;
  search.value = "";
  hiddenTypes.value = hiddenTypes.value.filter((type) => type !== node.type);
  if (notify) emit("node-select", node);
  if (center) {
    const k = Math.max(0.8, camera.value.k);
    moveCamera({
      x: usableWidth() / 2 - node.x * k,
      y: size.value.height * (detailsEnabled.value && size.value.width < 700 ? 0.3 : 0.48) - node.y * k,
      k,
    });
  }
}
function clearSelection(notify = true) {
  const hadSelection = selectedId.value !== null;
  selectedId.value = null;
  hoveredId.value = null;
  if (notify && hadSelection) emit("node-select", null);
}
function focusNode(id) {
  selectNode(id, true);
}
defineExpose({ focusNode });
function closeInspector() {
  const id = selectedId.value;
  clearSelection();
  nextTick(() =>
    [...(svg.value?.querySelectorAll("[data-node-id]") || [])]
      .find((element) => element.dataset.nodeId === id)
      ?.focus({ preventScroll: true }),
  );
}
function toggleType(type) {
  hiddenTypes.value = hiddenTypes.value.includes(type)
    ? hiddenTypes.value.filter((id) => id !== type)
    : [...hiddenTypes.value, type];
  if (selectedNode.value?.type === type && hiddenTypes.value.includes(type))
    clearSelection();
  hoveredId.value = null;
}
function togglePin() {
  const node = selectedNode.value;
  if (!node) return;
  node.pinned = !node.pinned;
  if (node.pinned) {
    node.fx = node.x;
    node.fy = node.y;
  } else {
    delete node.fx;
    delete node.fy;
    reheat();
  }
  triggerRef(nodes);
}
function toggleMotion() {
  paused.value = !paused.value;
  if (paused.value) {
    alpha = 0;
    moving.value = false;
  } else reheat(0.6);
}
function rebuild() {
  cancelGesture();
  clearSelection(false);
  search.value = "";
  hiddenTypes.value = [];
  // Layout and pinning mutate coordinates. Keep supplied case data immutable,
  // including nested profile properties shared with the external review rail.
  const graph = props.graphData
    ? JSON.parse(JSON.stringify({ nodes: props.graphData.nodes, links: props.graphData.links }))
    : createSimulationGraph(props.run, props.sessionTitle);
  settleLayout(graph.nodes, graph.links, 110);
  nodes.value = graph.nodes;
  links.value = graph.links;
  if (props.selectedNodeId) selectNode(props.selectedNodeId, false, false);
  fitView(false);
  reheat(0.5);
}
function localPoint(event) {
  const rect = svg.value.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * size.value.width) / rect.width,
    y: ((event.clientY - rect.top) * size.value.height) / rect.height,
  };
}
function worldPoint(point) {
  return {
    x: (point.x - camera.value.x) / camera.value.k,
    y: (point.y - camera.value.y) / camera.value.k,
  };
}
function releaseNode() {
  if (dragState?.node && !dragState.node.pinned) {
    delete dragState.node.fx;
    delete dragState.node.fy;
  }
}
function pointerDown(event, node = null) {
  if (event.button !== 0 || event.target.closest?.(".node-label-only")) return;
  cameraTween = null;
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  svg.value.setPointerCapture(event.pointerId);
  if (pointers.size === 2) {
    releaseNode();
    dragState = null;
    const [a, b] = [...pointers.values()];
    pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
    dragging.value = true;
    suppressClick = true;
    return;
  }
  if (pointers.size !== 1) return;
  dragState = {
    pointerId: event.pointerId,
    node,
    start: point,
    last: point,
    moved: false,
    offset: node
      ? { x: node.x - worldPoint(point).x, y: node.y - worldPoint(point).y }
      : null,
  };
  if (node) {
    node.fx = node.x;
    node.fy = node.y;
    hoveredId.value = null;
  }
}
function pointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const next = zoomCamera(
      camera.value,
      distance / pinch.distance,
      pinch.mid,
      0.25,
      3,
    );
    camera.value = {
      ...next,
      x: next.x + mid.x - pinch.mid.x,
      y: next.y + mid.y - pinch.mid.y,
    };
    pinch = { distance, mid };
    return;
  }
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  if (Math.hypot(point.x - dragState.start.x, point.y - dragState.start.y) > 3)
    dragState.moved = true;
  if (!dragState.moved) return;
  dragging.value = true;
  if (dragState.node) {
    const world = worldPoint(point);
    Object.assign(dragState.node, {
      x: world.x + dragState.offset.x,
      y: world.y + dragState.offset.y,
      fx: world.x + dragState.offset.x,
      fy: world.y + dragState.offset.y,
      vx: 0,
      vy: 0,
    });
    triggerRef(nodes);
    reheat(0.4);
  } else {
    camera.value = {
      ...camera.value,
      x: camera.value.x + point.x - dragState.last.x,
      y: camera.value.y + point.y - dragState.last.y,
    };
  }
  dragState.last = point;
}
function pointerUp(event) {
  const wasPinching = Boolean(pinch);
  pointers.delete(event.pointerId);
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId);
  if (dragState?.pointerId === event.pointerId) {
    const { node, moved } = dragState;
    releaseNode();
    if (moved) {
      suppressClick = true;
      reheat(0.3);
    } else if (event.type !== "pointercancel") {
      if (node) selectNode(node.id);
      else clearSelection();
    }
    dragState = null;
  }
  if (wasPinching) {
    pinch = null;
    if (pointers.size === 1) {
      const [pointerId, point] = [...pointers.entries()][0];
      dragState = {
        pointerId,
        node: null,
        start: point,
        last: point,
        moved: true,
      };
    }
  }
  dragging.value = pointers.size > 0;
  clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => {
    suppressClick = false;
  }, 0);
}
function cancelGesture() {
  releaseNode();
  for (const id of pointers.keys())
    if (svg.value?.hasPointerCapture(id)) svg.value.releasePointerCapture(id);
  pointers.clear();
  dragState = null;
  pinch = null;
  dragging.value = false;
}
function nodeClick(event, node) {
  // Mouse/touch selection is handled on pointerup; keyboard and assistive clicks use click.
  if (!suppressClick && event.detail === 0) selectNode(node.id);
}
function onWheel(event) {
  const delta =
    event.deltaY *
    (event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? size.value.height
        : 1);
  zoomBy(
    Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.003),
    localPoint(event),
    false,
  );
}
function graphKeydown(event) {
  if (event.key === "Escape") {
    if (selectedNode.value) closeInspector();
    search.value = "";
    return;
  }
  if (
    event.target.closest("input,button") ||
    event.target.closest("[data-node-id]")
  )
    return;
  const pan = {
    ArrowLeft: [45, 0],
    ArrowRight: [-45, 0],
    ArrowUp: [0, 45],
    ArrowDown: [0, -45],
  }[event.key];
  if (pan) {
    event.preventDefault();
    moveCamera({
      ...camera.value,
      x: camera.value.x + pan[0],
      y: camera.value.y + pan[1],
    });
  }
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomBy(1.2);
  }
  if (event.key === "-") {
    event.preventDefault();
    zoomBy(1 / 1.2);
  }
  if (event.key === "0") {
    event.preventDefault();
    fitView();
  }
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === panel.value)
      await document.exitFullscreen();
    else await panel.value.requestFullscreen();
  } catch {
    notice.value =
      "Fullscreen is unavailable in this browser. You can still zoom and pan here.";
  }
}
function fullscreenChanged() {
  fullscreen.value = document.fullscreenElement === panel.value;
}
function motionChanged(event) {
  reducedMotion.value = event.matches;
  if (event.matches) {
    alpha = 0;
    moving.value = false;
    cameraTween = null;
  }
}
watch(
  () => props.graphData || props.run?.id,
  () => {
    if (initialized) rebuild();
  },
);
watch(
  () => props.selectedNodeId,
  (id) => {
    if (id) selectNode(id, false, false);
    else clearSelection(false);
  },
);
watch(
  () => props.sessionTitle,
  () => {
    if (props.graphData) return;
    const scenario = nodes.value.find((node) => node.type === "scenario");
    if (scenario) {
      const title =
        props.sessionTitle || props.run?.prompt || "Sample scenario";
      scenario.label = title;
      scenario.properties.Scenario = title;
      triggerRef(nodes);
    }
  },
);
onMounted(() => {
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionChanged(motionQuery);
  motionQuery.addEventListener("change", motionChanged);
  canFullscreen.value = Boolean(
    document.fullscreenEnabled && panel.value.requestFullscreen,
  );
  document.addEventListener("fullscreenchange", fullscreenChanged);
  observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (!width || !height) return;
    rootFontSize.value = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const previous = size.value;
    size.value = { width, height };
    if (!initialized) {
      initialized = true;
      rebuild();
    } else {
      cameraTween = null;
      camera.value = {
        ...camera.value,
        x: camera.value.x + (width - previous.width) / 2,
        y: camera.value.y + (height - previous.height) / 2,
      };
    }
  });
  observer.observe(stage.value);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  clearTimeout(suppressTimer);
  observer?.disconnect();
  motionQuery?.removeEventListener("change", motionChanged);
  document.removeEventListener("fullscreenchange", fullscreenChanged);
  cancelGesture();
});
</script>

<template>
  <section
    ref="panel"
    class="simulation-graph"
    :class="{ 'is-fullscreen': fullscreen, 'is-custom-graph': graphData, 'has-reduced-motion': reducedMotion }"
    :aria-labelledby="`${graphId}-heading`"
  >
    <header class="graph-header">
      <div>
        <h2 :id="`${graphId}-heading`">{{ graphData?.title || 'Research connections' }}</h2>
        <p v-if="graphData?.description" class="graph-description">{{ graphData.description }}</p>
      </div>
      <div class="graph-header-actions">
        <span class="graph-demo-tag">{{
          graphData ? "Scripted demo" : run ? "Demo graph" : "Sample graph"
        }}</span
        ><button
          v-if="canFullscreen"
          class="graph-icon-button"
          :aria-label="
            fullscreen ? 'Exit fullscreen' : 'Expand graph to fullscreen'
          "
          :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="toggleFullscreen"
        >
          <GraphIcon :name="fullscreen ? 'collapse' : 'expand'" />
        </button>
      </div>
    </header>
    <div class="graph-toolbar">
      <div class="graph-search">
        <GraphIcon name="search" :size="16" /><label
          class="sr-only"
          :for="`${graphId}-search`"
          >Search graph nodes</label
        ><input
          :id="`${graphId}-search`"
          ref="searchInput"
          v-model="search"
          type="search"
          placeholder="Find a node…"
          autocomplete="off"
          @keydown.esc.stop="search = ''"
          @keydown.enter.prevent="
            matches.length && selectNode(matches[0].id, true)
          "
        />
        <div v-if="query" class="graph-search-results">
          <span class="search-result-count"
            >{{ matches.length }}
            {{ matches.length === 1 ? "match" : "matches" }}</span
          ><button
            v-for="node in matches.slice(0, 7)"
            :key="node.id"
            @click="selectNode(node.id, true)"
          >
            <i :style="{ background: typeFor(node.type).color }"></i
            ><span>{{ node.label }}</span
            ><GraphIcon name="arrow" :size="14" />
          </button>
          <p v-if="!matches.length">
            Try an agent name or a factor like “Timing”.
          </p>
        </div>
      </div>
      <div class="graph-toolbar-buttons">
        <button
          class="graph-tool-button"
          :aria-pressed="showLabels"
          @click="showLabels = !showLabels"
        >
          <span class="labels-icon">Aa</span><span>Labels</span></button
        ><button
          class="graph-tool-button"
          :disabled="reducedMotion"
          :aria-label="paused ? 'Resume layout' : 'Pause layout'"
          :aria-pressed="paused"
          :title="
            reducedMotion
              ? 'Motion reduced by your device preference'
              : paused
                ? 'Resume layout'
                : 'Pause layout'
          "
          @click="toggleMotion"
        >
          <GraphIcon :name="paused ? 'play' : 'pause'" :size="15" /><span>{{
            paused ? "Resume" : "Pause"
          }}</span></button
        ><button
          class="graph-icon-button"
          title="Reset layout"
          aria-label="Reset graph layout"
          @click="rebuild"
        >
          <GraphIcon name="refresh" :size="17" />
        </button>
      </div>
    </div>
    <p v-if="notice" class="graph-notice" role="status">{{ notice }}</p>
    <div
      ref="stage"
      class="graph-stage"
      :class="{ 'is-dragging': dragging, 'has-selection': detailsEnabled && selectedNode }"
      @keydown="graphKeydown"
    >
      <svg
        ref="svg"
        class="graph-svg"
        :viewBox="`0 0 ${size.width} ${size.height}`"
        role="group"
        :aria-labelledby="`${graphId}-svg-title ${graphId}-svg-desc`"
        tabindex="0"
        @pointerdown="pointerDown($event)"
        @pointermove="pointerMove"
        @pointerup="pointerUp"
        @pointercancel="pointerUp"
        @wheel.prevent="onWheel"
      >
        <title :id="`${graphId}-svg-title`">
          {{ graphData?.title || `Interactive demo network${sessionTitle ? ` for ${sessionTitle}` : ''}` }}
        </title>
        <desc :id="`${graphId}-svg-desc`">
          Drag a node to move it. Drag the canvas to pan, or scroll to zoom. Use
          Tab to reach nodes, Enter to inspect, and Escape to clear selection.
          On the canvas, arrow keys pan, plus and minus zoom, and zero fits the
          graph. {{ graphData?.description || 'All graph data is illustrative.' }}
        </desc>
        <defs>
          <pattern
            :id="`${graphId}-grid`"
            :width="24 * camera.k"
            :height="24 * camera.k"
            patternUnits="userSpaceOnUse"
            :x="camera.x % (24 * camera.k)"
            :y="camera.y % (24 * camera.k)"
          >
            <circle cx="1" cy="1" r=".8" fill="var(--ui-border)" />
          </pattern>
          <filter
            :id="`${graphId}-shadow`"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="3"
              flood-color="var(--ui-text)"
              flood-opacity=".13"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" :fill="`url(#${graphId}-grid)`" />
        <g :transform="transform">
          <g class="graph-links" aria-hidden="true">
            <path
              v-for="(link, index) in visibleLinks"
              :key="link.id"
              :d="edgePath(link, index)"
              :class="{
                'link-highlight': highlightedLink(link),
                'link-muted': focusId && !highlightedLink(link),
                'link-active': activeLink(link),
              }"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <g
            v-for="node in visibleNodes"
            :key="node.id"
            :data-node-id="node.id"
            class="graph-node"
            :class="{
              'node-selected': selectedId === node.id,
              'node-focused': focusId === node.id,
              'node-muted': dimNode(node),
              'node-pinned': node.pinned,
              'node-active': activeIds.has(node.id),
            }"
            :transform="`translate(${node.x},${node.y})`"
            tabindex="0"
            role="button"
            :aria-label="`Inspect ${node.label} (${typeFor(node.type).label})`"
            :aria-pressed="selectedId === node.id"
            @pointerdown.stop="pointerDown($event, node)"
            @pointerenter="!dragging && (hoveredId = node.id)"
            @pointerleave="hoveredId = null"
            @click.stop="nodeClick($event, node)"
            @keydown.enter.prevent.stop="selectNode(node.id)"
            @keydown.space.prevent.stop="selectNode(node.id)"
          >
            <title>{{ node.label }} · {{ typeFor(node.type).label }}</title>
            <circle
              class="node-hit-area"
              :r="Math.max(22 / camera.k, node.radius + 8)"
              fill="transparent"
            />
            <circle
              v-if="activeIds.has(node.id)"
              class="node-activity-halo"
              :r="node.radius + 11"
              :fill="typeFor(node.type).color"
              :stroke="typeFor(node.type).color"
              stroke-width="1"
              aria-hidden="true"
            />
            <circle
              class="node-ring"
              :r="node.radius + 6"
              fill="none"
              :stroke="
                selectedId === node.id ? 'var(--ui-focus)' : typeFor(node.type).color
              "
              stroke-width="1.5"
            />
            <circle
              class="node-dot"
              :r="node.radius"
              :fill="typeFor(node.type).color"
              stroke="var(--ui-surface)"
              stroke-width="2.5"
              :filter="`url(#${graphId}-shadow)`"
            />
            <circle v-if="node.pinned" :r="2.3" fill="var(--ui-surface)" />
            <text
              v-if="labelPlacements.has(node.id)"
              :x="labelPlacements.get(node.id).x"
              :y="labelPlacements.get(node.id).y"
              :text-anchor="labelPlacements.get(node.id).anchor"
              class="node-label"
              :style="{ fontSize: `${labelPlacements.get(node.id).font}px` }"
              :class="{ 'node-label-main': node.type === 'scenario' }"
            >
              {{ labelFor(node) }}
            </text>
          </g>
        </g>
      </svg>
      <div v-if="!visibleNodes.length" class="graph-no-nodes">
        <GraphIcon name="network" :size="28" />
        <h3>No entity types selected</h3>
        <p>Turn a type back on to explore its connections.</p>
        <button
          @click="
            hiddenTypes = [];
            fitView();
          "
        >
          Show all entities
        </button>
      </div>
      <div class="graph-zoom-controls" aria-label="Graph navigation">
        <button
          aria-label="Zoom in"
          title="Zoom in (+)"
          :disabled="camera.k >= 2.99"
          @click="zoomBy(1.25)"
        >
          <GraphIcon name="plus" /></button
        ><span class="zoom-value" aria-live="off"
          >{{ Math.round(camera.k * 100) }}%</span
        ><button
          aria-label="Zoom out"
          title="Zoom out (−)"
          :disabled="camera.k <= 0.251"
          @click="zoomBy(0.8)"
        >
          <GraphIcon name="minus" /></button
        ><span class="zoom-divider"></span
        ><button
          aria-label="Fit graph to view"
          title="Fit to view (0)"
          @click="fitView()"
        >
          <GraphIcon name="fit" />
        </button>
      </div>
      <aside
        v-if="detailsEnabled && selectedNode"
        class="graph-inspector"
        aria-label="Node details"
      >
        <div class="inspector-top">
          <span>NODE DETAILS</span
          ><button
            class="graph-icon-button"
            aria-label="Close node details"
            @click="closeInspector"
          >
            <GraphIcon name="close" :size="17" />
          </button>
        </div>
        <span class="node-type-pill"
          ><i :style="{ background: typeFor(selectedNode.type).color }"></i
          >{{ typeFor(selectedNode.type).label }}</span
        >
        <h3>{{ selectedNode.label }}</h3>
        <p class="node-description">{{ selectedNode.description }}</p>
        <dl class="node-properties">
          <div>
            <dt>Connections</dt>
            <dd>{{ selectedLinks.length }}</dd>
          </div>
          <div v-for="(value, key) in selectedNode.properties" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
        <button
          class="pin-button"
          :aria-pressed="Boolean(selectedNode.pinned)"
          @click="togglePin"
        >
          <GraphIcon name="pin" :size="14" />{{
            selectedNode.pinned ? "Unpin position" : "Pin position"
          }}<span>{{ selectedNode.pinned ? "Fixed" : "Move freely" }}</span>
        </button>
        <div class="connections-heading">
          <h4>Connected nodes</h4>
          <span>{{ selectedLinks.length }}</span>
        </div>
        <div class="connection-list">
          <button
            v-for="link in selectedLinks"
            :key="link.id"
            class="connection-button"
            @click="
              selectNode(
                link.source === selectedId ? link.target : link.source,
                true,
              )
            "
          >
            <i
              :style="{
                background: typeFor(
                  nodeById.get(
                    link.source === selectedId ? link.target : link.source,
                  ).type,
                ).color,
              }"
            ></i
            ><span
              ><strong>{{
                nodeById.get(
                  link.source === selectedId ? link.target : link.source,
                ).label
              }}</strong
              ><small>{{ link.label }}</small></span
            ><GraphIcon name="arrow" :size="14" />
          </button>
        </div>
      </aside>
      <div v-if="!selectedNode" class="graph-interaction-hint">
        Drag to explore <span>·</span> Scroll to zoom <span>·</span> Click a
        node
      </div>
    </div>
    <div class="graph-legend">
      <span class="legend-heading">Entity types</span>
      <div class="legend-types">
        <button
          v-for="type in graphTypes"
          :key="type.id"
          :aria-pressed="!hiddenTypes.includes(type.id)"
          :aria-label="`${hiddenTypes.includes(type.id) ? 'Show' : 'Hide'} ${type.label} nodes`"
          :class="{ 'type-hidden': hiddenTypes.includes(type.id) }"
          @click="toggleType(type.id)"
        >
          <i :style="{ background: typeFor(type.id).color }"></i>{{ type.label
          }}<span>{{
            nodes.filter((node) => node.type === type.id).length
          }}</span>
        </button>
      </div>
    </div>
    <footer class="graph-footer">
      <span
        ><strong>{{ visibleNodes.length }}</strong> nodes
        <span class="footer-separator">/</span>
        <strong>{{ visibleLinks.length }}</strong> relationships</span
      ><span class="graph-layout-status"
        ><i :class="{ 'layout-active': moving }"></i
        >{{
          reducedMotion
            ? "Reduced motion"
            : paused
              ? "Layout paused"
              : moving
                ? "Layout moving"
                : "Layout settled"
        }}</span
      >
    </footer>
    <div class="graph-run-status">
      <span
        ><i :class="run?.status"></i>{{ statusLabel
        }}<template v-if="run"> · {{ Math.round(progress) }}%</template></span
      ><span>{{ graphData ? 'Fictional case · Scripted agent perspectives' : 'Illustrative graph · Connections are sample data' }}</span>
    </div>
  </section>
</template>

<style scoped>
.simulation-graph { position: relative; isolation: isolate; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 720px; height: 100%; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 4px; overflow: hidden; color: var(--ui-text); container-type: inline-size; }
.graph-header, .graph-toolbar, .graph-legend, .graph-footer, .graph-run-status, .graph-notice { flex-shrink: 0; }
.graph-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; padding: 24px; background: var(--ui-surface); }
.graph-header > div:first-child { min-width: 0; flex: 1 1 12rem; }
.graph-eyebrow { margin: 0 0 8px; color: var(--ui-muted); font-size: .75rem; letter-spacing: .06em; font-weight: 600; }
.graph-header h2 { margin: 0; font-family: var(--font-display); font-size: 1.875rem; line-height: 1.2; font-weight: 400; letter-spacing: -.035em; overflow-wrap: anywhere; }
.graph-description { max-width: 62ch; margin: 8px 0 0; color: var(--ui-muted); font-size: .8125rem; line-height: 1.6; }
.graph-header-actions { display: flex; align-items: center; gap: 10px; }
.graph-demo-tag { padding: 5px 8px; border: 1px solid var(--ui-border); border-radius: 3px; font-family: var(--font-data); font-size: .6875rem; line-height: 1.4; color: var(--ui-muted); background: var(--ui-surface-alt); }
.graph-icon-button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; padding: 7px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--ui-muted); flex-shrink: 0; }
.graph-icon-button:hover { background: var(--ui-hover); color: var(--ui-accent); }
.graph-toolbar { position: relative; z-index: 5; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); background: var(--ui-surface-alt); }
.graph-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1 1 12rem; min-width: 0; max-width: 320px; border: 1px solid var(--ui-control-border); border-radius: 8px; padding: 0 10px; color: var(--ui-muted); background: var(--ui-surface); }
.graph-search input { min-width: 0; width: 100%; min-height: 36px; padding: 8px 0; font-size: .875rem; background: transparent; border: 0; color: var(--ui-text); outline: none; }
.graph-search input::placeholder { color: var(--ui-muted); }
.graph-search:focus-within { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.graph-search-results { position: absolute; top: calc(100% + 8px); left: 0; width: min(320px, calc(100cqw - 40px)); max-height: 320px; overflow-y: auto; padding: 8px; border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-surface); box-shadow: var(--ui-shadow); }
.search-result-count { display: block; padding: 5px 8px 10px; font-size: .75rem; color: var(--ui-muted); }
.graph-search-results button { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 40px; padding: 10px 8px; background: transparent; color: var(--ui-text); border: 0; border-radius: 7px; text-align: left; font-size: .875rem; line-height: 1.45; }
.graph-search-results button:hover { background: var(--ui-hover); }
.graph-search-results button > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.graph-search-results i, .legend-types i, .connection-button > i, .node-type-pill i { display: inline-block; width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; }
.graph-search-results p { margin: 2px 8px 8px; font-size: .875rem; line-height: 1.6; color: var(--ui-muted); }
.graph-toolbar-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.graph-tool-button { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 10px; border: 1px solid var(--ui-control-border); border-radius: 8px; background: var(--ui-surface); color: var(--ui-muted); font-size: .75rem; line-height: 1.45; }
.graph-tool-button:hover { background: var(--ui-hover); }
.graph-tool-button[aria-pressed="true"] { color: var(--ui-accent); background: var(--ui-selected); }
.graph-tool-button:disabled { color: var(--ui-muted); border-color: var(--ui-border); cursor: not-allowed; }
.labels-icon { font-size: 1rem; font-weight: 600; }
.graph-notice { margin: 0; padding: 12px 20px; background: var(--ui-warning-bg); color: var(--ui-warning); font-size: .875rem; line-height: 1.6; }
.graph-stage { position: relative; flex: 1; min-height: 380px; overflow: hidden; background: var(--ui-canvas); }
.graph-svg { display: block; width: 100%; height: 100%; position: absolute; inset: 0; touch-action: none; cursor: grab; outline: none; }
.graph-svg:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: -3px; }
.graph-stage.is-dragging .graph-svg, .graph-stage.is-dragging .graph-node { cursor: grabbing; }
.graph-links path { fill: none; stroke: var(--ui-control-border); stroke-width: 1; opacity: .65; transition: opacity .16s, stroke .16s; pointer-events: none; }
.graph-links path.link-highlight { stroke: var(--ui-accent); stroke-width: 2; opacity: 1; }
.graph-links path.link-active { stroke: var(--ui-accent); stroke-width: 1.35; opacity: .85; }
.graph-links path.link-muted { opacity: .12; }
.graph-node { cursor: grab; outline: none; transition: opacity .16s; }
.graph-node.node-muted { opacity: .22; }
.node-ring { opacity: 0; transition: opacity .16s; }
.node-activity-halo { fill-opacity: .08; stroke-opacity: .38; pointer-events: none; animation: graph-activity 2.8s ease-in-out infinite; }
.node-selected .node-activity-halo { stroke-opacity: .18; }
.has-reduced-motion .node-activity-halo { animation: none; }
@keyframes graph-activity { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.node-selected .node-ring, .node-focused .node-ring, .graph-node:focus-visible .node-ring { opacity: 1; }
.node-selected .node-dot { stroke: var(--ui-focus); stroke-width: 3; }
.graph-node:focus-visible .node-dot { stroke: var(--ui-text); stroke-width: 3; }
.node-label { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 500; fill: var(--ui-muted); stroke: var(--ui-canvas); stroke-width: 3px; paint-order: stroke; stroke-linejoin: round; pointer-events: all; user-select: none; }
.node-label-main { font-weight: 650; fill: var(--ui-text); }
.node-selected .node-label, .node-focused .node-label { font-weight: 700; fill: var(--ui-text); }
.graph-zoom-controls { position: absolute; left: 18px; bottom: 18px; display: flex; align-items: center; gap: 2px; padding: 4px; background: var(--ui-surface); border: 1px solid var(--ui-control-border); border-radius: 10px; box-shadow: var(--ui-shadow); }
.graph-zoom-controls button { display: grid; place-items: center; min-width: 36px; min-height: 36px; padding: 7px; border: 0; border-radius: 7px; background: transparent; color: var(--ui-accent); }
.graph-zoom-controls button:hover:not(:disabled) { background: var(--ui-hover); }
.graph-zoom-controls button:disabled { color: var(--ui-muted); opacity: .6; cursor: not-allowed; }
.zoom-value { min-width: 3.5em; text-align: center; font: .75rem ui-monospace, monospace; color: var(--ui-muted); }
.zoom-divider { height: 20px; width: 1px; margin: 0 4px; background: var(--ui-border); }
.graph-interaction-hint { position: absolute; right: 20px; bottom: 32px; color: var(--ui-muted); font-size: .75rem; line-height: 1.5; pointer-events: none; }
.graph-interaction-hint span { margin: 0 5px; }
.graph-legend { padding: 18px 20px; border-top: 1px solid var(--ui-border); background: var(--ui-surface); }
.legend-heading { display: block; margin-bottom: 10px; color: var(--ui-muted); font-size: .75rem; font-weight: 600; }
.legend-types { display: flex; flex-wrap: wrap; gap: 8px; }
.legend-types button { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 7px 10px; border: 1px solid var(--ui-control-border); border-radius: 8px; background: var(--ui-selected); color: var(--ui-text); font-size: .75rem; line-height: 1.5; }
.legend-types button:hover { background: var(--ui-hover); }
.legend-types button span { margin-left: 3px; color: var(--ui-muted); font: .75rem ui-monospace, monospace; }
.is-custom-graph .legend-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr)); }
.is-custom-graph .legend-types button { min-width: 0; text-align: left; }
.is-custom-graph .legend-types button span { margin-left: auto; }
.legend-types .type-hidden { background: var(--ui-surface); color: var(--ui-muted); text-decoration: line-through; }
.graph-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 14px 20px; border-top: 1px solid var(--ui-border); color: var(--ui-muted); font-size: .75rem; line-height: 1.6; background: var(--ui-surface); }
.graph-footer strong { color: var(--ui-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.footer-separator { margin: 0 6px; }
.graph-layout-status { display: flex; align-items: center; gap: 7px; font-size: .75rem; }
.graph-layout-status i { width: 6px; height: 6px; border-radius: 50%; background: var(--ui-muted); flex-shrink: 0; }
.graph-layout-status i.layout-active { background: var(--ui-accent); }
.graph-run-status { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 14px; padding: 12px 20px; border-top: 1px solid var(--ui-border); color: var(--ui-muted); background: var(--ui-surface-alt); font-size: .75rem; line-height: 1.6; }
.graph-run-status > span:first-child { display: flex; gap: 6px; align-items: center; }
.graph-run-status i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--ui-muted); flex-shrink: 0; }
.graph-run-status i.running, .graph-run-status i.completed { background: var(--ui-accent); }
.graph-run-status i.stopped { background: var(--ui-warning); }
.graph-inspector { position: absolute; top: 16px; right: 16px; bottom: 16px; width: 280px; max-height: 620px; overflow: auto; overscroll-behavior: contain; padding: 16px 18px 20px; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; box-shadow: var(--ui-shadow); scrollbar-width: thin; }
.inspector-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 -6px 12px 0; }
.inspector-top > span { color: var(--ui-muted); font-size: .75rem; font-weight: 600; }
.node-type-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; background: var(--ui-surface-alt); border: 1px solid var(--ui-border); border-radius: 6px; font-size: .75rem; line-height: 1.5; margin-bottom: 14px; }
.graph-inspector h3 { font-size: 1.25rem; line-height: 1.35; letter-spacing: -.025em; font-weight: 650; margin: 0 0 12px; overflow-wrap: anywhere; }
.node-description { color: var(--ui-muted); font-size: .875rem; line-height: 1.7; margin: 0 0 18px; }
.node-properties { margin: 0 0 16px; padding: 14px 0; border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); }
.node-properties > div { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 12px; margin: 0 0 10px; font-size: .75rem; line-height: 1.6; }
.node-properties > div:last-child { margin: 0; }
.node-properties dt { color: var(--ui-muted); text-transform: capitalize; overflow-wrap: anywhere; }
.node-properties dd { margin: 0; color: var(--ui-text); text-align: right; overflow-wrap: anywhere; }
.pin-button { display: flex; flex-wrap: wrap; width: 100%; min-height: 36px; gap: 7px; align-items: center; padding: 9px; border: 1px solid var(--ui-control-border); border-radius: 8px; background: var(--ui-surface); color: var(--ui-accent); font-size: .75rem; line-height: 1.6; }
.pin-button:hover { background: var(--ui-hover); }
.pin-button > span { margin-left: auto; color: var(--ui-muted); font-size: .75rem; }
.pin-button[aria-pressed="true"] { background: var(--ui-selected); }
.connections-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 24px 0 10px; }
.connections-heading h4 { font-size: .875rem; font-weight: 600; margin: 0; }
.connections-heading > span { padding: 4px 7px; border-radius: 5px; background: var(--ui-surface-alt); color: var(--ui-muted); font: .75rem ui-monospace, monospace; }
.connection-list { display: flex; flex-direction: column; gap: 4px; }
.connection-button { display: flex; width: 100%; min-height: 44px; gap: 8px; align-items: center; padding: 10px 7px; background: transparent; border: 0; border-radius: 8px; text-align: left; }
.connection-button:hover { background: var(--ui-hover); }
.connection-button > span { flex: 1; min-width: 0; }
.connection-button strong { display: block; color: var(--ui-text); font-size: .875rem; font-weight: 500; line-height: 1.45; overflow-wrap: anywhere; }
.connection-button small { display: block; color: var(--ui-muted); font-size: .75rem; line-height: 1.5; margin-top: 4px; }
.connection-button > svg { color: var(--ui-muted); flex-shrink: 0; }
.graph-no-nodes { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; background: var(--ui-canvas); padding: 24px; }
.graph-no-nodes > svg { color: var(--ui-accent); margin-bottom: 16px; }
.graph-no-nodes h3 { font-size: 1.5rem; line-height: 1.3; font-weight: 600; margin: 0 0 12px; }
.graph-no-nodes p { font-size: .875rem; line-height: 1.6; color: var(--ui-muted); }
.graph-no-nodes button { min-height: 44px; padding: 10px 14px; border: 1px solid var(--ui-accent); border-radius: 8px; color: var(--ui-on-accent); background: var(--ui-accent); font-size: .875rem; line-height: 1.5; }
.simulation-graph button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.simulation-graph:fullscreen { min-height: 0; border: 0; border-radius: 0; width: 100vw; height: 100dvh; overflow-y: auto; }
.simulation-graph:fullscreen .graph-stage { flex: 1 0 380px; }
@container (max-width: 699px) {
  .graph-header { padding: 20px 18px; }
  .graph-header h2 { font-size: 1.5rem; }
  .graph-toolbar { padding: 12px 16px; }
  .graph-search { max-width: none; }
  .graph-search input { font-size: 1rem; }
  .graph-tool-button, .graph-icon-button, .graph-search input, .legend-types button, .graph-zoom-controls button, .pin-button { min-height: 44px; }
  .graph-icon-button, .graph-zoom-controls button { min-width: 44px; }
  .graph-stage { min-height: 360px; }
  .graph-inspector { top: auto; left: 12px; right: 12px; bottom: 12px; width: auto; max-height: 290px; padding: 14px 16px; }
  .has-selection .graph-zoom-controls { bottom: auto; top: 14px; left: 14px; }
  .graph-interaction-hint { left: 18px; right: 16px; bottom: 86px; }
  .graph-footer, .graph-run-status, .graph-legend { padding-left: 16px; padding-right: 16px; }
}
@container (max-width: 370px) {
  .graph-header { gap: 12px; }
  .graph-header-actions { width: 100%; justify-content: space-between; }
  .graph-toolbar-buttons { width: 100%; }
  .graph-tool-button { flex: 1; }
  .graph-zoom-controls { left: 12px; }
  .zoom-divider { margin: 0 2px; }
  .zoom-value { min-width: 3em; }
}
@media (prefers-reduced-motion: reduce) { .graph-links path, .graph-node, .node-ring { transition: none; } .node-activity-halo { animation: none; } }
@media (prefers-contrast: more) { .graph-links path { opacity: 1; stroke-width: 1.5; } .graph-links path.link-muted { opacity: .35; } }
</style>
