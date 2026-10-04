import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../src/lib/sampleCases.js";
import {
  analyzeDocuments,
  calculateReadiness,
  validateProject,
  reconcileProject,
  confirmRequirement,
  addWorkingDays,
  formatDate,
} from "../src/lib/readiness.js";

function withEvidence(project, code, claimedState = "received") {
  project.documents.push({
    id: `evidence-${code}`,
    name: `${code} record.txt`,
    kind: "evidence",
    text: `Evidence | code=${code} | state=${claimedState} | title=Human supplied ${code} record`,
  });
  return reconcileProject(project);
}
const scenario = (project, id = "parallel") =>
  project.scenarios.find((item) => item.id === id);

test("REST computes source-defined sequential and policy-prepared dates", () => {
  const project = createProject("rest");
  const baseline = calculateReadiness(project),
    prepared = calculateReadiness(project, scenario(project));
  assert.equal(baseline.totalWorkingDays, 20);
  assert.equal(baseline.finishDate, "2026-11-02");
  assert.equal(prepared.totalWorkingDays, 10);
  assert.equal(prepared.finishDate, "2026-10-19");
  assert.equal(prepared.comparison.daysSaved, 10);
  assert.equal(prepared.targetVarianceDays, 0);
  assert.equal(baseline.targetVarianceDays, 10);
  assert.deepEqual(
    prepared.tasks.filter((task) => task.available).map((task) => task.id),
    ["complete-training", "prepare-site", "prepare-it"],
  );
  assert.equal(
    prepared.actions.find((action) => action.taskId === "activate-access")
      .state,
    "blocked",
  );
  assert.ok(
    prepared.policyOptions[0].sourceRefs[0].quote.includes(
      "parallel=prepare-site,prepare-it",
    ),
  );
});

test("second case changes requirements, existing evidence, timing, and critical path", () => {
  const project = createProject("aurora"),
    baseline = calculateReadiness(project),
    prepared = calculateReadiness(project, scenario(project));
  assert.equal(baseline.totalWorkingDays, 18);
  assert.equal(prepared.totalWorkingDays, 13);
  assert.equal(prepared.comparison.daysSaved, 5);
  assert.equal(
    prepared.tasks.find((task) => task.id === "verify-appointment").completed,
    true,
  );
  assert.equal(
    prepared.tasks.find((task) => task.id === "prepare-manifest").slack,
    3,
  );
  assert.ok(prepared.criticalPath.includes("shipping-course"));
  assert.ok(!prepared.criticalPath.includes("prepare-manifest"));
  assert.equal(
    prepared.requirements.find((req) => req.id === "shipping").effectiveStatus,
    "missing",
  );
});

test("editing task source changes calculation; outputs are not fixed to sample totals", () => {
  let project = createProject("rest");
  project.documents.find((doc) => doc.id === "rest-workflow").text =
    project.documents
      .find((doc) => doc.id === "rest-workflow")
      .text.replace("days=4", "days=7");
  project = reconcileProject(project);
  assert.equal(calculateReadiness(project).totalWorkingDays, 23);
  assert.equal(
    calculateReadiness(project, scenario(project)).totalWorkingDays,
    13,
  );
});

test("different certificates do not satisfy required course and every citation is exact", () => {
  const project = createProject("rest"),
    extracted = analyzeDocuments(project.documents);
  assert.equal(
    extracted.requirements.find((req) => req.id === "rest-course").status,
    "missing",
  );
  const scope = extracted.findings.find(
    (item) => item.id === "scope-rest-course",
  );
  assert.match(scope.detail, /REST-101-TRAINING/);
  assert.match(scope.detail, /GCP-GENERAL/);
  assert.match(scope.detail, /another course certificate does not satisfy/);
  for (const record of [
    ...extracted.requirements,
    ...extracted.tasks,
    ...extracted.policies,
    ...extracted.findings,
  ]) {
    for (const ref of record.sourceRefs)
      assert.equal(
        project.documents
          .find((doc) => doc.id === ref.documentId)
          .text.split("\n")
          [ref.line - 1].trim(),
        ref.quote,
      );
  }
});

test("received certificate never verifies training, approves duties, or activates access", () => {
  let project = withEvidence(
    createProject("rest"),
    "REST-101-TRAINING",
    "active",
  );
  project = withEvidence(project, "REST-PI-AUTHORIZATION", "approved");
  project = withEvidence(project, "REST-SYSTEM-ACCESS", "active");
  const result = calculateReadiness(project);
  for (const id of ["rest-course", "authorization", "system-access"]) {
    const req = result.requirements.find((item) => item.id === id);
    assert.equal(req.effectiveStatus, "received");
    assert.equal(req.satisfied, false);
  }
  assert.equal(
    result.tasks.find((task) => task.id === "complete-training").completed,
    true,
  );
  assert.equal(
    result.tasks.find((task) => task.id === "verify-training").completed,
    false,
  );
  assert.equal(
    result.tasks.find((task) => task.id === "activate-access").completed,
    false,
  );
  assert.ok(
    result.findings.some(
      (item) => item.title === "Evidence awaits human confirmation",
    ),
  );
});

test("human confirmation requires matching evidence and a reviewer note", () => {
  let project = createProject("rest");
  assert.throws(
    () => confirmRequirement(project, "rest-course", "verified", "Checked"),
    /Attach evidence/,
  );
  project = withEvidence(project, "REST-101-TRAINING");
  assert.throws(
    () => confirmRequirement(project, "rest-course", "verified"),
    /reviewer note/,
  );
  const confirmed = confirmRequirement(
    project,
    "rest-course",
    "verified",
    "Checked the course name and study-specific syllabus.",
  );
  assert.equal(
    calculateReadiness(confirmed).requirements.find(
      (req) => req.id === "rest-course",
    ).satisfied,
    true,
  );
  assert.equal(
    project.requirements.find((req) => req.id === "rest-course").status,
    "received",
  );
  assert.equal(confirmed.audit.at(-1).status, "verified");
  assert.equal(
    calculateReadiness(confirmed).requirements.find(
      (req) => req.id === "authorization",
    ).satisfied,
    false,
  );
});

test("editing or removing evidence revokes confirmation, including without explicit reconciliation", () => {
  let project = withEvidence(createProject("rest"), "REST-101-TRAINING");
  project = confirmRequirement(
    project,
    "rest-course",
    "verified",
    "Checked the course scope.",
  );
  project.documents.find(
    (doc) => doc.id === "evidence-REST-101-TRAINING",
  ).text += "\nCorrection: identity needs review.";
  assert.equal(
    calculateReadiness(project).requirements.find(
      (req) => req.id === "rest-course",
    ).effectiveStatus,
    "received",
  );
  project = reconcileProject(project);
  assert.equal(
    project.requirements.find((req) => req.id === "rest-course")
      .confirmationInvalidated,
    true,
  );
  assert.equal(
    project.requirements.find((req) => req.id === "rest-course").status,
    "received",
  );
  assert.equal(
    project.requirements.find((req) => req.id === "gcp").status,
    "verified",
  );
  project.documents = project.documents.filter(
    (doc) => doc.id !== "evidence-REST-101-TRAINING",
  );
  assert.equal(
    calculateReadiness(project).requirements.find(
      (req) => req.id === "rest-course",
    ).effectiveStatus,
    "missing",
  );
});

test("source requirement changes invalidate confirmations and source owner propagates unless overridden", () => {
  let project = createProject("rest");
  project.documents[0].text = project.documents[0].text.replace(
    "owner=Alex Chen",
    "owner=New coordinator",
  );
  project = reconcileProject(project);
  assert.equal(
    project.requirements.find((req) => req.id === "gcp").owner,
    "New coordinator",
  );
  assert.equal(
    project.requirements.find((req) => req.id === "gcp").status,
    "received",
  );
  project.requirements.find((req) => req.id === "gcp").owner = "Manual owner";
  project.documents[0].text = project.documents[0].text.replace(
    "owner=New coordinator",
    "owner=Other coordinator",
  );
  project = reconcileProject(project);
  assert.equal(
    project.requirements.find((req) => req.id === "gcp").owner,
    "Manual owner",
  );
});

test("scenario assumption shortens projections without changing actual states or action gates", () => {
  const project = createProject("rest"),
    before = JSON.stringify(project);
  const assumed = {
    ...scenario(project, "baseline"),
    id: "what-if",
    assumedRequirementIds: ["rest-course"],
  };
  const result = calculateReadiness(project, assumed);
  assert.equal(result.totalWorkingDays, 15);
  assert.equal(
    result.requirements.find((req) => req.id === "rest-course").effectiveStatus,
    "missing",
  );
  assert.equal(
    result.requirements.find((req) => req.id === "rest-course").assumed,
    true,
  );
  assert.equal(
    result.tasks.find((task) => task.id === "verify-training")
      .projectedCompleted,
    true,
  );
  assert.equal(
    result.tasks.find((task) => task.id === "verify-training").completed,
    false,
  );
  assert.equal(
    result.actions.find((action) => action.taskId === "prepare-site").state,
    "blocked",
  );
  assert.equal(JSON.stringify(project), before);
});

test("forked scenarios compare independently and negative/unknown delays do not fabricate time savings", () => {
  const project = createProject("rest");
  const fork = {
    ...structuredClone(scenario(project)),
    id: "slow-it",
    taskDelays: { "prepare-it": 3 },
  };
  assert.equal(calculateReadiness(project, fork).totalWorkingDays, 13);
  assert.equal(
    calculateReadiness(project, scenario(project)).totalWorkingDays,
    10,
  );
  const invalid = calculateReadiness(project, {
    ...fork,
    taskDelays: { "prepare-it": -99, absent: 4 },
  });
  assert.equal(invalid.totalWorkingDays, 10);
  assert.ok(
    invalid.findings.some((item) => item.title === "Invalid delay ignored"),
  );
  assert.ok(
    invalid.findings.some(
      (item) => item.title === "Unknown delayed task ignored",
    ),
  );
});

test("unsupported dependency changes cannot bypass verification or approval gates", () => {
  const project = createProject("rest");
  const unsafe = {
    ...scenario(project),
    dependencyOverrides: {
      ...scenario(project).dependencyOverrides,
      "approve-role": [],
      "activate-access": [],
    },
  };
  const result = calculateReadiness(project, unsafe);
  assert.equal(result.totalWorkingDays, 10);
  assert.equal(
    result.tasks.find((task) => task.id === "activate-access").available,
    false,
  );
  assert.equal(
    result.findings.filter(
      (item) => item.title === "Unsupported dependency change ignored",
    ).length,
    2,
  );
  project.documents.find((doc) => doc.id === "rest-policy").text +=
    "\nPolicy is under revision.";
  // The policy line itself is still current; non-record notes do not alter the stated allowed preparation.
  assert.equal(
    calculateReadiness(project, scenario(project)).totalWorkingDays,
    10,
  );
  project.documents.find((doc) => doc.id === "rest-policy").text =
    "Policy withdrawn.";
  assert.equal(calculateReadiness(project, scenario(project)).valid, false);
  assert.equal(
    calculateReadiness(project, scenario(project)).totalWorkingDays,
    null,
  );
});

test("parallel preparation gives zero benefit when an independent gate dominates", () => {
  let project = createProject("rest");
  project.documents[0].text +=
    "\nRequirement | id=clearance | title=External study clearance | code=STUDY-CLEARANCE | kind=approval | owner=Sponsor | state=approved";
  const workflow = project.documents.find((doc) => doc.id === "rest-workflow");
  workflow.text +=
    "\nTask | id=external-clearance | title=Obtain external clearance | owner=Sponsor | days=30 | after= | requires=clearance | completes=clearance | state=approved";
  workflow.text = workflow.text.replace(
    "after=approve-role | requires=system-access",
    "after=approve-role,external-clearance | requires=system-access",
  );
  project = reconcileProject(project);
  const baseline = calculateReadiness(project),
    prepared = calculateReadiness(project, scenario(project));
  assert.equal(baseline.totalWorkingDays, 33);
  assert.equal(prepared.totalWorkingDays, 33);
  assert.equal(prepared.comparison.daysSaved, 0);
  assert.ok(prepared.criticalPath.includes("external-clearance"));
  assert.ok(!prepared.criticalPath.includes("prepare-it"));
});

test("a fresh packet works without sample identifiers; unrecognized prose remains visible", () => {
  let project = createProject("empty");
  project.startDate = "2026-10-09";
  project.documents = [
    {
      id: "new-packet",
      name: "Unfamiliar study.md",
      kind: "packet",
      text: "Requirement | id=privacy | title=Privacy induction | code=PRIV-77 | owner=Sam | kind=training | state=verified\nTask | id=learn | title=Read and certify privacy induction | owner=Sam | days=2 | after= | requires=privacy | completes=privacy | state=verified\nBudget and staffing still require a discussion.",
    },
  ];
  project = reconcileProject(project);
  const result = calculateReadiness(project);
  assert.equal(result.totalWorkingDays, 2);
  assert.equal(result.finishDate, "2026-10-13");
  assert.equal(
    result.findings.find(
      (item) => item.title === "Passages require human interpretation",
    ).sourceRefs[0].line,
    3,
  );
  const natural = analyzeDocuments([
    {
      id: "natural",
      name: "Policy",
      text: "Sam must complete PRIV-88 training before accessing study data.",
    },
  ]);
  assert.equal(natural.requirements[0].code, "PRIV-88");
  assert.equal(natural.tasks.length, 0);
  assert.ok(natural.findings.some((item) => /needs review/.test(item.title)));
});

test("unknown arbitrary packets and zero-source projects do not display ready or invent durations", () => {
  const empty = calculateReadiness(createProject("empty"));
  assert.equal(empty.totalWorkingDays, null);
  assert.equal(empty.finishDate, null);
  assert.ok(empty.findings.some((item) => item.id === "no-plan"));
  assert.ok(empty.roleReviews.every((review) => review.status === "attention"));
  let project = createProject("empty");
  project.documents = [
    {
      id: "notes",
      name: "Meeting notes",
      kind: "packet",
      text: "We should discuss trial responsibilities next week.",
    },
  ];
  project = reconcileProject(project);
  const result = calculateReadiness(project);
  assert.equal(result.totalWorkingDays, null);
  assert.ok(
    result.findings.some(
      (item) => item.title === "Passages require human interpretation",
    ),
  );
});

test("missing tasks suppress overall readiness estimate even when other tasks are schedulable", () => {
  let project = createProject("rest");
  project.documents[0].text +=
    "\nRequirement | id=new-check | title=Additional hospital permission | code=HOSPITAL-NEW | kind=approval | owner=Site | state=approved";
  project = reconcileProject(project);
  const result = calculateReadiness(project);
  assert.equal(result.totalWorkingDays, null);
  assert.equal(result.finishDate, null);
  assert.ok(result.tasks.length > 0);
  assert.ok(
    result.findings.some((item) => item.id === "unscheduled-new-check"),
  );
});

test("cycles and missing dependencies fail visibly while editable drafts remain structurally valid", () => {
  const project = createProject("rest");
  project.tasks[0].dependsOn = ["activate-access"];
  assert.equal(validateProject(project).valid, false);
  assert.equal(validateProject(project, { structuralOnly: true }).valid, true);
  assert.match(calculateReadiness(project).errors.join(" "), /cycle/);
  assert.equal(calculateReadiness(project).finishDate, null);
  project.tasks[0].dependsOn = ["does-not-exist"];
  assert.match(
    calculateReadiness(project).errors.join(" "),
    /Unknown task dependency/,
  );
  project.tasks[0].dependsOn = [];
  project.tasks[0].duration = -5;
  assert.equal(validateProject(project).valid, false);
  assert.equal(validateProject(project, { structuralOnly: true }).valid, true);
});

test("malformed extraction records cannot silently produce a valid readiness date", () => {
  let project = createProject("rest");
  project.documents[0].text +=
    "\nRequirement | id=invalid | title=Unclear approval | state=active";
  project = reconcileProject(project);
  const result = calculateReadiness(project);
  assert.equal(result.valid, false);
  assert.equal(result.totalWorkingDays, null);
  assert.ok(result.errors.some((message) => /code/.test(message)));
});

test("calendar uses UTC Monday-Friday arithmetic across weekends and rejects impossible dates", () => {
  assert.equal(addWorkingDays("2026-10-09", 1), "2026-10-12");
  assert.equal(addWorkingDays("2026-10-10", 0), "2026-10-12");
  assert.equal(addWorkingDays("2026-10-12", -1), "2026-10-09");
  assert.equal(addWorkingDays("2026-02-30", 2), null);
  assert.equal(addWorkingDays("2026-10-05", 1.5), null);
  assert.equal(formatDate(""), "Not estimated");
  assert.match(formatDate("2026-10-19"), /Oct 19, 2026/);
});

test("tampered state without matching human confirmation does not establish readiness", () => {
  const project = createProject("rest");
  for (const req of project.requirements) req.status = "active";
  const result = calculateReadiness(project);
  assert.equal(
    result.requirements.find((req) => req.id === "system-access")
      .effectiveStatus,
    "missing",
  );
  assert.equal(
    result.tasks.find((task) => task.id === "activate-access").completed,
    false,
  );
  assert.ok(
    result.findings.some(
      (item) => item.title === "Human confirmation needs review",
    ),
  );
});

test("forged cached task timings and preparation policy cannot bypass source gates", () => {
  const project = createProject("rest");
  project.tasks.find((task) => task.id === "approve-role").preparation = true;
  project.policies[0].allowedOverrides["approve-role"] = [];
  const altered = {
    ...scenario(project),
    dependencyOverrides: {
      ...scenario(project).dependencyOverrides,
      "approve-role": [],
    },
  };
  const result = calculateReadiness(project, altered);
  assert.equal(result.valid, false);
  assert.equal(result.finishDate, null);
  assert.deepEqual(result.actions, []);
  assert.match(result.errors.join(" "), /differ from the current source/);
  const timings = createProject("rest");
  timings.tasks[0].duration = 0;
  assert.equal(calculateReadiness(timings).valid, false);
  assert.equal(validateProject(timings, { structuralOnly: true }).valid, true);
});

test("all malformed nested import fields fail validation without throwing", () => {
  const mutations = [
    (p) => {
      p.requirements[0].evidenceRefs = {};
    },
    (p) => {
      p.requirements[0].sourceRefs = [null];
    },
    (p) => {
      p.tasks[0].sourceRefs[0].line = 0;
    },
    (p) => {
      p.tasks[0].dependsOn = [null];
    },
    (p) => {
      p.policies[0] = null;
    },
    (p) => {
      p.policies[0].allowedOverrides = { a: null };
    },
    (p) => {
      p.scenarios[0].name = null;
    },
    (p) => {
      p.scenarios[0].assumedRequirementIds = [null];
    },
    (p) => {
      p.scenarios[0].taskDelays = { a: Infinity };
    },
    (p) => {
      p.person.name = {};
    },
    (p) => {
      p.requirements[0].owner = [];
    },
  ];
  for (const mutate of mutations) {
    const project = createProject("rest");
    mutate(project);
    assert.equal(validateProject(project).valid, false);
    assert.equal(
      validateProject(project, { structuralOnly: true }).valid,
      false,
    );
  }
});

test("large valid schedules use bounded calendar arithmetic", () => {
  let project = createProject("empty");
  project.startDate = "2026-10-05";
  project.documents = [
    {
      id: "large",
      name: "Long schedule",
      kind: "packet",
      text:
        "Requirement | id=r | title=Long prerequisite | code=R | state=verified\n" +
        Array.from(
          { length: 50 },
          (_, i) =>
            `Task | id=t${i} | title=Stage ${i} | days=3650 | after=${i ? `t${i - 1}` : ""} | requires=r | completes=r | state=verified`,
        ).join("\n"),
    },
  ];
  project = reconcileProject(project);
  const started = performance.now(),
    result = calculateReadiness(project),
    elapsed = performance.now() - started;
  assert.equal(result.totalWorkingDays, 182500);
  assert.equal(result.finishDate, "2726-04-19");
  assert.ok(
    elapsed < 1500,
    `Expected bounded date calculation; took ${elapsed.toFixed(0)}ms`,
  );
});
