import test from "node:test";
import assert from "node:assert/strict";
import {
  TIMELINE_TASKS,
  START_DATE,
  PROJECT_DEADLINE,
  calculateTimeline,
  addWorkingDays,
} from "../src/lib/bottleneckTimeline.js";

const task = (timeline, id) => timeline.tasks.find((item) => item.id === id);

test("baseline respects the fork and join and reports the critical path", () => {
  const plan = calculateTimeline();
  assert.equal(plan.finish, 13);
  assert.equal(plan.baselineFinish, 13);
  assert.equal(plan.readyDay, 10);
  assert.equal(plan.shift, 0);
  assert.equal(plan.affectedCount, 0);
  assert.equal(plan.deadlineBuffer, PROJECT_DEADLINE - 13);
  assert.equal(task(plan, "environment").start, 2);
  assert.equal(task(plan, "environment").end, 5);
  assert.equal(task(plan, "environment").slack, 4);
  assert.equal(task(plan, "environment").critical, false);
  assert.equal(task(plan, "workspace-access").start, 9);
  assert.deepEqual(
    plan.tasks.filter((item) => item.critical).map((item) => item.id),
    [
      "packet",
      "review",
      "clearance",
      "workspace-access",
      "quality-checks",
      "handoff",
    ],
  );
  for (const item of plan.tasks) {
    for (const dependency of item.dependencies)
      assert.ok(item.start >= task(plan, dependency).end);
  }
});

test("a delay in the parallel branch is absorbed until its slack is exhausted", () => {
  const absorbed = calculateTimeline({ environment: 3 });
  assert.equal(task(absorbed, "environment").end, 8);
  assert.equal(task(absorbed, "environment").slack, 1);
  assert.equal(absorbed.affectedCount, 1);
  assert.equal(absorbed.finish, 13);
  assert.equal(task(absorbed, "workspace-access").affected, false);

  const tied = calculateTimeline({ environment: 4 });
  assert.equal(task(tied, "environment").critical, true);
  assert.equal(task(tied, "clearance").critical, true);
  assert.equal(tied.shift, 0);

  const exceeded = calculateTimeline({ environment: 5 });
  assert.equal(exceeded.shift, 1);
  assert.equal(exceeded.finish, 14);
  assert.equal(exceeded.readyDay, 11);
  assert.equal(task(exceeded, "environment").critical, true);
  assert.equal(task(exceeded, "review").critical, false);
  assert.equal(task(exceeded, "review").slack, 1);
  assert.equal(task(exceeded, "workspace-access").shift, 1);
  assert.equal(exceeded.affectedCount, 4);
});

test("workspace access delay shifts its descendants and reveals a missed deadline", () => {
  const plan = calculateTimeline({ "workspace-access": 5 });
  assert.equal(plan.finish, 18);
  assert.equal(plan.shift, 5);
  assert.equal(plan.readyDay, 15);
  assert.equal(plan.deadlineBuffer, -3);
  assert.equal(plan.affectedCount, 3);
  assert.equal(task(plan, "workspace-access").start, 9);
  assert.equal(task(plan, "workspace-access").end, 15);
  assert.deepEqual(task(plan, "workspace-access").descendantIds, [
    "quality-checks",
    "handoff",
  ]);
  assert.deepEqual(task(plan, "handoff").descendantIds, []);
  for (const id of ["quality-checks", "handoff"])
    assert.equal(task(plan, id).shift, 5);
  for (const id of ["packet", "review", "clearance", "environment"])
    assert.equal(task(plan, id).affected, false);
});

test("review delay propagates through clearance while parallel preparation stays put", () => {
  const plan = calculateTimeline({ review: 2 });
  assert.equal(plan.finish, 15);
  assert.equal(plan.deadlineBuffer, 0);
  assert.equal(plan.affectedCount, 5);
  assert.equal(task(plan, "clearance").start, 9);
  assert.equal(task(plan, "environment").start, 2);
  assert.equal(task(plan, "environment").end, 5);
  assert.equal(task(plan, "environment").slack, 6);
  assert.deepEqual(task(plan, "packet").descendantIds, [
    "review",
    "clearance",
    "environment",
    "workspace-access",
    "quality-checks",
    "handoff",
  ]);
});

test("combined fork delays wait for the latest prerequisite instead of adding both branches", () => {
  const plan = calculateTimeline({
    review: 2,
    environment: 5,
    "workspace-access": 1,
  });
  assert.equal(task(plan, "clearance").end, 11);
  assert.equal(task(plan, "environment").end, 10);
  assert.equal(task(plan, "workspace-access").start, 11);
  assert.equal(plan.finish, 16);
  assert.equal(plan.shift, 3);
});

test("invalid delays are safe, finite delays are bounded, and unknown tasks are ignored", () => {
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    "5",
    {},
    [],
    null,
    undefined,
  ]) {
    assert.equal(calculateTimeline({ review: value }).shift, 0);
  }
  assert.equal(calculateTimeline({ review: -2 }).shift, 0);
  assert.equal(calculateTimeline({ review: 2.9 }).shift, 2);
  assert.equal(calculateTimeline({ review: 99 }).shift, 15);
  assert.equal(calculateTimeline({ missing: 15 }).shift, 0);
  assert.equal(calculateTimeline(null).shift, 0);
});

test("calculations and consumers cannot mutate the baseline or other returned plans", () => {
  const original = JSON.stringify(TIMELINE_TASKS);
  const delays = Object.freeze({ review: 3 });
  const changed = calculateTimeline(delays);
  changed.tasks[0].title = "Changed title";
  changed.tasks[1].dependencies.push("missing");
  changed.tasks[0].descendantIds.length = 0;
  const fresh = calculateTimeline();
  assert.equal(JSON.stringify(TIMELINE_TASKS), original);
  assert.equal(fresh.finish, 13);
  assert.equal(fresh.tasks[0].title, TIMELINE_TASKS[0].title);
  assert.deepEqual(fresh.tasks[1].dependencies, ["packet"]);
  assert.equal(fresh.tasks[0].descendantIds.length, 6);
});

test("working-day offsets skip weekends and are stable across daylight-saving boundaries", () => {
  assert.equal(addWorkingDays(START_DATE, 0), "2026-10-05");
  assert.equal(addWorkingDays(START_DATE, 5), "2026-10-12");
  assert.equal(addWorkingDays(START_DATE, 13), "2026-10-22");
  assert.equal(addWorkingDays("2026-10-30", 1), "2026-11-02");
  assert.equal(addWorkingDays("2026-03-06", 1), "2026-03-09");
  assert.equal(addWorkingDays("2026-03-09", -1), "2026-03-06");
  assert.equal(
    addWorkingDays("2026-12-31", 1),
    "2027-01-01",
    "holiday closures are not assumed",
  );
  assert.throws(() => addWorkingDays("2026-02-30", 1), /Invalid start date/);
  assert.throws(() => addWorkingDays("not a date", 1), /YYYY-MM-DD/);
  assert.throws(() => addWorkingDays(START_DATE, 1.5), /integer/);
});

test("trial start-up plan: ethics review is the critical path and contract slack absorbs delays", async () => {
  const { TRIAL_STARTUP_PLAN, PLANS } = await import("../src/lib/bottleneckTimeline.js");
  assert.equal(PLANS[0], TRIAL_STARTUP_PLAN);
  const base = calculateTimeline({}, TRIAL_STARTUP_PLAN);
  assert.equal(base.finish, 17);
  assert.equal(base.deadlineBuffer, 3);
  assert.equal(base.readyDay, 15);
  assert.deepEqual(base.tasks.filter((t) => t.critical).map((t) => t.id), ["protocol", "irb", "siv", "activation", "fpi"]);
  assert.equal(task(base, "contract").slack, 2);
  const absorbed = calculateTimeline({ contract: 2 }, TRIAL_STARTUP_PLAN);
  assert.equal(absorbed.shift, 0);
  const slipped = calculateTimeline({ irb: 5 }, TRIAL_STARTUP_PLAN);
  assert.equal(slipped.shift, 5);
  assert.equal(slipped.deadlineBuffer, -2);
  assert.deepEqual(task(slipped, "irb").descendantIds, ["siv", "activation", "fpi"]);
});
