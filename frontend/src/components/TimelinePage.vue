<script setup>
// Start-up timeline (critical-path engine ported from PR #2,
// lib/bottleneckTimeline.js). Deterministic working-day scheduling.
import { computed, ref, watch } from "vue";
import { Download, RotateCcw } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import { PLANS, addWorkingDays, calculateTimeline } from "../lib/bottleneckTimeline.js";
import { createArtifact, csvCell } from "../lib/records.js";
import { downloadText, stamp } from "../lib/download.js";
import { readJson, writeJson } from "../lib/storage.js";

const STORAGE_KEY = "microfish:timeline";
const saved = readJson(STORAGE_KEY, {});
const planId = ref(PLANS.some((p) => p.id === saved.planId) ? saved.planId : PLANS[0].id);
const delaysByPlan = ref(saved.delaysByPlan ?? {});
const plan = computed(() => PLANS.find((p) => p.id === planId.value));
const delays = computed(() => delaysByPlan.value[planId.value] ?? {});
const timeline = computed(() => calculateTimeline(delays.value, plan.value));
const selectedId = ref(null);
watch(
  plan,
  (next) => {
    if (!next.tasks.some((task) => task.id === selectedId.value)) selectedId.value = next.tasks.find((t) => t.duration > 4)?.id ?? next.tasks[0].id;
  },
  { immediate: true },
);
watch(
  [planId, delaysByPlan],
  () => writeJson(STORAGE_KEY, { planId: planId.value, delaysByPlan: delaysByPlan.value }),
  { deep: true },
);

const selected = computed(() => timeline.value.tasks.find((task) => task.id === selectedId.value));
const span = computed(() => Math.max(plan.value.deadline, timeline.value.finish, ...timeline.value.tasks.map((t) => t.baselineEnd)) + 1);
const pct = (day) => `${(day / span.value) * 100}%`;
const date = (offset) =>
  new Date(`${addWorkingDays(plan.value.startDate, offset)}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase();
const anyDelay = computed(() => Object.values(delays.value).some(Boolean));
const titleOf = (id) => plan.value.tasks.find((t) => t.id === id)?.title ?? id;

function setDelay(id, value) {
  const next = { ...delays.value, [id]: Number(value) };
  if (!next[id]) delete next[id];
  delaysByPlan.value = { ...delaysByPlan.value, [planId.value]: next };
}
function reset() {
  delaysByPlan.value = { ...delaysByPlan.value, [planId.value]: {} };
}
const ticks = computed(() => Array.from({ length: Math.ceil(span.value / 5) + 1 }, (_, i) => i * 5).filter((d) => d <= span.value));

// ---------- export ----------
function scenario() {
  const t = timeline.value;
  return {
    tool: "startup-timeline",
    plan: { id: plan.value.id, title: plan.value.title, startDate: plan.value.startDate, deadline: plan.value.deadline },
    delays: delays.value,
    finishDay: t.finish,
    finishDate: addWorkingDays(plan.value.startDate, t.finish),
    shiftDays: t.shift,
    bufferDays: t.deadlineBuffer,
    criticalPath: t.tasks.filter((x) => x.critical).map((x) => x.id),
    tasks: t.tasks.map(({ id, title, owner, duration, delay, start, end, baselineStart, baselineEnd, slack, critical, dependencies }) => ({
      id, title, owner, duration, delay, start, end, baselineStart, baselineEnd, slack, critical, dependencies,
    })),
    assumptions: "Illustrative working days, Monday–Friday, no holidays. Not a regulatory timeline.",
  };
}
async function exportJson() {
  downloadText(`lookahead-timeline-${stamp()}.json`, "application/json", JSON.stringify(await createArtifact("timeline-scenario", scenario()), null, 2));
}
function exportCsv() {
  const header = ["task", "owner", "duration_days", "added_delay", "start_date", "end_date", "baseline_end_date", "slack_days", "critical", "depends_on"];
  const rows = [header.join(",")];
  for (const t of timeline.value.tasks) {
    rows.push([t.title, t.owner, t.duration, t.delay, addWorkingDays(plan.value.startDate, t.start), addWorkingDays(plan.value.startDate, t.end), addWorkingDays(plan.value.startDate, t.baselineEnd), t.slack, t.critical, t.dependencies.map(titleOf).join("; ")].map(csvCell).join(","));
  }
  downloadText(`lookahead-timeline-${stamp()}.csv`, "text/csv;charset=utf-8", rows.join("\n"));
}

const heading = ref(null);
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <div class="tool-page">
    <header class="tool-head">
      <div>
        <p class="mono eyebrow">study setup · critical path</p>
        <h1 ref="heading" tabindex="-1">start-up timeline</h1>
        <p class="lede">delay any step and see what actually moves your {{ plan.finishLabel }} — and which delays your schedule quietly absorbs.</p>
      </div>
      <div class="head-actions">
        <div class="segmented mono" role="group" aria-label="Plan">
          <button v-for="p in PLANS" :key="p.id" :class="{ active: planId === p.id }" :aria-pressed="planId === p.id" @click="planId = p.id">
            {{ p.id === "trial-startup" ? "site start-up" : "researcher onboarding" }}
          </button>
        </div>
      </div>
    </header>

    <div class="metrics">
      <div class="metric">
        <span class="mono">{{ plan.finishLabel }}</span>
        <strong>{{ date(timeline.finish) }}</strong>
        <StatusBadge size="sm" :status="timeline.shift ? 'running' : 'completed'" :label="timeline.shift ? `+${timeline.shift} days` : 'on baseline'" />
      </div>
      <div class="metric">
        <span class="mono">buffer to target ({{ date(plan.deadline) }})</span>
        <strong :class="{ bad: timeline.deadlineBuffer < 0 }">{{ timeline.deadlineBuffer >= 0 ? `${timeline.deadlineBuffer} days` : `${-timeline.deadlineBuffer} days late` }}</strong>
        <StatusBadge size="sm" :status="timeline.deadlineBuffer < 0 ? 'error' : timeline.deadlineBuffer <= 1 ? 'running' : 'completed'" :label="timeline.deadlineBuffer < 0 ? 'target missed' : timeline.deadlineBuffer <= 1 ? 'at risk' : 'healthy'" />
      </div>
      <div class="metric">
        <span class="mono">{{ plan.milestoneLabel }}</span>
        <strong>{{ date(timeline.readyDay) }}</strong>
        <span class="mono faint">working day {{ timeline.readyDay }}</span>
      </div>
      <div class="metric">
        <span class="mono">steps affected</span>
        <strong>{{ timeline.affectedCount }} / {{ timeline.tasks.length }}</strong>
        <button class="mini-btn mono" :disabled="!anyDelay" @click="reset"><RotateCcw :size="12" /> reset scenario</button>
      </div>
    </div>

    <div class="tool-grid">
      <section class="panel gantt" aria-label="Schedule">
        <div class="panel-head">
          <span class="mono">{{ plan.title.toLowerCase() }} · {{ date(0) }} start</span>
          <span class="legend mono">
            <span><i class="lg crit"></i>critical</span><span><i class="lg slack"></i>slack</span><span><i class="lg base"></i>baseline</span>
          </span>
        </div>
        <div class="rows">
          <div class="axis">
            <span v-for="tick in ticks" :key="tick" class="tick mono" :style="{ left: pct(tick) }">{{ date(tick) }}</span>
            <span class="deadline" :style="{ left: pct(plan.deadline) }" :title="`target · ${date(plan.deadline)}`"></span>
          </div>
          <button
            v-for="task in timeline.tasks"
            :key="task.id"
            class="row"
            :class="{ active: task.id === selectedId, critical: task.critical, affected: task.affected }"
            :aria-pressed="task.id === selectedId"
            @click="selectedId = task.id"
          >
            <span class="row-label">
              <span class="avatar">{{ task.initials.toLowerCase() }}</span>
              <span class="row-text">
                <span class="row-title">{{ task.title }}</span>
                <span class="mono row-owner">{{ task.owner.toLowerCase() }}</span>
              </span>
            </span>
            <span class="track">
              <span class="deadline-line" :style="{ left: pct(plan.deadline) }"></span>
              <span v-if="task.affected" class="bar base" :style="{ left: pct(task.baselineStart), width: pct(task.baselineEnd - task.baselineStart) }"></span>
              <span class="bar" :style="{ left: pct(task.start), width: pct(task.end - task.start) }">
                <span v-if="task.delay" class="delay-part" :style="{ width: `${(task.delay / (task.end - task.start)) * 100}%` }"></span>
              </span>
              <span v-if="task.slack > 0" class="bar slack" :style="{ left: pct(task.end), width: pct(task.slack) }"></span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="selected" class="panel detail" aria-label="Selected step">
        <p class="mono eyebrow">{{ selected.owner.toLowerCase() }}</p>
        <h2>{{ selected.title }}</h2>
        <p class="desc">{{ selected.description }}</p>
        <StatusBadge
          :status="selected.critical ? 'error' : 'completed'"
          :label="selected.critical ? 'on the critical path' : `${selected.slack} days of slack`"
          :meta="`${date(selected.start)} → ${date(selected.end)}`"
        />
        <div class="delay">
          <label class="mono" :for="`delay-${selected.id}`">added delay · {{ selected.delay }} working day{{ selected.delay === 1 ? "" : "s" }}</label>
          <input :id="`delay-${selected.id}`" type="range" min="0" max="15" step="1" :value="selected.delay" @input="setDelay(selected.id, $event.target.value)" />
          <p class="effect">
            <template v-if="!selected.delay">drag to rehearse a slip in this step.</template>
            <template v-else-if="timeline.shift === 0">absorbed — the {{ plan.finishLabel }} doesn't move.</template>
            <template v-else>pushes the {{ plan.finishLabel }} by <b>{{ timeline.shift }} day{{ timeline.shift === 1 ? "" : "s" }}</b>{{ timeline.deadlineBuffer < 0 ? " — past target" : "" }}.</template>
          </p>
        </div>
        <div class="deps">
          <p class="mono">waits on</p>
          <p>{{ selected.dependencies.length ? selected.dependencies.map(titleOf).join(", ") : "nothing — can start immediately" }}</p>
          <p class="mono">blocks</p>
          <p>{{ selected.descendantIds.length ? selected.descendantIds.map(titleOf).join(", ") : "nothing downstream" }}</p>
        </div>
        <div class="panel-actions">
          <button class="mini-btn mono" @click="exportCsv"><Download :size="12" /> csv</button>
          <button class="mini-btn mono" @click="exportJson"><Download :size="12" /> json</button>
        </div>
        <p class="scope mono">illustrative working days · mon–fri, no holidays · not a regulatory timeline</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.metric strong.bad {
  color: var(--danger);
}
.tool-grid {
  grid-template-columns: minmax(0, 8fr) minmax(260px, 4fr);
}
.legend {
  display: inline-flex;
  gap: 12px;
}
.lg {
  display: inline-block;
  width: 14px;
  height: 6px;
  margin-right: 5px;
  border-radius: 3px;
  vertical-align: middle;
}
.lg.crit {
  background: var(--accent);
}
.lg.slack {
  background: repeating-linear-gradient(90deg, var(--hairline) 0 3px, transparent 3px 6px);
}
.lg.base {
  border: 1px dashed var(--muted);
}
.rows {
  display: grid;
  gap: 2px;
}
.axis {
  position: relative;
  height: 18px;
  margin-left: 210px;
}
.tick {
  position: absolute;
  transform: translateX(-50%);
  color: var(--faint);
  font-size: 10px;
  white-space: nowrap;
}
.deadline {
  position: absolute;
  top: 0;
  bottom: -4px;
  width: 1px;
  background: var(--danger);
}
.row {
  display: grid;
  grid-template-columns: 210px 1fr;
  align-items: center;
  min-height: 44px;
  padding: 0 4px 0 0;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
}
.row:hover,
.row.active {
  background: var(--surface-hover);
}
.row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 8px;
}
.avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--canvas);
  color: var(--muted);
  font-family: var(--font-mono-stack);
  font-size: 10px;
}
.row-text {
  display: grid;
  min-width: 0;
}
.row-title {
  overflow: hidden;
  color: var(--ink);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-owner {
  color: var(--faint);
  font-size: 10.5px;
}
.track {
  position: relative;
  height: 14px;
}
.deadline-line {
  position: absolute;
  top: -15px;
  bottom: -15px;
  width: 1px;
  background: color-mix(in srgb, var(--danger) 35%, transparent);
}
.bar {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in srgb, var(--muted) 45%, var(--surface));
  transition:
    left 300ms var(--ease),
    width 300ms var(--ease);
}
.row.critical .bar:not(.base):not(.slack) {
  background: color-mix(in srgb, var(--accent) 75%, var(--surface));
}
.bar.base {
  border: 1px dashed var(--muted);
  background: transparent;
}
.bar.slack {
  background: repeating-linear-gradient(90deg, var(--hairline) 0 3px, transparent 3px 6px);
}
.delay-part {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.25) 0 4px, transparent 4px 8px);
}
.detail h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.desc {
  margin: 0;
  color: var(--body);
  font-size: 13px;
  line-height: 1.55;
}
.delay {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  color: var(--faint);
}
.delay input {
  accent-color: var(--accent);
}
.effect {
  margin: 0;
  color: var(--body);
  font-size: 13px;
}
.effect b {
  color: var(--accent);
  font-weight: 500;
}
.deps p {
  margin: 0 0 6px;
  color: var(--body);
  font-size: 13px;
}
.deps .mono {
  margin: 0;
  color: var(--faint);
}
@media (max-width: 900px) {
  .tool-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .axis {
    margin-left: 120px;
  }
  .row {
    grid-template-columns: 120px 1fr;
  }
  .row-owner,
  .avatar {
    display: none;
  }
}
</style>
