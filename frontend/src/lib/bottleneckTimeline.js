export const START_DATE = "2026-10-05";
export const PROJECT_DEADLINE = 15;

// Fictional REST-101 onboarding plan. Durations are working days, with no
// institutional review rules or holiday calendar implied by these assumptions.
export const TIMELINE_TASKS = Object.freeze(
  [
    {
      id: "packet",
      title: "Prepare onboarding packet",
      owner: "Researcher",
      initials: "RE",
      description:
        "Gather the study summary, training records, and access request into one complete packet.",
      duration: 2,
      dependencies: [],
    },
    {
      id: "review",
      title: "Review study paperwork",
      owner: "Study coordinator",
      initials: "SC",
      description:
        "Review the submitted packet and resolve any missing information before clearance.",
      duration: 5,
      dependencies: ["packet"],
    },
    {
      id: "clearance",
      title: "Confirm research clearance",
      owner: "Research office",
      initials: "RO",
      description:
        "Record the required clearance after the paperwork review is complete.",
      duration: 2,
      dependencies: ["review"],
    },
    {
      id: "environment",
      title: "Prepare research environment",
      owner: "Researcher",
      initials: "RE",
      description:
        "Prepare the analysis workspace using sample data while the submitted packet is reviewed.",
      duration: 3,
      dependencies: ["packet"],
    },
    {
      id: "workspace-access",
      title: "Activate workspace access",
      owner: "IT administrator",
      initials: "IT",
      description:
        "Activate workspace access once research clearance and environment preparation are complete.",
      duration: 1,
      dependencies: ["clearance", "environment"],
    },
    {
      id: "quality-checks",
      title: "Run setup quality checks",
      owner: "Researcher",
      initials: "RE",
      description:
        "Verify the approved workspace, permissions, and research tools before the project handoff.",
      duration: 2,
      dependencies: ["workspace-access"],
    },
    {
      id: "handoff",
      title: "Complete project handoff",
      owner: "Principal investigator",
      initials: "PI",
      description:
        "Review the prepared workspace and complete the onboarding handoff.",
      duration: 1,
      dependencies: ["quality-checks"],
    },
  ].map((task) =>
    Object.freeze({ ...task, dependencies: Object.freeze(task.dependencies) }),
  ),
);

function normalizeDelay(value) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(15, Math.trunc(value)))
    : 0;
}

function schedule(delays) {
  const byId = new Map();
  for (const task of TIMELINE_TASKS) {
    const delay = normalizeDelay(delays?.[task.id]);
    const start = Math.max(
      0,
      ...task.dependencies.map((id) => byId.get(id).end),
    );
    byId.set(task.id, { start, end: start + task.duration + delay, delay });
  }
  return byId;
}

/**
 * Recalculate a dependency graph with additional duration on selected tasks.
 * All offsets are zero-based working-day boundaries; a two-day task occupies
 * [0, 2). Slack is relative to the calculated finish, not the target deadline.
 */
export function calculateTimeline(delays = {}) {
  const baseline = schedule({});
  const current = schedule(delays);
  const finish = Math.max(...Array.from(current.values(), (task) => task.end));
  const baselineFinish = Math.max(
    ...Array.from(baseline.values(), (task) => task.end),
  );
  const successors = new Map(TIMELINE_TASKS.map((task) => [task.id, []]));
  for (const task of TIMELINE_TASKS) {
    for (const dependency of task.dependencies)
      successors.get(dependency).push(task.id);
  }

  // A backwards CPM pass identifies the tasks that determine this scenario's
  // finish. Delaying the parallel environment branch can change that path.
  const latestStarts = new Map();
  for (const task of [...TIMELINE_TASKS].reverse()) {
    const next = successors.get(task.id);
    const latestEnd = next.length
      ? Math.min(...next.map((id) => latestStarts.get(id)))
      : finish;
    latestStarts.set(
      task.id,
      latestEnd - task.duration - current.get(task.id).delay,
    );
  }

  const tasks = TIMELINE_TASKS.map((task) => {
    const descendantSet = new Set();
    const pending = [...successors.get(task.id)];
    while (pending.length) {
      const id = pending.pop();
      if (descendantSet.has(id)) continue;
      descendantSet.add(id);
      pending.push(...successors.get(id));
    }
    const { start, end, delay } = current.get(task.id);
    const { start: baselineStart, end: baselineEnd } = baseline.get(task.id);
    const slack = latestStarts.get(task.id) - start;
    return {
      ...task,
      dependencies: [...task.dependencies],
      start,
      end,
      baselineStart,
      baselineEnd,
      delay,
      shift: end - baselineEnd,
      affected: start !== baselineStart || end !== baselineEnd,
      critical: slack === 0,
      slack,
      descendantIds: TIMELINE_TASKS.filter((item) =>
        descendantSet.has(item.id),
      ).map((item) => item.id),
    };
  });

  return {
    tasks,
    finish,
    baselineFinish,
    shift: finish - baselineFinish,
    affectedCount: tasks.filter((task) => task.affected).length,
    deadlineBuffer: PROJECT_DEADLINE - finish,
    readyDay: current.get("workspace-access").end,
  };
}

/** Add weekday offsets without local time-zone or daylight-saving conversion. */
export function addWorkingDays(startDate, offset) {
  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
    throw new TypeError("Expected a YYYY-MM-DD start date");
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== startDate
  )
    throw new RangeError("Invalid start date");
  if (!Number.isSafeInteger(offset))
    throw new TypeError("Expected an integer working-day offset");

  const direction = offset < 0 ? -1 : 1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}
