<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import SimulationGraph from './SimulationGraph.vue'
import SampleCaseStudy from './SampleCaseStudy.vue'
import AppIcon from './AppIcon.vue'
import { CASE_REVIEW_GROUPS, createSampleCaseGraph, SAMPLE_REVIEW_EVENTS, SAMPLE_AGENT_COUNT, SAMPLE_INITIAL_REVIEWED, SAMPLE_ROLE_COUNT, SAMPLE_REVIEW_LENSES } from '../lib/sampleCaseGraph.js'
import { getSampleCaseComparison } from '../lib/sampleCaseStudy.js'

const emit = defineEmits(['navigate'])
const graph = createSampleCaseGraph()
const comparison = getSampleCaseComparison()
const byId = new Map(graph.nodes.map(node => [node.id, node]))
const groups = new Map(CASE_REVIEW_GROUPS.map(group => [group.id, group]))
const irbMembers = graph.nodes.filter(node => node.kind === 'agent' && node.lensId === 'case-review' && node.baseRole.startsWith('IRB '))
const heading = ref(null)
const graphView = ref(null)
const reviewRail = ref(null)
const detailHeading = ref(null)
const activityHeading = ref(null)
const brief = ref(null)
const view = ref('graph')
const selectedId = ref(null)
const reviewed = ref(SAMPLE_INITIAL_REVIEWED)
const playing = ref(true)
const speed = ref(1)
const reduceMotion = ref(false)
const complete = computed(() => reviewed.value >= SAMPLE_REVIEW_EVENTS.length)
const currentEvent = computed(() => SAMPLE_REVIEW_EVENTS[Math.max(0, reviewed.value - 1)])
const activity = computed(() => SAMPLE_REVIEW_EVENTS.slice(0, reviewed.value).slice(-8).reverse())
const activeIds = computed(() => complete.value ? [] : currentEvent.value.relatedIds)
const selected = computed(() => byId.get(selectedId.value))
const rolePerspectives = computed(() => selected.value?.kind === 'agent' ? graph.nodes.filter(node => node.baseAgentId === selected.value.baseAgentId) : [])
const selectedReview = computed(() => SAMPLE_REVIEW_EVENTS.find(event => event.agentId === selectedId.value))
const selectedReviewed = computed(() => SAMPLE_REVIEW_EVENTS.slice(0, reviewed.value).some(event => event.agentId === selectedId.value))
const neighbors = computed(() => {
  if (!selected.value) return []
  return graph.links.filter(link => link.source === selectedId.value || link.target === selectedId.value)
    .map(link => ({ node: byId.get(link.source === selectedId.value ? link.target : link.source), label: link.label }))
    .sort((a, b) => (a.node.kind === 'agent') - (b.node.kind === 'agent'))
})
const run = computed(() => ({
  id: 'rest-101-case-review', agentCount: SAMPLE_AGENT_COUNT,
  status: complete.value ? 'completed' : playing.value ? 'running' : 'paused',
  progress: reviewed.value / SAMPLE_REVIEW_EVENTS.length * 100,
}))
const reviewStatus = computed(() => complete.value ? 'Review complete' : playing.value ? 'Review in progress' : 'Review paused')
let timer, motionQuery, lastTick = 0, accumulated = 0

function advance(steps = 1) {
  reviewed.value = Math.min(SAMPLE_REVIEW_EVENTS.length, reviewed.value + steps)
  if (complete.value) playing.value = false
}
function nextReview() { playing.value = false; accumulated = 0; advance() }
function replay() { reviewed.value = 1; accumulated = 0; playing.value = !reduceMotion.value }
async function inspect(node) {
  const fromRail = reviewRail.value?.contains(document.activeElement)
  selectedId.value = node?.id || null
  if (document.fullscreenElement) return
  await nextTick()
  if (reviewRail.value) reviewRail.value.scrollTop = 0
  if (node && fromRail) detailHeading.value?.focus({ preventScroll: true })
  if (node && window.innerWidth <= 1000) reviewRail.value?.scrollIntoView({ block: 'start', behavior: reduceMotion.value ? 'auto' : 'smooth' })
}
function focusNode(id) { graphView.value?.focusNode(id) }
function inspectIrb() { focusNode(irbMembers[0].id) }
async function clearSelection() { selectedId.value = null; await nextTick(); activityHeading.value?.focus({ preventScroll: true }) }
function motionChanged(event) { reduceMotion.value = event.matches; if (event.matches) playing.value = false }
async function showBrief() { view.value = 'brief'; await nextTick(); brief.value?.focusHeading() }
async function showGraph() { view.value = 'graph'; await nextTick(); heading.value?.focus() }
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionChanged(motionQuery)
  motionQuery.addEventListener('change', motionChanged)
  lastTick = performance.now()
  timer = window.setInterval(() => {
    const now = performance.now()
    const delta = Math.min(1000, now - lastTick)
    lastTick = now
    if (!playing.value || document.hidden || view.value !== 'graph' || complete.value) return
    accumulated += delta * speed.value
    if (accumulated >= 1800) { const steps = Math.floor(accumulated / 1800); accumulated %= 1800; advance(steps) }
  }, 200)
})
onUnmounted(() => { window.clearInterval(timer); motionQuery?.removeEventListener('change', motionChanged) })
defineExpose({ focusHeading: () => view.value === 'brief' ? brief.value?.focusHeading() : heading.value?.focus() })
</script>

<template>
  <section class="case-graph-workspace" aria-label="REST-101 sample case">
    <template v-if="view === 'brief'">
      <nav class="case-brief-nav" aria-label="Case views"><button type="button" @click="showGraph"><AppIcon name="graph" :size="17" />Back to the {{ SAMPLE_AGENT_COUNT }}-agent graph</button></nav>
      <SampleCaseStudy ref="brief" @navigate="emit('navigate', $event)" />
    </template>
    <template v-else>
      <header class="case-graph-heading">
        <div class="case-graph-title">
          <p class="case-graph-eyebrow">REST-101 · Agent review</p>
          <h1 ref="heading" tabindex="-1">One case. {{ SAMPLE_AGENT_COUNT }} perspectives.</h1>
          <p>Simulated IRB board members, research teams, and participant perspectives review Alex’s research onboarding.</p>
          <p class="case-review-roster">{{ SAMPLE_ROLE_COUNT }} fictional roles × {{ SAMPLE_REVIEW_LENSES.length }} review lenses · {{ CASE_REVIEW_GROUPS.length }} groups</p>
        </div>
        <div class="case-graph-heading-actions"><span class="case-agent-count"><AppIcon name="people" :size="17" /><strong>{{ SAMPLE_AGENT_COUNT }}</strong> scripted review agents</span><div class="case-heading-buttons"><button type="button" @click="inspectIrb">Meet the IRB members<AppIcon name="people" :size="16" /></button><button type="button" @click="showBrief">Read sample report<AppIcon name="arrow-right" :size="16" /></button></div></div>
      </header>

      <div class="case-review-controls" aria-label="Sample review playback">
        <div class="case-review-state"><span class="case-review-dot" :class="{ playing: playing && !complete }"></span><strong>{{ reviewStatus }}</strong><span class="case-review-count">{{ reviewed }} / {{ SAMPLE_AGENT_COUNT }} reviewed</span></div>
        <div class="case-review-buttons">
          <button v-if="!complete" type="button" :aria-label="playing ? 'Pause agent review' : 'Resume agent review'" @click="playing = !playing"><span aria-hidden="true">{{ playing ? 'Ⅱ' : '▷' }}</span>{{ playing ? 'Pause' : 'Resume' }}</button>
          <button type="button" aria-label="Next agent review" :disabled="complete" @click="nextReview">Next<span aria-hidden="true">→</span></button>
          <button type="button" aria-label="Replay agent review" @click="replay"><AppIcon name="reset" :size="15" />Replay</button>
          <select v-model.number="speed" aria-label="Review playback speed"><option :value="1">1× speed</option><option :value="2">2× speed</option><option :value="4">4× speed</option><option :value="10">10× speed</option></select>
        </div>
        <div class="case-review-progress" role="progressbar" aria-label="Agents reviewed" :aria-valuenow="reviewed" :aria-valuemax="SAMPLE_AGENT_COUNT" aria-valuemin="0"><span :style="{ width: `${run.progress}%` }"></span></div>
      </div>

      <div class="case-graph-layout">
        <div class="case-graph-canvas">
          <SimulationGraph ref="graphView" :graph-data="graph" :run="run" :active-node-ids="activeIds" :selected-node-id="selectedId" :show-details="false" @node-select="inspect" />
        </div>
        <aside ref="reviewRail" class="case-review-rail" aria-label="Case agent reviews">
          <section class="case-review-complete" aria-labelledby="case-conclusions-heading">
            <h2 id="case-conclusions-heading">Final conclusions</h2>
            <span class="case-scripted-label">Prepared sample report</span>
            <p><strong>{{ comparison.calendarDaysRecovered }} calendar days earlier.</strong> The prepared path reaches readiness on October 19 instead of November 2.</p>
            <p>Verify HS-02 evidence before submission and prepare the empty workspace during review. The five-day complete-packet review and data-release checks stay in place.</p>
            <p v-if="complete">All {{ SAMPLE_AGENT_COUNT }} perspectives reviewed.</p>
            <button type="button" @click="showBrief">Read sample report <span aria-hidden="true">→</span></button>
          </section>
          <template v-if="selected">
            <header class="case-rail-header"><h2>{{ selected.kind === 'agent' ? 'Agent perspective' : 'Case connection' }}</h2><button type="button" aria-label="Back to review activity" @click="clearSelection">×</button></header>
            <div class="case-node-detail">
              <span class="case-group-label" :style="{ '--group-color': groups.get(selected.groupId)?.color || 'var(--ui-accent)' }"><i></i>{{ groups.get(selected.groupId)?.label || 'REST-101 case' }}</span>
              <p v-if="selected.baseRole?.startsWith('IRB ')" class="case-irb-identity">Simulated IRB board member · Fictional persona</p>
              <h3 ref="detailHeading" tabindex="-1">{{ selected.label }}</h3>
              <label v-if="selected.kind === 'agent'" class="case-lens-field">Review lens<select :value="selected.id" @change="focusNode($event.target.value)"><option v-for="perspective in rolePerspectives" :key="perspective.id" :value="perspective.id">{{ perspective.lensLabel }}</option></select></label>
              <p v-if="!selectedReview || selected.description !== selectedReview.text">{{ selected.description }}</p>
              <template v-if="selectedReview">
                <div class="case-agent-review"><span>{{ selectedReviewed ? 'Reviewed in this walkthrough' : 'Upcoming scripted perspective' }}</span><p>{{ selectedReview.text }}</p></div>
              </template>
              <dl v-else class="case-node-properties"><div v-for="(value, key) in selected.properties" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl>
              <nav v-if="selected.groupId === 'ethics'" class="case-irb-members" aria-label="Simulated IRB members"><button v-for="member in irbMembers" :key="member.id" type="button" :aria-current="member.baseAgentId === selected.baseAgentId ? 'true' : undefined" @click="focusNode(member.id)">{{ member.baseRole }}</button></nav>
              <h4 class="case-connections-heading">Connected in the case <span>{{ neighbors.length }}</span></h4>
              <div class="case-connected-nodes"><button v-for="connection in neighbors" :key="connection.node.id" type="button" @click="focusNode(connection.node.id)"><span><strong>{{ connection.node.label }}</strong><small>{{ connection.label }}</small></span><span aria-hidden="true">↗</span></button></div>
            </div>
          </template>
          <template v-else>
            <header class="case-rail-header"><h2 ref="activityHeading" tabindex="-1">Agent activity</h2><span class="case-scripted-label">Scripted demo</span></header>
            <p class="case-activity-intro">Select a review to find its agent and related case details on the graph.</p>
            <ol class="case-activity-list" aria-label="Recent agent reviews">
              <li v-for="(event, index) in activity" :key="event.id" :class="{ latest: index === 0 }">
                <button type="button" :aria-label="`Inspect review by ${byId.get(event.agentId).label}`" @click="focusNode(event.agentId)">
                  <span class="case-activity-meta"><span class="case-group-label" :style="{ '--group-color': groups.get(event.groupId)?.color }"><i></i>{{ groups.get(event.groupId)?.label }}</span><span>{{ String(SAMPLE_REVIEW_EVENTS.indexOf(event) + 1).padStart(2, '0') }}</span></span>
                  <strong>{{ byId.get(event.agentId).label }}</strong><span class="case-activity-text">{{ event.text }}</span><span class="case-activity-link">Explore connections <span aria-hidden="true">↗</span></span>
                </button>
              </li>
            </ol>
          </template>
        </aside>
      </div>
      <footer class="case-graph-note"><span>Fictional case · Scripted agent walkthrough · No API calls</span><button type="button" @click="emit('navigate', 'preflight')">Inspect the sample documents <span aria-hidden="true">↗</span></button></footer>
    </template>
  </section>
</template>

<style scoped>
.case-graph-workspace { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow-y: auto; color: var(--ui-text); background: var(--ui-canvas); }
button, select { font: inherit; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--ui-text); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 7px; min-height: 38px; padding: 8px 12px; font-size: .8125rem; }
button:hover { background: var(--ui-hover); border-color: var(--ui-accent); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 3px; }
button:disabled { opacity: .45; cursor: default; }
.case-graph-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 23px 28px 20px; }
.case-graph-eyebrow { margin: 0 0 6px; color: var(--ui-accent); font-size: .6875rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 650; }
h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(1.65rem, 2.5vw, 2.35rem); letter-spacing: -.035em; line-height: 1.15; margin: 0; }
h1:focus { outline: none; }
.case-graph-title > p:not(.case-graph-eyebrow) { margin: 9px 0 0; font-size: .8125rem; line-height: 1.6; color: var(--ui-muted); }
.case-graph-title > .case-review-roster { font-family: var(--font-data); font-size: .6875rem; }
.case-graph-heading-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex-shrink: 0; }
.case-heading-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.case-agent-count { display: inline-flex; align-items: center; gap: 7px; font-size: .8125rem; color: var(--ui-muted); }
.case-agent-count svg, .case-agent-count strong { color: var(--ui-accent); }
.case-review-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 11px 28px 13px; border-top: 1px solid var(--ui-border); position: relative; background: var(--ui-surface-alt); }
.case-review-state { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; font-size: .75rem; }
.case-review-state strong { font-weight: 550; }
.case-review-count { color: var(--ui-muted); margin-left: 6px; font-variant-numeric: tabular-nums; }
.case-review-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ui-muted); }
.case-review-dot.playing { background: var(--ui-success); box-shadow: 0 0 0 4px var(--ui-success-bg); }
.case-review-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-left: auto; }
.case-review-buttons button, .case-review-buttons select { font-size: .75rem; min-height: 34px; padding: 6px 10px; }
.case-review-buttons select { color: var(--ui-text); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 6px; }
.case-review-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--ui-border); }
.case-review-progress span { display: block; height: 100%; background: var(--ui-accent); transition: width .4s ease; }
.case-graph-layout { display: grid; grid-template-columns: minmax(0, 1fr) 316px; flex: 1 0 auto; min-height: 800px; }
.case-graph-canvas { min-width: 0; min-height: 0; display: flex; }
.case-graph-canvas :deep(.simulation-graph) { min-height: 800px; height: auto; border: 0; }
.case-graph-canvas :deep(.graph-header) { padding: 14px 20px; }
.case-graph-canvas :deep(.graph-header h2) { font-family: var(--font-ui); font-size: .9375rem; font-weight: 600; letter-spacing: 0; }
.case-graph-canvas :deep(.graph-description) { font-size: .75rem; margin-top: 5px; }
.case-graph-canvas :deep(.graph-stage) { min-height: 470px; }
.case-review-rail { min-width: 0; min-height: 0; contain: size; overflow: auto; border-left: 1px solid var(--ui-border); background: var(--ui-surface); scrollbar-width: thin; }
.case-rail-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 18px 19px 10px; }
.case-rail-header h2 { margin: 0; font-size: .875rem; font-weight: 600; }
.case-rail-header button { border: 0; min-height: 30px; min-width: 30px; padding: 2px; font-size: 1.25rem; }
.case-scripted-label { font-size: .625rem; color: var(--ui-muted); border: 1px solid var(--ui-border); border-radius: 4px; padding: 4px 6px; }
.case-activity-intro { padding: 0 19px; margin: 0 0 16px; color: var(--ui-muted); font-size: .75rem; line-height: 1.6; }
.case-activity-list { list-style: none; margin: 0; padding: 0 12px 16px; }
.case-activity-list li { border-top: 1px solid var(--ui-border); }
.case-activity-list li.latest { background: var(--ui-selected); border: 1px solid var(--ui-border); border-radius: 9px; }
.case-activity-list button { display: flex; align-items: stretch; flex-direction: column; text-align: left; width: 100%; border: 0; border-radius: 7px; padding: 14px 8px; background: transparent; gap: 8px; }
.case-activity-list button:hover { background: var(--ui-hover); }
.case-activity-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: var(--font-data); font-size: .6875rem; color: var(--ui-muted); }
.case-group-label { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: .6875rem; color: var(--ui-muted); }
.case-group-label i { width: 7px; height: 7px; border-radius: 50%; background: var(--group-color); flex-shrink: 0; }
.case-activity-list strong { font-size: .8125rem; font-weight: 600; line-height: 1.45; }
.case-activity-text { font-size: .75rem; line-height: 1.65; color: var(--ui-muted); }
.case-activity-link { font-size: .6875rem; color: var(--ui-accent); margin-top: 2px; }
.case-node-detail { padding: 5px 20px 24px; }
.case-node-detail h3 { font-family: var(--font-display); font-weight: 400; font-size: 1.5rem; line-height: 1.2; margin: 13px 0; }
.case-node-detail p { color: var(--ui-muted); font-size: .8125rem; line-height: 1.75; }
.case-node-detail .case-irb-identity { color: var(--ui-accent); font-size: .6875rem; margin-bottom: 0; }
.case-lens-field { display: flex; flex-direction: column; gap: 5px; color: var(--ui-muted); font-size: .6875rem; }
.case-lens-field select { width: 100%; padding: 8px; border: 1px solid var(--ui-control-border); border-radius: 4px; background: var(--ui-surface); color: var(--ui-text); font-size: .8125rem; }
.case-irb-members { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 22px; }
.case-irb-members button { min-height: 32px; padding: 5px 8px; font-size: .6875rem; }
.case-irb-members button[aria-current] { border-color: var(--ui-accent); color: var(--ui-accent); background: var(--ui-selected); }
.case-agent-review { border-block: 1px solid var(--ui-border); margin: 22px 0; padding: 17px 0; }
.case-agent-review > span { font-size: .6875rem; color: var(--ui-accent); }
.case-agent-review h4 { font-weight: 600; line-height: 1.5; font-size: .875rem; margin: 9px 0; }
.case-agent-review p { margin-bottom: 0; }
.case-connections-heading { font-size: .6875rem; text-transform: uppercase; letter-spacing: .045em; font-weight: 600; }
.case-connections-heading span { float: right; color: var(--ui-muted); }
.case-connected-nodes { display: flex; flex-direction: column; gap: 7px; }
.case-connected-nodes button { display: flex; justify-content: space-between; text-align: left; line-height: 1.5; font-size: .75rem; }
.case-connected-nodes strong { display: block; font-weight: 500; }
.case-connected-nodes small { display: block; font-size: .6875rem; color: var(--ui-muted); }
.case-node-properties { font-size: .75rem; line-height: 1.6; }
.case-node-properties div { margin-bottom: 10px; }
.case-node-properties dt { font-weight: 600; }
.case-node-properties dd { margin: 2px 0 0; color: var(--ui-muted); overflow-wrap: anywhere; }
.case-review-complete { margin: 0 19px; padding: 20px 0; border-bottom: 1px solid var(--ui-border); font-size: .8125rem; line-height: 1.7; }
.case-review-complete h2 { margin: 0 0 10px; font-size: .9375rem; font-weight: 600; }
.case-review-complete p { color: var(--ui-muted); }
.case-graph-note { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 11px 24px; border-top: 1px solid var(--ui-border); color: var(--ui-muted); font-size: .6875rem; }
.case-graph-note button { background: none; border: 0; padding: 4px 0; min-height: 28px; font-size: .6875rem; color: var(--ui-accent); }
.case-brief-nav { padding: 12px 24px; border-bottom: 1px solid var(--ui-border); }
@media (max-width: 1200px) { .case-graph-layout { grid-template-columns: minmax(0, 1fr) 280px; } .case-graph-heading { padding: 20px; } .case-review-controls { padding-inline: 20px; } }
@media (max-width: 1000px) { .case-graph-layout { grid-template-columns: minmax(0, 1fr); } .case-review-rail { contain: none; max-height: 430px; min-height: 300px; border-left: 0; border-top: 1px solid var(--ui-border); } .case-graph-canvas :deep(.simulation-graph) { min-height: 780px; height: auto; } .case-graph-heading-actions { align-items: flex-start; } }
@media (max-width: 600px) { .case-graph-heading { flex-direction: column; align-items: stretch; gap: 15px; padding: 18px 16px; } .case-graph-heading-actions { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; } .case-agent-count { font-size: .75rem; } .case-graph-heading-actions button { font-size: .75rem; } .case-review-controls { padding: 12px 16px; gap: 12px; } .case-review-buttons { margin-left: 0; } .case-review-count { margin-left: 0; } .case-graph-note { padding: 12px 16px; } .case-graph-canvas :deep(.simulation-graph) { min-height: 950px; } }
@media (prefers-reduced-motion: reduce) { .case-review-progress span { transition: none; } }
</style>
