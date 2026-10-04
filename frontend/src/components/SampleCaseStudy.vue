<script setup>
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { getSampleCaseComparison, SAMPLE_CASE_START, SAMPLE_CASE_ROTATION_END } from '../lib/sampleCaseStudy.js';

const emit = defineEmits(['navigate']);
const heading = ref(null);
const comparison = getSampleCaseComparison();
const plans = [
  { id: 'original', title: 'Original sequence', summary: 'Wait for the packet correction, then start technical setup after release.', ...comparison.original },
  { id: 'prepared', title: 'Prepared sequence', summary: 'Verify the missing evidence early and prepare the empty workspace during review.', ...comparison.prepared },
];
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateLabel = value => dateFormatter.format(new Date(`${value}T00:00:00Z`));
const stageStyle = task => ({ left: `${task.start / comparison.original.workingDays * 100}%`, width: `${task.duration / comparison.original.workingDays * 100}%` });
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <main class="case-page" aria-labelledby="sample-case-heading">
    <div class="case-content">
      <header class="case-header">
        <p class="case-eyebrow">Fictional REST-101 case</p>
        <h1 id="sample-case-heading" ref="heading" tabindex="-1">The student who could have<br class="case-title-break" /> started two weeks earlier.</h1>
        <p class="case-intro">Alex is joining a research team for a six-week rotation. Unresolved training evidence and a late workspace request turn a small preparation task into weeks of waiting.</p>
      </header>

      <section class="case-profile" aria-label="Alex’s starting point">
        <span class="case-avatar" aria-hidden="true">A</span>
        <div><strong>Alex · Student researcher</strong><p>Cedar Bay University · REST-101 sleep study</p></div>
        <div class="case-profile-dates"><AppIcon name="calendar" :size="17" /><span><time :datetime="SAMPLE_CASE_START">{{ dateLabel(SAMPLE_CASE_START) }}</time>–<time :datetime="SAMPLE_CASE_ROTATION_END">{{ dateLabel(SAMPLE_CASE_ROTATION_END) }}, 2026</time> · 12 hours/week</span></div>
      </section>
      <p class="case-goal"><strong>The goal</strong> Be ready for the first authorized data-quality task.</p>

      <section class="case-comparison" aria-labelledby="case-comparison-heading">
        <div class="case-section-heading">
          <h2 id="case-comparison-heading">Same start. Same review. A different path.</h2>
          <p>Both plans begin October 5. The complete-packet review takes five working days in each.</p>
        </div>
        <div class="case-plans">
          <article v-for="plan in plans" :key="plan.id" class="case-plan" :class="plan.id" :aria-labelledby="`case-plan-${plan.id}`">
            <div class="case-plan-heading">
              <h3 :id="`case-plan-${plan.id}`">{{ plan.title }}</h3>
              <span>{{ plan.workingDays }} working days</span>
            </div>
            <div class="case-ready-date"><span>Ready for the assigned task</span><time :datetime="plan.readyDate">{{ dateLabel(plan.readyDate) }}</time></div>
            <p class="case-plan-summary">{{ plan.summary }}</p>
            <ol class="case-stages" :aria-label="`${plan.title} stages`">
              <li v-for="task in plan.tasks" :key="task.id" :class="{ 'case-review-stage': task.id === 'review' }">
                <div class="case-stage-heading"><strong>{{ task.title }}</strong><span v-if="task.parallel" class="case-parallel-label">In parallel</span><span class="case-duration">{{ task.duration }}d</span></div>
                <p class="case-stage-dates"><time :datetime="task.startDate">{{ dateLabel(task.startDate) }}</time><span aria-hidden="true"> → </span><span class="sr-only"> to </span><time :datetime="task.endDate">{{ dateLabel(task.endDate) }}</time></p>
                <div class="case-stage-track" aria-hidden="true"><span :style="stageStyle(task)"></span></div>
              </li>
            </ol>
            <p class="case-time-remaining"><strong>{{ plan.remainingWeeks }} weeks</strong> remain in Alex’s rotation.</p>
          </article>
        </div>
        <div class="case-result"><AppIcon name="clock" :size="23" /><div><strong>{{ comparison.calendarDaysRecovered }} calendar days earlier</strong><p>{{ comparison.workingDaysRecovered }} working days recovered under the fictional assumptions. Review takes the same amount of time.</p></div></div>
      </section>

      <section class="case-changes" aria-labelledby="case-changes-heading">
        <h2 id="case-changes-heading">Two changes explain the difference.</h2>
        <div class="case-change-list">
          <article><span class="case-change-number">01</span><div><h3>Verify training evidence before submitting.</h3><p>Alex’s certificates do not establish the required HS-02 component. Resolving it in the initial preparation window avoids three working days of screening and four of correction and resubmission.</p><span class="case-change-gain">7 working days recovered</span></div></article>
          <article><span class="case-change-number">02</span><div><h3>Prepare the empty workspace during review.</h3><p>The fictional computing policy permits setup and practice with fabricated data before clearance. Those three days overlap review; actual study-data access still waits for release checks.</p><span class="case-change-gain">3 working days recovered</span></div></article>
        </div>
      </section>

      <section class="case-explore" aria-labelledby="case-explore-heading">
        <h2 id="case-explore-heading">Explore the workspace.</h2>
        <p>Try the sample document checks, adjust the onboarding timeline, or ask a scenario question.</p>
        <div class="case-actions">
          <button class="case-button case-primary" type="button" @click="emit('navigate', 'preflight')"><AppIcon name="document-check" :size="17" />Review sample documents<AppIcon name="arrow-right" :size="16" /></button>
          <button class="case-button" type="button" @click="emit('navigate', 'timeline')"><AppIcon name="timeline" :size="17" />Explore the timeline</button>
          <button class="case-button" type="button" @click="emit('navigate', 'simulations')"><AppIcon name="chat" :size="17" />Try a demo simulation</button>
        </div>
        <p class="case-tool-note">The timeline tool starts with the prepared path and adds setup checks and a final handoff after access is ready.</p>
      </section>

      <footer class="case-assumptions"><AppIcon name="info" :size="17" /><p>This is an invented case, with illustrative requirements, durations, and outcomes. Working days are Monday–Friday, with no holiday closures. Dates mark task boundaries; the comparison measures readiness for the assigned task, not an actual approval or a measured product result.</p></footer>
    </div>
  </main>
</template>

<style scoped>
.case-page { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: var(--ui-canvas); color: var(--ui-text); font-size: .875rem; line-height: 1.6; }
.case-content { max-width: 1220px; margin: 0 auto; padding: 36px clamp(16px, 3vw, 40px) 32px; }
.case-eyebrow { margin: 0 0 10px; color: var(--ui-accent); font-size: .75rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 0; font-family: var(--font-display); font-size: clamp(2.25rem, 3.5vw, 3.5rem); font-weight: 400; letter-spacing: -.045em; line-height: 1.12; }
h1:focus { outline: none; }
.case-intro { max-width: 660px; margin: 18px 0 28px; color: var(--ui-muted); font-size: .9375rem; }
.case-profile { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; border-block: 1px solid var(--ui-border); padding: 17px 0; }
.case-avatar { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--ui-border); border-radius: 50%; background: var(--ui-selected); color: var(--ui-accent); font-family: var(--font-display); font-size: 1.5rem; }
.case-profile strong { font-weight: 600; }
.case-profile p { margin: 2px 0 0; color: var(--ui-muted); font-size: .8125rem; }
.case-profile-dates { display: flex; align-items: center; gap: 8px; margin-left: auto; color: var(--ui-muted); font-size: .8125rem; }
.case-profile-dates svg { color: var(--ui-accent); }
.case-goal { margin: 15px 0 32px; color: var(--ui-muted); }
.case-goal strong { margin-right: 10px; color: var(--ui-text); font-weight: 600; }
h2 { margin: 0 0 8px; font-family: var(--font-display); font-size: clamp(1.5rem, 2.4vw, 2rem); font-weight: 400; letter-spacing: -.025em; line-height: 1.25; }
.case-section-heading > p { margin: 0 0 20px; color: var(--ui-muted); }
.case-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.case-plan { display: flex; flex-direction: column; border: 1px solid var(--ui-border); border-top: 3px solid var(--ui-control-border); border-radius: 4px; padding: 22px 24px 18px; background: var(--ui-surface); }
.case-plan.prepared { border-top-color: var(--ui-accent); }
.case-plan-heading { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.case-plan-heading h3 { margin: 0; font-size: .875rem; font-weight: 650; }
.case-plan-heading > span { color: var(--ui-muted); font-family: var(--font-data); font-size: .6875rem; }
.case-ready-date { display: flex; flex-direction: column; margin: 22px 0 8px; }
.case-ready-date > span { color: var(--ui-muted); font-size: .75rem; }
.case-ready-date > time { font-family: var(--font-display); font-size: 2.75rem; line-height: 1.2; letter-spacing: -.035em; }
.prepared .case-ready-date > time { color: var(--ui-accent); }
.case-plan-summary { min-height: 44px; margin: 12px 0 20px; color: var(--ui-muted); font-size: .8125rem; line-height: 1.6; }
.case-stages { flex: 1; list-style: none; margin: 0 0 10px; padding: 0; }
.case-stages > li { padding: 12px 0; border-top: 1px solid var(--ui-border); }
.case-stage-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 7px; }
.case-stage-heading > strong { font-size: .75rem; font-weight: 550; }
.case-duration { margin-left: auto; color: var(--ui-muted); font-family: var(--font-data); font-size: .6875rem; }
.case-parallel-label { color: var(--ui-accent); font-size: .625rem; font-weight: 600; }
.case-stage-dates { color: var(--ui-muted); font-size: .6875rem; margin: 3px 0 8px; }
.case-stage-track { position: relative; height: 6px; background: var(--ui-surface-alt); border-radius: 2px; }
.case-stage-track > span { display: block; position: absolute; top: 0; height: 100%; border-radius: 2px; background: var(--ui-selected); border: 1px solid var(--ui-control-border); }
.case-review-stage .case-stage-track > span { border-color: var(--ui-accent); background: var(--ui-accent); }
.case-review-stage .case-stage-heading > strong { color: var(--ui-accent); font-weight: 650; }
.case-time-remaining { border-top: 1px solid var(--ui-border); padding-top: 16px; margin: 0; color: var(--ui-muted); font-size: .8125rem; }
.case-time-remaining > strong { color: var(--ui-text); font-weight: 600; }
.case-result { display: flex; align-items: center; gap: 14px; padding: 18px 24px; margin-top: 20px; border: 1px solid var(--ui-border); border-left: 3px solid var(--ui-accent); background: var(--ui-selected); }
.case-result > svg { color: var(--ui-accent); }
.case-result strong { font-size: 1rem; font-weight: 650; color: var(--ui-accent); }
.case-result p { margin: 3px 0 0; font-size: .8125rem; color: var(--ui-muted); }
.case-changes { margin-top: 36px; }
.case-change-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-top: 20px; }
.case-change-list article { display: flex; align-items: flex-start; gap: 14px; }
.case-change-number { padding-top: 3px; font-family: var(--font-data); color: var(--ui-accent); font-size: .75rem; }
.case-change-list h3 { margin: 0 0 8px; font-size: .875rem; font-weight: 600; }
.case-change-list p { margin: 0 0 12px; color: var(--ui-muted); font-size: .8125rem; }
.case-change-gain { color: var(--ui-accent); font-size: .75rem; font-weight: 600; }
.case-explore { border-top: 1px solid var(--ui-border); margin-top: 36px; padding-top: 28px; }
.case-explore > p { color: var(--ui-muted); margin: 8px 0 18px; }
.case-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.case-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 14px; border: 1px solid var(--ui-control-border); border-radius: 4px; background: var(--ui-surface); color: var(--ui-text); font-size: .8125rem; line-height: 1.5; font-weight: 550; }
.case-button:hover { background: var(--ui-hover); }
.case-button.case-primary { border-color: var(--ui-accent); background: var(--ui-accent); color: var(--ui-on-accent); }
.case-button.case-primary:hover { filter: brightness(.94); }
.case-explore .case-tool-note { font-size: .75rem; margin-bottom: 0; }
.case-assumptions { display: flex; align-items: flex-start; gap: 10px; border-top: 1px solid var(--ui-border); padding-top: 18px; margin-top: 28px; color: var(--ui-muted); font-size: .75rem; }
.case-assumptions svg { margin-top: 2px; }
.case-assumptions p { margin: 0; }
@media (max-width: 1100px) { .case-profile-dates { margin-left: 54px; flex-basis: 100%; } .case-plans { gap: 16px; } .case-plan { padding: 20px 16px 16px; } .case-change-list { gap: 20px; } }
@media (max-width: 740px) { .case-content { padding-top: 28px; } .case-title-break { display: none; } .case-plans, .case-change-list { grid-template-columns: minmax(0, 1fr); } .case-plan-summary { min-height: 0; } .case-profile-dates { margin-left: 0; } .case-result { padding: 16px; align-items: flex-start; } .case-result > svg { margin-top: 2px; } .case-actions { flex-direction: column; } .case-button { width: 100%; } }
</style>
