<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import {
  TIMELINE_TASKS,
  START_DATE,
  PROJECT_DEADLINE,
  calculateTimeline,
  addWorkingDays,
} from "../lib/bottleneckTimeline.js";

const props = defineProps({ storageKey: { type: String, default: "microfish.bottleneck-timeline.v1" } });
const STORAGE_KEY = props.storageKey;
const delays = ref({});
const selectedId = ref("workspace-access");
const heading = ref(null);
const taskDetail = ref(null);
const storageNotice = ref("");
const showBaseline = ref(true);
const schedule = computed(() => calculateTimeline(delays.value));
const selected = computed(() =>
  schedule.value.tasks.find((task) => task.id === selectedId.value),
);
const prerequisites = computed(() =>
  schedule.value.tasks.filter((task) =>
    selected.value.dependencies.includes(task.id),
  ),
);
const downstream = computed(() =>
  schedule.value.tasks.filter((task) =>
    selected.value.descendantIds.includes(task.id),
  ),
);
const dayCount = computed(() =>
  Math.max(20, Math.ceil((schedule.value.finish + 2) / 5) * 5),
);
const weeks = computed(() =>
  Array.from({ length: dayCount.value / 5 }, (_, i) => i * 5),
);
const totalDelay = computed(() =>
  schedule.value.tasks.reduce((sum, task) => sum + task.delay, 0),
);
const date = (offset, options = {}) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${addWorkingDays(START_DATE, offset)}T12:00:00Z`));
const barStyle = (start, end) => ({
  left: `${(start / dayCount.value) * 100}%`,
  width: `${((end - start) / dayCount.value) * 100}%`,
});
const detail = computed(() => {
  if (!totalDelay.value)
    return "Select a task and add a delay to explore how the rest of the plan responds.";
  if (!schedule.value.shift)
    return "Your parallel work absorbs the added time. The final handoff date stays on track.";
  return `The handoff moves ${schedule.value.shift} working ${schedule.value.shift === 1 ? "day" : "days"} later. Follow the tasks marked “Delayed” to see where the extra time travels.`;
});
function setDelay(value) {
  const parsed = Number(value);
  delays.value = {
    ...delays.value,
    [selectedId.value]: Number.isFinite(parsed)
      ? Math.min(15, Math.max(0, Math.round(parsed)))
      : 0,
  };
}
function resetScenario() {
  delays.value = {};
}
async function selectTask(id) {
  selectedId.value = id;
  await nextTick();
  const board = taskDetail.value?.previousElementSibling;
  const detailsBelowChart = board &&
    taskDetail.value.getBoundingClientRect().top >= board.getBoundingClientRect().bottom;
  if (detailsBelowChart) {
    taskDetail.value?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    taskDetail.value?.querySelector("h2")?.focus({ preventScroll: true });
  }
}
function restore(raw) {
  if (!raw) return;
  const stored = JSON.parse(raw);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
  delays.value = Object.fromEntries(
    calculateTimeline(stored.delays || {}).tasks.map((task) => [
      task.id,
      task.delay,
    ]),
  );
  if (TIMELINE_TASKS.some((task) => task.id === stored.selectedId))
    selectedId.value = stored.selectedId;
}
try {
  restore(window.localStorage.getItem(STORAGE_KEY));
} catch {
  storageNotice.value =
    "This scenario could not be restored. You can explore a fresh plan below.";
}
let restoringStorage = false;
watch(
  [delays, selectedId],
  () => {
    if (restoringStorage) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ delays: delays.value, selectedId: selectedId.value }),
      );
      storageNotice.value = "";
    } catch {
      storageNotice.value =
        "Your changes are available in this tab, but could not be saved for your next visit.";
    }
  },
  { deep: true, flush: "sync" },
);
function syncStorage(event) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    restoringStorage = true;
    const latest = window.localStorage.getItem(STORAGE_KEY);
    if (latest) restore(latest);
    else resetScenario();
  } catch {
    /* Keep the current usable scenario if another tab writes invalid data. */
  } finally {
    restoringStorage = false;
  }
}
onMounted(() => window.addEventListener("storage", syncStorage));
onUnmounted(() => window.removeEventListener("storage", syncStorage));
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <main class="timeline-page" aria-labelledby="timeline-heading">
    <div class="timeline-page-inner">
      <div class="timeline-page-heading">
        <div>
          <h1 id="timeline-heading" ref="heading" tabindex="-1">
            Bottleneck timeline
          </h1>
          <p class="timeline-intro">
            Follow the dependencies. See how one delay changes the rest of the plan.
          </p>
        </div>
        <button
          class="timeline-reset"
          :disabled="!totalDelay"
          @click="resetScenario"
        >
          <AppIcon name="reset" :size="15" /> Reset scenario
        </button>
      </div>

      <div class="timeline-study">
        <div>
          <strong>REST-101 <span>/</span> Researcher onboarding</strong>
          <p>
            Alex’s path from onboarding paperwork to the first research handoff.
          </p>
        </div>
        <span class="timeline-sample">Fictional study</span>
      </div>
      <p v-if="storageNotice" class="timeline-storage-notice" role="status">
        {{ storageNotice }}
      </p>

      <div class="timeline-metrics" aria-label="Scenario summary">
        <article>
          <span class="metric-label"
            ><AppIcon name="calendar" :size="15" /> Data access ready</span
          ><strong>{{ date(schedule.readyDay) }}</strong
          ><span>Preparation + permissions</span>
        </article>
        <article>
          <span class="metric-label"
            ><AppIcon name="flag" :size="15" /> Handoff ready</span
          ><strong :class="{ amber: schedule.shift }"
            >{{ date(schedule.finish)
            }}<small v-if="schedule.shift"
              >+{{ schedule.shift }}d</small
            ></strong
          ><span>Baseline {{ date(schedule.baselineFinish) }}</span>
        </article>
        <article>
          <span class="metric-label"
            ><AppIcon name="branch" :size="15" /> Tasks affected</span
          ><strong
            >{{ schedule.affectedCount }}
            <small class="metric-total"
              >/ {{ schedule.tasks.length }}</small
            ></strong
          ><span>{{
            schedule.affectedCount
              ? "Shifted from the original plan"
              : "All tasks follow the original plan"
          }}</span>
        </article>
        <article>
          <span class="metric-label"
            ><AppIcon name="clock" :size="15" />
            {{
              schedule.deadlineBuffer < 0 ? "Past target" : "Time before target"
            }}</span
          ><strong :class="{ amber: schedule.deadlineBuffer < 0 }"
            >{{ Math.abs(schedule.deadlineBuffer) }}
            <small class="metric-unit">working days</small></strong
          ><span>Handoff target · {{ date(PROJECT_DEADLINE) }}</span>
        </article>
      </div>

      <div class="timeline-layout">
        <section class="timeline-board" aria-labelledby="plan-heading">
          <div class="timeline-board-heading">
            <div>
              <h2 id="plan-heading">Your path to research</h2>
              <p>Oct 5, 2026 start · Monday–Friday schedule</p>
            </div>
            <label class="baseline-toggle"
              ><input v-model="showBaseline" type="checkbox" /> Show
              baseline</label
            >
          </div>
          <div class="timeline-legend">
            <span><i class="legend-current"></i> Current plan</span
            ><span><i class="legend-shifted"></i> Affected by delay</span
            ><span v-if="showBaseline"
              ><i class="legend-baseline"></i> Baseline</span
            ><span class="legend-target">┊ Handoff target</span>
          </div>
          <div
            class="gantt-scroll"
            tabindex="0"
            role="region"
            aria-label="Task timeline. Scroll horizontally for later dates."
          >
            <div
              class="gantt"
              :style="{
                minWidth: `calc(var(--task-label-width) + ${dayCount * 2.5}rem)`,
                '--day-width': `${100 / dayCount}%`,
              }"
            >
              <div class="gantt-axis" aria-hidden="true">
                <div class="gantt-label">TASK / OWNER</div>
                <div class="gantt-weeks">
                  <span
                    v-for="week in weeks"
                    :key="week"
                    :style="{ width: `${500 / dayCount}%` }"
                    >{{ date(week) }}<small>MON — FRI</small></span
                  >
                </div>
              </div>
              <button
                v-for="task in schedule.tasks"
                :key="task.id"
                class="gantt-row"
                :class="{
                  'is-selected': selectedId === task.id,
                  'is-affected': task.affected,
                }"
                :aria-pressed="selectedId === task.id"
                aria-controls="timeline-task-detail"
                :aria-label="`${task.title}, ${task.owner}, starts ${date(task.start)}, ready from ${date(task.end)}, ${task.duration + task.delay} working days${task.affected ? `, affected by delay, ${task.shift} working days later` : ''}. View task details.`"
                @click="selectTask(task.id)"
              >
                <span class="gantt-label task-label">
                  <span>
                    <strong>{{ task.title }}</strong>
                    <small>{{ task.owner }}</small>
                    <small v-if="task.affected" class="task-delay-label">
                      Delayed<span v-if="task.shift"> · +{{ task.shift }}d</span>
                    </small>
                  </span>
                </span>
                <span class="gantt-track">
                  <span
                    class="gantt-deadline"
                    :style="{ left: `${(PROJECT_DEADLINE / dayCount) * 100}%` }"
                  ></span>
                  <span
                    v-if="showBaseline"
                    class="gantt-baseline"
                    :style="barStyle(task.baselineStart, task.baselineEnd)"
                  ></span>
                  <span
                    class="gantt-bar"
                    :class="{ shifted: task.affected }"
                    :style="barStyle(task.start, task.end)"
                    ><span>{{ task.duration + task.delay }}d</span></span
                  >
                </span>
              </button>
              <div class="gantt-end" aria-hidden="true">
                <span class="gantt-label">WORKING DAYS</span
                ><span class="gantt-day-labels"
                  ><span v-for="n in dayCount" :key="n">{{ n - 1 }}</span></span
                >
              </div>
            </div>
          </div>
          <div
            class="timeline-insight"
            :class="{ 'has-delay': schedule.shift }"
          >
            <span class="insight-icon"
              ><AppIcon :name="schedule.shift ? 'branch' : 'spark'" :size="19"
            /></span>
            <div>
              <strong>{{
                schedule.shift
                  ? "One delay can move the whole plan"
                  : totalDelay
                    ? "A little breathing room"
                    : "Every dependency tells a story"
              }}</strong>
              <p aria-live="polite">{{ detail }}</p>
            </div>
          </div>
        </section>

        <aside
          id="timeline-task-detail"
          ref="taskDetail"
          class="task-detail"
          aria-labelledby="selected-task-heading"
        >
          <div class="task-detail-kicker">
            <span>TASK DETAILS</span
            ><span class="task-path-badge">{{
              selected.critical
                ? "On critical path"
                : `${selected.slack}d flexibility`
            }}</span>
          </div>
          <h2 id="selected-task-heading" tabindex="-1">{{ selected.title }}</h2>
          <p class="task-description">{{ selected.description }}</p>
          <div class="task-owner">
            <span>{{ selected.initials }}</span>
            <div>
              <small>Task owner</small><strong>{{ selected.owner }}</strong>
            </div>
          </div>
          <dl class="task-dates">
            <div>
              <dt>Starts</dt>
              <dd>{{ date(selected.start) }}</dd>
            </div>
            <AppIcon name="arrow-right" :size="16" />
            <div>
              <dt>Ready from</dt>
              <dd :class="{ amber: selected.affected }">
                {{ date(selected.end) }}
              </dd>
            </div>
          </dl>
          <div class="task-prerequisites">
            <h3>Prerequisites</h3>
            <div v-if="prerequisites.length">
              <button
                v-for="task in prerequisites"
                :key="task.id"
                @click="selectTask(task.id)"
              >
                <AppIcon name="branch" :size="13" />{{ task.title
                }}<AppIcon name="arrow-up-right" :size="12" />
              </button>
            </div>
            <p v-else>
              Starts with the onboarding plan. No earlier task required.
            </p>
          </div>
          <div class="delay-control">
            <div class="delay-control-heading">
              <label for="task-delay">What if this takes longer?</label
              ><output for="task-delay">+{{ selected.delay }}d</output>
            </div>
            <p>Add working days to this task.</p>
            <input
              id="task-delay"
              type="range"
              min="0"
              max="15"
              step="1"
              :value="selected.delay"
              :aria-label="`Additional working days for ${selected.title}`"
              :aria-valuetext="`${selected.delay} additional working days`"
              @input="setDelay($event.target.value)"
            />
            <div class="delay-range-labels">
              <span>No delay</span><span>15 days</span>
            </div>
            <div class="delay-presets">
              <button
                v-for="amount in [0, 2, 5, 10]"
                :key="amount"
                :class="{ active: selected.delay === amount }"
                :aria-pressed="selected.delay === amount"
                @click="setDelay(amount)"
              >
                {{ amount ? `+${amount} days` : "None" }}
              </button>
            </div>
          </div>
          <div class="downstream-tasks">
            <h3>
              What depends on this <span>{{ downstream.length }}</span>
            </h3>
            <div v-if="downstream.length">
              <button
                v-for="task in downstream"
                :key="task.id"
                @click="selectTask(task.id)"
              >
                <span
                  ><AppIcon name="arrow-right" :size="13" />{{
                    task.title
                  }}</span
                ><small :class="{ amber: task.shift }">{{
                  task.shift ? `+${task.shift}d` : "On plan"
                }}</small>
              </button>
            </div>
            <p v-else>This is the final handoff in the plan.</p>
            <p v-if="selected.delay && !schedule.shift" class="task-flex-note">
              Parallel work absorbs this scenario’s extra time.
            </p>
          </div>
        </aside>
      </div>
      <div class="timeline-footnote">
        <AppIcon name="info" :size="14" />
        <p>
          Explore a fictional onboarding plan. Dates come from the task
          durations and dependencies shown here; they are planning scenarios.
          Dates mark the start of a working day. Weekends are excluded; holidays
          are not. Changes save in this browser.
        </p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.timeline-page {
  --task-label-width: 15rem;
  container: timeline / inline-size;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--ui-canvas);
  color: var(--ui-text);
  font-size: 0.875rem;
  line-height: 1.5;
}
.timeline-page-inner {
  max-width: 1600px;
  margin: 0 auto;
  padding: 2.25rem clamp(1rem, 3vw, 2.5rem) 2rem;
}
.timeline-page-heading {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1.75rem;
}
.timeline-page-heading > div {
  flex: 1 1 22rem;
  min-width: 0;
}
.timeline-eyebrow {
  color: var(--ui-accent);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 650;
  margin-bottom: 0.625rem;
}
h1 { margin: 0; color: var(--ui-text); font-family: var(--font-display); font-size: clamp(2.5rem, 3.4vw, 3.5rem); font-weight: 400; letter-spacing: -.045em; line-height: 1.1; }
.timeline-intro {
  color: var(--ui-muted);
  font-size: 0.875rem;
  margin: 0.75rem 0 0;
  line-height: 1.65;
  max-width: 44rem;
}
.timeline-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  border: 1px solid var(--ui-control-border);
  border-radius: 0.625rem;
  background: var(--ui-surface);
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 550;
  color: var(--ui-text);
}
.timeline-reset:hover:not(:disabled) {
  background: var(--ui-hover);
}
.timeline-reset:disabled {
  color: var(--ui-muted);
  background: var(--ui-surface-alt);
  border-color: var(--ui-border);
}
.timeline-study { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; border-block: 1px solid var(--ui-border); background: transparent; padding: 1rem 0; }
.timeline-study > div {
  flex: 1 1 18rem;
  min-width: 0;
}
.timeline-study strong {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ui-text);
}
.timeline-study strong span {
  margin: 0 0.375rem;
  font-weight: 400;
  color: var(--ui-muted);
}
.timeline-study p {
  font-size: 0.8125rem;
  color: var(--ui-muted);
  margin: 0.25rem 0 0;
  line-height: 1.55;
}
.timeline-sample {
  border: 1px solid var(--ui-border);
  background: var(--ui-surface);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-muted);
}
.timeline-storage-notice {
  font-size: 0.875rem;
  padding: 0.75rem;
  color: var(--ui-warning);
  background: var(--ui-warning-bg);
  border: 1px solid var(--ui-warning);
  border-radius: 0.625rem;
  margin-top: 0.75rem;
}
.timeline-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: 0;
  margin: 1.5rem 0 1.75rem;
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
}
.timeline-metrics article {
  min-width: 0;
  padding: 1.125rem;
  display: flex;
  flex-direction: column;
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--ui-muted);
  margin-bottom: 0.625rem;
}
.timeline-metrics strong { color: var(--ui-text); font-family: var(--font-display); font-size: 2rem; letter-spacing: -.035em; font-weight: 400; line-height: 1.25; display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; font-variant-numeric: tabular-nums; }
.timeline-metrics strong small {
  font-size: 0.75rem;
  background: var(--ui-warning-bg);
  padding: 0.25rem 0.375rem;
  color: var(--ui-warning);
  border-radius: 0.375rem;
  letter-spacing: 0;
}
.timeline-metrics strong .metric-total {
  background: none;
  padding: 0;
  font-size: 1.125rem;
  color: var(--ui-muted);
  font-weight: 400;
}
.timeline-metrics strong .metric-unit {
  background: none;
  padding: 0;
  font-size: 0.75rem;
  color: var(--ui-muted);
  font-weight: 400;
}
.timeline-metrics article > span:last-child {
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin-top: 0.5rem;
  line-height: 1.5;
}
.amber {
  color: var(--ui-warning) !important;
}
.timeline-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(17rem, 20rem);
  gap: 1.25rem;
  align-items: start;
}
.timeline-board { min-width: 0; border: 1px solid var(--ui-border); background: var(--ui-surface); border-radius: 4px; overflow: hidden; }
.timeline-board-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 0.875rem;
}
h2 {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--ui-text);
}
.timeline-board-heading p {
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin: 0.375rem 0 0;
}
.baseline-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  font-size: 0.8125rem;
  color: var(--ui-text);
  cursor: pointer;
}
.baseline-toggle input {
  width: 1rem;
  height: 1rem;
  margin: 0;
  accent-color: var(--ui-accent);
}
.timeline-legend {
  padding: 0 1.25rem 1.125rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--ui-muted);
}
.timeline-legend > span {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.timeline-legend i {
  display: inline-block;
  flex-shrink: 0;
  width: 1rem;
  height: 0.625rem;
  border-radius: 0.1875rem;
}
.legend-current {
  background: var(--ui-accent);
}
.legend-shifted {
  background: repeating-linear-gradient(135deg, var(--ui-warning-bg) 0 3px, var(--ui-warning) 3px 4px);
  border: 1px solid var(--ui-warning);
}
.legend-baseline {
  border: 1px dashed var(--ui-muted);
}
.legend-target {
  color: var(--ui-warning);
}
.gantt-scroll {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-control-border) var(--ui-surface-alt);
}
.gantt-scroll:focus-visible {
  outline: 3px solid var(--ui-focus);
  outline-offset: -3px;
}
.gantt-axis,
.gantt-row,
.gantt-end {
  display: grid;
  grid-template-columns: var(--task-label-width) minmax(0, 1fr);
}
.gantt-axis {
  background: var(--ui-surface-alt);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
}
.gantt-label {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 0;
  border-right: 1px solid var(--ui-border);
  text-align: left;
  background: var(--ui-surface);
}
.gantt-axis > .gantt-label,
.gantt-end > .gantt-label {
  display: flex;
  align-items: center;
  padding: 1rem;
  color: var(--ui-muted);
  font-size: 0.75rem;
  letter-spacing: 0.035em;
  font-weight: 600;
  background: var(--ui-surface-alt);
}
.gantt-weeks {
  display: flex;
}
.gantt-weeks > span {
  padding: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text);
  border-left: 1px solid var(--ui-border);
}
.gantt-weeks small {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
  margin-top: 0.25rem;
  color: var(--ui-muted);
}
.gantt-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface);
  padding: 0;
  text-align: left;
}
.gantt-row:hover,
.gantt-row:hover .gantt-label {
  background: var(--ui-hover);
}
.gantt-row.is-selected,
.gantt-row.is-selected .gantt-label {
  background: var(--ui-selected);
}
.gantt-row.is-selected .gantt-label {
  box-shadow: inset 3px 0 var(--ui-accent);
}
.gantt-row:focus-visible {
  outline-offset: -3px;
  position: relative;
  z-index: 3;
}
.task-label {
  display: flex;
  align-items: center;
  min-height: 5.25rem;
  padding: 0.875rem 1rem;
}
.task-label strong {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text);
  line-height: 1.4;
}
.task-label small {
  display: block;
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin-top: 0.25rem;
}
.task-label .task-delay-label {
  color: var(--ui-warning);
  font-weight: 600;
}
.gantt-track {
  position: relative;
  min-width: 0;
  display: block;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(var(--day-width) - 1px),
    var(--ui-border) calc(var(--day-width) - 1px),
    var(--ui-border) var(--day-width)
  );
}
.gantt-deadline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed var(--ui-warning);
  z-index: 1;
}
.gantt-baseline {
  position: absolute;
  top: 3.375rem;
  height: 0.625rem;
  border: 1px dashed var(--ui-muted);
  border-radius: 0.1875rem;
  background: var(--ui-surface-alt);
}
.gantt-bar {
  position: absolute;
  top: 1.125rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: var(--ui-accent);
  border: 1px solid var(--ui-accent);
  color: var(--ui-on-accent);
  min-width: 1.75rem;
  transition: left 0.2s ease, width 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gantt-bar.shifted {
  background: var(--ui-warning-bg);
  background-image: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--ui-warning) 12%, transparent) 5px 6px);
  border: 1px solid var(--ui-warning);
  color: var(--ui-warning);
}
.gantt-bar span {
  font-size: 0.75rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.gantt-end {
  background: var(--ui-surface-alt);
}
.gantt-end > .gantt-label {
  padding: 0.625rem 1rem;
}
.gantt-day-labels {
  display: flex;
  align-items: center;
  color: var(--ui-muted);
}
.gantt-day-labels > span {
  width: var(--day-width);
  padding-left: 0.25rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.timeline-insight {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1.125rem 1.25rem;
  background: var(--ui-surface-alt);
  border-top: 1px solid var(--ui-border);
}
.insight-icon {
  display: grid;
  place-items: center;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  background: var(--ui-surface);
  border-radius: 0.5rem;
  color: var(--ui-accent);
}
.timeline-insight strong {
  font-size: 0.875rem;
  color: var(--ui-text);
  font-weight: 600;
}
.timeline-insight p {
  font-size: 0.8125rem;
  color: var(--ui-muted);
  line-height: 1.65;
  margin: 0.375rem 0 0;
}
.timeline-insight.has-delay {
  background: var(--ui-warning-bg);
}
.has-delay strong,
.has-delay p,
.has-delay .insight-icon {
  color: var(--ui-warning);
}
.has-delay .insight-icon {
  background: var(--ui-warning-bg);
  border: 1px solid var(--ui-warning);
}
.task-detail { min-width: 0; border: 1px solid var(--ui-border); border-top: 3px solid var(--ui-accent); border-radius: 4px; padding: 1.25rem; background: var(--ui-surface); }
.task-detail-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  letter-spacing: 0.035em;
  color: var(--ui-muted);
  margin-bottom: 1rem;
}
.task-path-badge {
  font-size: 0.75rem;
  letter-spacing: 0;
  padding: 0.25rem 0.375rem;
  background: var(--ui-surface-alt);
  border-radius: 0.375rem;
  color: var(--ui-accent);
}
.task-detail h2 {
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.025em;
}
.task-description {
  font-size: 0.875rem;
  color: var(--ui-muted);
  line-height: 1.65;
  margin: 0.625rem 0 1.25rem;
}
.task-owner {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.task-owner > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.task-owner > span {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--ui-surface-alt);
  color: var(--ui-accent);
  font-size: 0.8125rem;
  font-weight: 550;
}
.task-owner small {
  display: block;
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin-bottom: 0.125rem;
}
.task-owner strong {
  font-size: 0.875rem;
  color: var(--ui-text);
  font-weight: 550;
}
.task-dates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  margin: 1.125rem 0 0;
  border-top: 1px solid var(--ui-border);
  color: var(--ui-muted);
}
.task-dates dt {
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin-bottom: 0.25rem;
}
.task-dates dd {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ui-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
h3 {
  margin: 0 0 0.625rem;
  color: var(--ui-text);
  font-size: 0.875rem;
  font-weight: 600;
}
.task-prerequisites {
  padding-bottom: 1.25rem;
}
.task-prerequisites > div {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.task-prerequisites button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.375rem;
  min-height: 2.25rem;
  max-width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--ui-control-border);
  border-radius: 0.5rem;
  background: var(--ui-surface);
  font-size: 0.75rem;
  color: var(--ui-text);
  text-align: left;
}
.task-prerequisites p,
.downstream-tasks > p {
  font-size: 0.8125rem;
  color: var(--ui-muted);
  line-height: 1.6;
  margin: 0;
}
.delay-control {
  min-width: 0;
  background: var(--ui-surface-alt);
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  padding: 1rem;
}
.delay-control-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.delay-control label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ui-text);
}
.delay-control output {
  font-size: 1rem;
  color: var(--ui-accent);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.delay-control p {
  margin: 0.375rem 0 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-muted);
}
.delay-control input {
  display: block;
  width: 100%;
  min-height: 2.25rem;
  margin: 0;
  accent-color: var(--ui-accent);
  cursor: pointer;
}
.delay-range-labels {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-muted);
  margin: 0 0 0.875rem;
}
.delay-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
  gap: 0.375rem;
}
.delay-presets button {
  min-height: 2.25rem;
  font-size: 0.75rem;
  padding: 0.375rem 0.25rem;
  border: 1px solid var(--ui-control-border);
  background: var(--ui-surface);
  border-radius: 0.5rem;
  color: var(--ui-text);
}
.delay-presets button.active {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: var(--ui-on-accent);
  font-weight: 600;
}
.downstream-tasks {
  margin-top: 1.25rem;
}
.downstream-tasks h3 {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.downstream-tasks h3 > span {
  color: var(--ui-muted);
  font-size: 0.8125rem;
}
.downstream-tasks button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.375rem 0.625rem;
  width: 100%;
  min-height: 2.25rem;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  padding: 0.625rem 0;
  text-align: left;
}
.downstream-tasks button > span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--ui-text);
}
.downstream-tasks button small {
  font-size: 0.75rem;
  color: var(--ui-muted);
}
.task-prerequisites button:hover,
.delay-presets button:hover:not(.active),
.downstream-tasks button:hover {
  background: var(--ui-hover);
}
.timeline-page button:active:not(:disabled) {
  box-shadow: inset 0 0 0 2px var(--ui-accent);
}
.downstream-tasks .task-flex-note {
  margin-top: 0.75rem;
  color: var(--ui-accent);
}
.timeline-footnote {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 1.25rem 0 0;
  color: var(--ui-muted);
}
.timeline-footnote p {
  font-size: 0.75rem;
  margin: 0;
  line-height: 1.65;
  max-width: 60rem;
}
@media (max-width: 1190px) {
  .timeline-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .task-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 1.75rem;
  }
  .task-detail-kicker,
  .task-detail h2,
  .task-description,
  .task-owner,
  .task-dates,
  .task-prerequisites {
    grid-column: 1;
  }
  .task-prerequisites {
    padding: 0;
  }
  .delay-control {
    grid-column: 2;
    grid-row: 1 / 5;
    align-self: start;
  }
  .downstream-tasks {
    grid-column: 2;
    grid-row: 5 / 8;
    margin-top: 0;
  }
}
@media (max-width: 760px) {
  .timeline-page {
    --task-label-width: min(60vw, 12rem);
  }
  .timeline-page-inner {
    padding: 1.5rem 1rem;
  }
  .timeline-page-heading {
    align-items: flex-start;
    gap: 1rem;
  }
  .timeline-study > div {
    flex-basis: calc(100% - 3.25rem);
  }
  .timeline-metrics article {
    padding: 1rem 0.5rem;
  }
  .timeline-board-heading {
    padding: 1rem 1rem 0.75rem;
  }
  .timeline-legend {
    padding: 0 1rem 1rem;
  }
  .timeline-insight {
    padding: 1rem;
  }
  .task-detail {
    display: block;
    padding: 1.125rem;
  }
  .task-prerequisites {
    padding-bottom: 1.25rem;
  }
  .downstream-tasks {
    margin-top: 1.25rem;
  }
  .timeline-reset,
  .baseline-toggle,
  .task-prerequisites button,
  .delay-presets button,
  .downstream-tasks button,
  .delay-control input {
    min-height: 2.75rem;
  }
}
@container timeline (max-width: 62rem) {
  .timeline-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@container timeline (max-width: 42rem) {
  .task-detail {
    display: block;
  }
  .task-prerequisites {
    padding-bottom: 1.25rem;
  }
  .downstream-tasks {
    margin-top: 1.25rem;
  }
}
@container timeline (max-width: 20rem) {
  .timeline-study > div {
    flex-basis: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gantt-bar {
    transition: none;
  }
}
</style>
