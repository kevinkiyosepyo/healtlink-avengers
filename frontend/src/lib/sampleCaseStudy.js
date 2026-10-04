import { addWorkingDays } from './bottleneckTimeline.js';

// The two paths follow the fictional schedule in
// Trial-Researcher-Onboarding-Case-Study.md, sections 5, 8, and 9.
// This fixture is separate from the workspace's editable handoff timeline.
export const SAMPLE_CASE_START = '2026-10-05';
export const SAMPLE_CASE_ROTATION_END = '2026-11-16';

const freezeTasks = tasks => Object.freeze(tasks.map(task => Object.freeze({
  ...task,
  dependencies: Object.freeze(task.dependencies),
})));

export const SAMPLE_CASE_PLANS = Object.freeze({
  original: freezeTasks([
    { id: 'packet', title: 'Prepare the packet', duration: 2, dependencies: [] },
    { id: 'screening', title: 'Incomplete-packet screening', duration: 3, dependencies: ['packet'] },
    { id: 'correction', title: 'Correct and resubmit', duration: 4, dependencies: ['screening'] },
    { id: 'review', title: 'Complete-packet review', duration: 5, dependencies: ['correction'] },
    { id: 'release', title: 'Local release checks', duration: 2, dependencies: ['review'] },
    { id: 'environment', title: 'Prepare the empty workspace', duration: 3, dependencies: ['release'] },
    { id: 'activation', title: 'Activate and test access', duration: 1, dependencies: ['release', 'environment'] },
  ]),
  prepared: freezeTasks([
    { id: 'packet', title: 'Verify and prepare the packet', duration: 2, dependencies: [] },
    { id: 'review', title: 'Complete-packet review', duration: 5, dependencies: ['packet'] },
    { id: 'environment', title: 'Prepare the empty workspace', duration: 3, dependencies: ['packet'], parallel: true },
    { id: 'release', title: 'Local release checks', duration: 2, dependencies: ['review'] },
    { id: 'activation', title: 'Activate and test access', duration: 1, dependencies: ['release', 'environment'] },
  ]),
});

function schedule(tasks) {
  const scheduled = new Map();
  for (const task of tasks) {
    const start = Math.max(0, ...task.dependencies.map(id => scheduled.get(id).end));
    const end = start + task.duration;
    scheduled.set(task.id, {
      ...task,
      dependencies: [...task.dependencies],
      start,
      end,
      startDate: addWorkingDays(SAMPLE_CASE_START, start),
      endDate: addWorkingDays(SAMPLE_CASE_START, end),
    });
  }
  const activation = scheduled.get('activation');
  return {
    tasks: [...scheduled.values()],
    workingDays: activation.end,
    readyDate: activation.endDate,
    remainingWeeks: (30 - activation.end) / 5,
  };
}

export function getSampleCaseComparison() {
  const original = schedule(SAMPLE_CASE_PLANS.original);
  const prepared = schedule(SAMPLE_CASE_PLANS.prepared);
  const calendarDays = (Date.parse(`${original.readyDate}T00:00:00Z`)
    - Date.parse(`${prepared.readyDate}T00:00:00Z`)) / 86400000;
  return {
    original,
    prepared,
    workingDaysRecovered: original.workingDays - prepared.workingDays,
    calendarDaysRecovered: calendarDays,
  };
}
