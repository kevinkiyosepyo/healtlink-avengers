import test from 'node:test';
import assert from 'node:assert/strict';
import { getSampleCaseComparison, SAMPLE_CASE_START, SAMPLE_CASE_ROTATION_END, SAMPLE_CASE_PLANS } from '../src/lib/sampleCaseStudy.js';

const stage = (plan, id) => plan.tasks.find(task => task.id === id);

test('the case reproduces the declared readiness dates and exact two-week gain', () => {
  const result = getSampleCaseComparison();
  assert.equal(SAMPLE_CASE_START, '2026-10-05');
  assert.equal(SAMPLE_CASE_ROTATION_END, '2026-11-16');
  assert.equal(result.original.workingDays, 20);
  assert.equal(result.original.readyDate, '2026-11-02');
  assert.equal(result.prepared.workingDays, 10);
  assert.equal(result.prepared.readyDate, '2026-10-19');
  assert.equal(result.workingDaysRecovered, 10);
  assert.equal(result.calendarDaysRecovered, 14);
  assert.equal(result.original.remainingWeeks, 2);
  assert.equal(result.prepared.remainingWeeks, 4);
});

test('preparation starts together and complete-packet review has the same duration', () => {
  const { original, prepared } = getSampleCaseComparison();
  for (const plan of [original, prepared]) {
    assert.equal(stage(plan, 'packet').startDate, '2026-10-05');
    assert.equal(stage(plan, 'packet').endDate, '2026-10-07');
    assert.equal(stage(plan, 'review').duration, 5);
    assert.equal(stage(plan, 'release').duration, 2);
    assert.equal(stage(plan, 'environment').duration, 3);
    assert.equal(stage(plan, 'activation').duration, 1);
  }
  assert.equal(stage(original, 'review').startDate, '2026-10-16');
  assert.equal(stage(original, 'review').endDate, '2026-10-23');
  assert.equal(stage(prepared, 'review').startDate, '2026-10-07');
  assert.equal(stage(prepared, 'review').endDate, '2026-10-14');
});

test('the later correction cycle costs seven working days and setup overlaps only in the prepared path', () => {
  const { original, prepared } = getSampleCaseComparison();
  assert.equal(stage(original, 'screening').duration + stage(original, 'correction').duration, 7);
  assert.equal(stage(original, 'environment').startDate, '2026-10-27');
  assert.equal(stage(original, 'environment').endDate, '2026-10-30');
  assert.equal(stage(prepared, 'environment').startDate, '2026-10-07');
  assert.equal(stage(prepared, 'environment').endDate, '2026-10-12');
  assert.equal(stage(prepared, 'environment').start, stage(prepared, 'review').start);
  assert.ok(stage(prepared, 'environment').end < stage(prepared, 'review').end);
  assert.equal(prepared.tasks.some(task => task.id === 'screening' || task.id === 'correction'), false);
});

test('activation waits for release and environment completion, skipping the final weekend', () => {
  const { original, prepared } = getSampleCaseComparison();
  for (const plan of [original, prepared]) {
    const activation = stage(plan, 'activation');
    assert.equal(activation.start, Math.max(stage(plan, 'release').end, stage(plan, 'environment').end));
    for (const task of plan.tasks) {
      for (const dependency of task.dependencies) {
        assert.ok(task.start >= stage(plan, dependency).end);
      }
    }
  }
  assert.equal(stage(original, 'activation').startDate, '2026-10-30');
  assert.equal(stage(original, 'activation').endDate, '2026-11-02');
  assert.equal(stage(prepared, 'activation').startDate, '2026-10-16');
  assert.equal(stage(prepared, 'activation').endDate, '2026-10-19');
});

test('consumers cannot corrupt the case fixture or later comparisons', () => {
  const fixture = JSON.stringify(SAMPLE_CASE_PLANS);
  const result = getSampleCaseComparison();
  result.original.tasks[0].duration = 100;
  result.original.tasks[1].dependencies.push('missing');
  assert.equal(JSON.stringify(SAMPLE_CASE_PLANS), fixture);
  assert.equal(getSampleCaseComparison().original.workingDays, 20);
  assert.deepEqual(getSampleCaseComparison().original.tasks[1].dependencies, ['packet']);
});
