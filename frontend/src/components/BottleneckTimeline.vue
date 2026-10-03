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

const STORAGE_KEY = "microfish.bottleneck-timeline.v1";
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
  return `The handoff moves ${schedule.value.shift} working ${schedule.value.shift === 1 ? "day" : "days"} later. Follow the amber tasks to see where the delay travels.`;
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
  if (window.innerWidth <= 1190) {
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
          <p class="timeline-eyebrow"><span></span> PLAN AHEAD, MOVE FORWARD</p>
          <h1 id="timeline-heading" ref="heading" tabindex="-1">
            Bottleneck timeline
          </h1>
          <p class="timeline-intro">
            See what depends on what. Rehearse a delay before it holds you back.
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
        <span class="study-symbol"><AppIcon name="layers" :size="20" /></span>
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
                minWidth: `${220 + dayCount * 34}px`,
                '--day-width': `${100 / dayCount}%`,
              }"
            >
              <div class="gantt-axis">
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
                v-for="(task, index) in schedule.tasks"
                :key="task.id"
                class="gantt-row"
                :class="{
                  'is-selected': selectedId === task.id,
                  'is-affected': task.affected,
                }"
                :aria-pressed="selectedId === task.id"
                aria-controls="timeline-task-detail"
                :aria-label="`${task.title}, starts ${date(task.start)}, ready from ${date(task.end)}${task.affected ? `, ${task.shift} working days later` : ''}. View task details.`"
                @click="selectTask(task.id)"
              >
                <span class="gantt-label task-label"
                  ><span class="task-number">{{
                    String(index + 1).padStart(2, "0")
                  }}</span
                  ><span
                    ><strong>{{ task.title }}</strong
                    ><small>{{ task.owner }}</small></span
                  ><span
                    v-if="task.delay"
                    class="task-delay-dot"
                    title="Added delay"
                  ></span
                ></span>
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
              <div class="gantt-end">
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: #fafbf8;
}
.timeline-page-inner {
  max-width: 1600px;
  margin: 0 auto;
  padding: 34px 34px 24px;
}
.timeline-page-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 26px;
}
.timeline-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #6c7d61;
  font-size: 9px;
  letter-spacing: 1.5px;
  font-weight: 650;
  margin-bottom: 12px;
}
.timeline-eyebrow span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #89a575;
}
h1 {
  margin: 0;
  color: #284d39;
  font-size: clamp(25px, 2.3vw, 34px);
  font-weight: 550;
  letter-spacing: -1.1px;
  line-height: 1.25;
}
h1:focus {
  outline: none;
}
.timeline-intro {
  color: #697664;
  font-size: 12px;
  margin: 10px 0 0;
  line-height: 1.7;
}
.timeline-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-shrink: 0;
  border: 1px solid #dfe6d8;
  border-radius: 7px;
  background: #fff;
  padding: 10px 13px;
  font-size: 11px;
  color: #52684b;
}
.timeline-reset:hover:not(:disabled) {
  background: #edf3e7;
}
.timeline-reset:disabled {
  opacity: 0.5;
}
.timeline-study {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #dfe7d7;
  background: #f0f4ea;
  border-radius: 9px;
  padding: 15px 18px;
}
.study-symbol {
  display: grid;
  place-items: center;
  color: #678156;
  width: 35px;
  height: 35px;
  background: #e6eeda;
  border-radius: 8px;
}
.timeline-study strong {
  font-size: 12px;
  font-weight: 600;
  color: #3e5b35;
}
.timeline-study strong span {
  margin: 0 7px;
  font-weight: 400;
  color: #849179;
}
.timeline-study p {
  font-size: 11px;
  color: #6a7962;
  margin: 5px 0 0;
  line-height: 1.5;
}
.timeline-sample {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid #d9e2cd;
  background: #f8faf4;
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 9px;
  color: #617451;
}
.timeline-storage-notice {
  font-size: 12px;
  padding: 12px;
  background: #fff7e8;
  border-radius: 6px;
  margin-top: 10px;
}
.timeline-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
  margin: 20px 0 24px;
}
.timeline-metrics article {
  border: 1px solid #e2e7dc;
  background: #fff;
  border-radius: 9px;
  padding: 17px 18px;
  display: flex;
  flex-direction: column;
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #68775f;
  margin-bottom: 14px;
}
.timeline-metrics strong {
  color: #35583f;
  font-size: 25px;
  letter-spacing: -0.8px;
  font-weight: 550;
  line-height: 1.2;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.timeline-metrics strong small {
  font-size: 10px;
  background: #fcf0da;
  padding: 4px 5px;
  color: #9a6a2f;
  border-radius: 4px;
  letter-spacing: 0;
}
.timeline-metrics strong .metric-total {
  background: none;
  padding: 0;
  font-size: 17px;
  color: #97a18e;
  font-weight: 400;
}
.timeline-metrics strong .metric-unit {
  background: none;
  padding: 0;
  font-size: 10px;
  color: #74806c;
  font-weight: 400;
}
.timeline-metrics article > span:last-child {
  font-size: 9px;
  color: #72806a;
  margin-top: 8px;
  line-height: 1.5;
}
.amber {
  color: #a57032 !important;
}
.timeline-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 20px;
  align-items: start;
}
.timeline-board {
  border: 1px solid #e1e7da;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
}
.timeline-board-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 21px 15px;
}
h2 {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin: 0;
  color: #355139;
}
.timeline-board-heading p {
  font-size: 10px;
  color: #76836e;
  margin: 6px 0 0;
}
.baseline-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: #6d7a65;
  white-space: nowrap;
  cursor: pointer;
}
.baseline-toggle input {
  accent-color: #6a8b56;
}
.timeline-legend {
  padding: 0 21px 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
  font-size: 9px;
  color: #72806c;
}
.timeline-legend > span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.timeline-legend i {
  display: inline-block;
  width: 12px;
  height: 7px;
  border-radius: 2px;
}
.legend-current {
  background: #a9bf92;
}
.legend-shifted {
  background: #d6b075;
}
.legend-baseline {
  border: 1px dashed #99a48c;
}
.legend-target {
  margin-left: auto;
  color: #8f7b5a;
}
.gantt-scroll {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #cdd8c3 transparent;
}
.gantt-scroll:focus-visible {
  outline: 2px solid #71965c;
  outline-offset: -2px;
}
.gantt-axis,
.gantt-row,
.gantt-end {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}
.gantt-axis {
  background: #f8faf5;
  border-top: 1px solid #e9ede4;
  border-bottom: 1px solid #e9ede4;
}
.gantt-label {
  position: sticky;
  left: 0;
  z-index: 2;
  border-right: 1px solid #e6ecdf;
  text-align: left;
  background: #fff;
}
.gantt-axis > .gantt-label,
.gantt-end > .gantt-label {
  padding: 20px;
  color: #88917f;
  font-size: 8px;
  letter-spacing: 0.8px;
  font-weight: 550;
  background: #f8faf5;
}
.gantt-weeks {
  display: flex;
}
.gantt-weeks > span {
  padding: 11px 12px;
  font-size: 10px;
  font-weight: 550;
  color: #607653;
  border-left: 1px solid #e8eddf;
}
.gantt-weeks small {
  display: block;
  font-size: 7px;
  letter-spacing: 0.5px;
  font-weight: 400;
  margin-top: 5px;
  color: #89957e;
}
.gantt-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #edf0e8;
  background: #fff;
  padding: 0;
  text-align: left;
}
.gantt-row:hover,
.gantt-row:hover .gantt-label {
  background: #f7f9f3;
}
.gantt-row.is-selected,
.gantt-row.is-selected .gantt-label {
  background: #eff5e9;
}
.gantt-row.is-selected .gantt-label {
  box-shadow: inset 3px 0 #7e9f64;
}
.gantt-row:focus-visible {
  outline-offset: -2px;
  position: relative;
  z-index: 3;
}
.task-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 67px;
  padding: 10px 14px;
}
.task-number {
  font-size: 9px;
  color: #8f9b83;
  font-variant-numeric: tabular-nums;
}
.task-label strong {
  display: block;
  font-size: 10px;
  font-weight: 550;
  color: #48603d;
  line-height: 1.4;
}
.task-label small {
  display: block;
  font-size: 9px;
  color: #829077;
  margin-top: 5px;
}
.task-delay-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c49653;
  margin-left: auto;
  flex-shrink: 0;
}
.gantt-track {
  position: relative;
  min-width: 0;
  display: block;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(var(--day-width) - 1px),
    #edf1e7 calc(var(--day-width) - 1px),
    #edf1e7 var(--day-width)
  );
}
.gantt-deadline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed #b59b6d;
  z-index: 1;
}
.gantt-baseline {
  position: absolute;
  top: 44px;
  height: 7px;
  border: 1px dashed #adb99f;
  border-radius: 2px;
  background: #f8faf5;
}
.gantt-bar {
  position: absolute;
  top: 17px;
  height: 23px;
  border-radius: 4px;
  background: #b4c9a0;
  border: 1px solid #a3bd8c;
  color: #36542a;
  min-width: 18px;
  transition:
    left 0.25s ease,
    width 0.25s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gantt-bar.shifted {
  background: #e3c18b;
  border-color: #d4ad6e;
  color: #714d1f;
}
.gantt-bar span {
  font-size: 9px;
  font-weight: 600;
}
.gantt-end {
  background: #f8faf5;
}
.gantt-end > .gantt-label {
  padding: 10px 20px;
  font-size: 7px;
}
.gantt-day-labels {
  display: flex;
  align-items: center;
  color: #8b977f;
}
.gantt-day-labels > span {
  width: var(--day-width);
  padding-left: 4px;
  font-size: 8px;
}
.timeline-insight {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 18px 20px;
  background: #f7faf3;
  border-top: 1px solid #e5ecdc;
}
.insight-icon {
  display: grid;
  place-items: center;
  height: 30px;
  width: 30px;
  flex-shrink: 0;
  border: 1px solid #e1e9d7;
  background: #eff4e8;
  border-radius: 8px;
  color: #7b9860;
}
.timeline-insight strong {
  font-size: 11px;
  color: #53733e;
  font-weight: 550;
}
.timeline-insight p {
  font-size: 10px;
  color: #758369;
  line-height: 1.7;
  margin: 5px 0 0;
}
.timeline-insight.has-delay {
  background: #fdf9f0;
  border-color: #efe4ce;
}
.has-delay strong {
  color: #8b693b;
}
.has-delay p {
  color: #877961;
}
.has-delay .insight-icon {
  background: #fbf1de;
  border-color: #eee0c5;
  color: #aa8551;
}
.task-detail {
  scroll-margin-top: 18px;
  border: 1px solid #dfe6d8;
  border-radius: 10px;
  padding: 20px;
  background: #fff;
}
.task-detail-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 8px;
  letter-spacing: 0.8px;
  color: #8a967e;
  margin-bottom: 18px;
}
.task-path-badge {
  font-size: 8px;
  letter-spacing: 0;
  padding: 4px 6px;
  background: #eff4e7;
  border-radius: 4px;
  color: #6d8556;
}
.task-detail h2 {
  font-size: 18px;
  font-weight: 550;
  line-height: 1.4;
  letter-spacing: -0.4px;
}
.task-description {
  font-size: 10px;
  color: #7a8770;
  line-height: 1.8;
  margin: 9px 0 18px;
}
.task-owner {
  display: flex;
  align-items: center;
  gap: 9px;
}
.task-owner > span {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: 50%;
  background: #eef3e7;
  color: #6d8459;
  font-size: 10px;
}
.task-owner small {
  display: block;
  font-size: 8px;
  color: #8a9581;
  margin-bottom: 3px;
}
.task-owner strong {
  font-size: 10px;
  color: #536a44;
  font-weight: 500;
}
.task-dates {
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 17px 0;
  margin: 17px 0 0;
  border-top: 1px solid #edf0e8;
  color: #9ba58f;
}
.task-dates dt {
  font-size: 9px;
  color: #89957e;
  margin-bottom: 5px;
}
.task-dates dd {
  margin: 0;
  font-size: 12px;
  color: #536e42;
  font-weight: 550;
}
h3 {
  margin: 0 0 10px;
  color: #5a704a;
  font-size: 10px;
  font-weight: 550;
}
.task-prerequisites {
  padding-bottom: 18px;
}
.task-prerequisites > div {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.task-prerequisites button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 7px;
  border: 1px solid #e4e9dc;
  border-radius: 4px;
  background: #f8faf5;
  font-size: 9px;
  color: #6e805e;
}
.task-prerequisites p,
.downstream-tasks > p {
  font-size: 10px;
  color: #869279;
  line-height: 1.6;
  margin: 0;
}
.delay-control {
  background: #f3f6ed;
  border: 1px solid #e2e9d8;
  border-radius: 8px;
  padding: 13px;
}
.delay-control-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 5px;
}
.delay-control label {
  font-size: 10px;
  font-weight: 550;
  color: #526e40;
}
.delay-control output {
  font-size: 13px;
  color: #648648;
  font-weight: 600;
}
.delay-control p {
  margin: 6px 0 13px;
  font-size: 9px;
  color: #849177;
}
.delay-control input {
  width: 100%;
  margin: 0;
  accent-color: #779b59;
  cursor: pointer;
}
.delay-range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  color: #8b977e;
  margin: 5px 0 13px;
}
.delay-presets {
  display: flex;
  gap: 5px;
}
.delay-presets button {
  flex: 1;
  font-size: 9px;
  padding: 6px 2px;
  border: 1px solid #e0e7d6;
  background: #fcfdf9;
  border-radius: 4px;
  color: #788b65;
  white-space: nowrap;
}
.delay-presets button.active {
  background: #e3ecd7;
  border-color: #c4d6af;
  color: #4d6c39;
}
.downstream-tasks {
  margin-top: 20px;
}
.downstream-tasks h3 {
  display: flex;
  justify-content: space-between;
}
.downstream-tasks h3 > span {
  color: #8a987e;
  font-size: 9px;
}
.downstream-tasks button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  background: none;
  border: 0;
  border-bottom: 1px solid #eef1e8;
  padding: 10px 0;
  text-align: left;
}
.downstream-tasks button > span {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #6a7b5d;
}
.downstream-tasks button small {
  font-size: 8px;
  white-space: nowrap;
  color: #869678;
}
.task-prerequisites button:hover,
.delay-presets button:hover {
  background: #e9f1df;
}
.downstream-tasks button:hover > span {
  color: #2b6846;
}
.downstream-tasks .task-flex-note {
  margin-top: 12px;
  color: #65804f;
}
.timeline-footnote {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  margin: 17px 0 0;
  color: #88937e;
}
.timeline-footnote p {
  font-size: 9px;
  margin: 0;
  line-height: 1.7;
  max-width: 830px;
}
@media (min-width: 1600px) {
  .timeline-page-inner {
    padding: 40px;
  }
  .timeline-layout {
    grid-template-columns: minmax(0, 1fr) 310px;
  }
  .task-detail {
    padding: 24px;
  }
}
@media (max-width: 1190px) {
  .timeline-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .task-detail {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 28px;
  }
  .task-detail-kicker,
  .task-detail h2,
  .task-description {
    grid-column: 1;
  }
  .task-detail-kicker {
    margin-bottom: 12px;
  }
  .task-owner {
    grid-column: 1;
  }
  .task-dates {
    grid-column: 1;
  }
  .task-prerequisites {
    grid-column: 1;
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
  .timeline-page-inner {
    padding: 27px 24px;
  }
  .timeline-metrics {
    gap: 9px;
  }
  .timeline-metrics article {
    padding: 14px;
  }
  .timeline-metrics strong {
    font-size: 22px;
  }
}
@media (max-width: 760px) {
  .timeline-page-inner {
    padding: 24px 18px;
  }
  .timeline-page-heading {
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 19px;
  }
  .timeline-intro {
    font-size: 11px;
  }
  .timeline-reset {
    padding: 8px 11px;
  }
  .timeline-study {
    padding: 12px;
    gap: 9px;
    flex-wrap: wrap;
  }
  .timeline-study > div {
    flex: 1;
  }
  .timeline-study strong {
    font-size: 11px;
  }
  .timeline-study p {
    font-size: 10px;
  }
  .timeline-sample {
    margin-left: 44px;
  }
  .timeline-metrics {
    grid-template-columns: 1fr 1fr;
    margin: 16px 0;
  }
  .timeline-metrics article {
    padding: 15px;
  }
  .metric-label {
    font-size: 9px;
    margin-bottom: 11px;
  }
  .timeline-board-heading {
    padding: 18px 14px 14px;
    gap: 8px;
  }
  .timeline-board-heading h2 {
    font-size: 12px;
  }
  .timeline-board-heading p {
    font-size: 9px;
  }
  .baseline-toggle {
    font-size: 9px;
  }
  .timeline-legend {
    padding: 0 14px 14px;
    gap: 10px;
    font-size: 8px;
  }
  .timeline-layout {
    gap: 15px;
  }
  .timeline-insight {
    padding: 16px 14px;
  }
  .task-detail {
    display: block;
    padding: 19px;
  }
  .task-prerequisites {
    padding-bottom: 18px;
  }
  .downstream-tasks {
    margin-top: 20px;
  }
  .timeline-footnote p {
    font-size: 8px;
  }
  .gantt-label {
    max-width: 190px;
  }
  .gantt-axis,
  .gantt-row,
  .gantt-end {
    grid-template-columns: 190px minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .gantt-bar {
    transition: none;
  }
}
</style>
