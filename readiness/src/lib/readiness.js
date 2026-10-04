/** Deterministic, local planning engine. No model calls or clinical judgments. */
export const STATES = ["missing", "received", "verified", "approved", "active"];
const rank = (state) => STATES.indexOf(state);
const list = (value = "") =>
  String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const clone = (value) => JSON.parse(JSON.stringify(value));
const finding = (id, severity, title, detail, sourceRefs = []) => ({
  id,
  severity,
  title,
  detail,
  sourceRefs,
});
const isoValid = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const isWeekday = (date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6;

/** Offset counts working-day boundaries; Monday + 5 => following Monday. */
export function addWorkingDays(startDate, offset) {
  if (
    !isoValid(startDate) ||
    !Number.isSafeInteger(offset) ||
    Math.abs(offset) > 100000000
  )
    return null;
  const date = new Date(`${startDate}T12:00:00Z`);
  while (!isWeekday(date)) date.setUTCDate(date.getUTCDate() + 1);
  const direction = offset < 0 ? -1 : 1;
  const wholeWeeks = Math.floor(Math.abs(offset) / 5);
  date.setUTCDate(date.getUTCDate() + direction * wholeWeeks * 7);
  for (let remaining = Math.abs(offset) % 5; remaining > 0; ) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (isWeekday(date)) remaining--;
  }
  return Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() > 9999 ||
    date.getUTCFullYear() < 1
    ? null
    : date.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  return isoValid(iso)
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${iso}T12:00:00Z`))
    : "Not estimated";
}
function workingDistance(a, b) {
  if (!isoValid(a) || !isoValid(b)) return null;
  const date = new Date(`${a}T12:00:00Z`),
    end = new Date(`${b}T12:00:00Z`);
  const direction = date < end ? 1 : -1;
  const days = Math.round(Math.abs(end - date) / 86400000);
  let count = Math.floor(days / 7) * 5;
  date.setUTCDate(date.getUTCDate() + direction * Math.floor(days / 7) * 7);
  for (let remaining = days % 7; remaining > 0; remaining--) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (isWeekday(date)) count++;
  }
  return count === 0 ? 0 : count * direction;
}

function fingerprint(requirement, documents) {
  const relevant = [
    ...(requirement.sourceRefs || []).map((ref) => ({
      ...ref,
      evidence: false,
    })),
    ...(requirement.evidenceRefs || []).map((ref) => ({
      ...ref,
      evidence: true,
    })),
  ].map((ref) => {
    const doc = documents.find((item) => item.id === ref.documentId);
    return [
      ref.documentId,
      ref.line,
      ref.quote,
      doc?.name,
      ref.evidence
        ? (doc?.text ?? null)
        : (doc?.text?.split(/\r?\n/)[ref.line - 1] ?? null),
    ];
  });
  const text = JSON.stringify([
    requirement.id,
    requirement.code,
    requirement.requiredState,
    requirement.status,
    requirement.reviewerNote || "",
    relevant,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `source-v1-${(hash >>> 0).toString(16)}`;
}
function referenceLive(ref, documents) {
  const doc = documents.find((item) => item.id === ref.documentId);
  return (
    !!doc &&
    Number.isInteger(ref.line) &&
    ref.line >= 1 &&
    doc.text.split(/\r?\n/)[ref.line - 1]?.trim() === ref.quote?.trim()
  );
}
function parseFields(value) {
  return Object.fromEntries(
    value
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index < 0
          ? [part.toLowerCase(), ""]
          : [
              part.slice(0, index).trim().toLowerCase(),
              part.slice(index + 1).trim(),
            ];
      }),
  );
}

/** Explicit records and conservative natural-language requirements; no silent guessing. */
export function analyzeDocuments(documents = []) {
  const requirements = [],
    tasks = [],
    policies = [],
    findings = [],
    evidence = [];
  for (const doc of documents) {
    if (!doc || typeof doc.text !== "string") {
      findings.push(
        finding(
          "invalid-document",
          "error",
          "Unreadable document",
          "Every document needs text.",
        ),
      );
      continue;
    }
    const unrecognized = [];
    doc.text.split(/\r?\n/).forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return;
      const ref = { documentId: doc.id, line: index + 1, quote: line };
      const match = line.match(
        /^(Requirement|Task|Policy|Evidence)\s*(?:\||:)\s*(.+)$/i,
      );
      if (!match) {
        const natural = line.match(
          /^(.+?)\s+(?:must|is required to)\s+(?:complete|hold|have)\s+(.+?)(?:\s+before\b.*)?[.!]?$/i,
        );
        if (natural) {
          const title = natural[2].replace(/[.!]$/, ""),
            code =
              title.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/)?.[0] ||
              slug(title).toUpperCase();
          requirements.push({
            id: slug(code),
            title,
            code,
            kind: /training|course|certif/i.test(title)
              ? "training"
              : "document",
            owner: natural[1],
            requiredState: "verified",
            status: "missing",
            sourceRefs: [ref],
            evidenceRefs: [],
            notes: "",
            reviewerNote: "",
            confirmationFingerprint: null,
          });
          findings.push(
            finding(
              `natural-${doc.id}-${index}`,
              "warning",
              "Natural-language requirement needs review",
              "A requirement was recognized. Confirm its scope and add explicit Task records for timing and dependencies.",
              [ref],
            ),
          );
        } else unrecognized.push(ref);
        return;
      }
      const type = match[1].toLowerCase(),
        fields = parseFields(match[2]);
      if (
        (type !== "evidence" && !fields.id) ||
        !fields.title ||
        (["requirement", "evidence"].includes(type) && !fields.code)
      ) {
        findings.push(
          finding(
            `malformed-${doc.id}-${index}`,
            "error",
            `Incomplete ${type} record`,
            `${type} records need ${type === "evidence" ? "code and title" : type === "requirement" ? "id, code, and title" : "id and title"}.`,
            [ref],
          ),
        );
        return;
      }
      if (type === "requirement") {
        const requiredState = fields.state || "verified";
        if (!STATES.includes(requiredState) || requiredState === "missing") {
          findings.push(
            finding(
              `state-${doc.id}-${index}`,
              "error",
              "Unknown required state",
              `Use received, verified, approved, or active; found “${requiredState}”.`,
              [ref],
            ),
          );
          return;
        }
        requirements.push({
          id: fields.id,
          title: fields.title,
          code: fields.code,
          kind: fields.kind || "document",
          owner: fields.owner || "Unassigned",
          requiredState,
          status: "missing",
          sourceRefs: [ref],
          evidenceRefs: [],
          notes: fields.notes || "",
          reviewerNote: "",
          confirmationFingerprint: null,
        });
      }
      if (type === "task") {
        if (!/^\d+$/.test(fields.days || "") || Number(fields.days) > 3650) {
          findings.push(
            finding(
              `duration-${doc.id}-${index}`,
              "error",
              "Task duration needs review",
              "Use days= followed by a whole number from 0 to 3650 working days.",
              [ref],
            ),
          );
          return;
        }
        tasks.push({
          id: fields.id,
          title: fields.title,
          owner: fields.owner || "Unassigned",
          duration: Number(fields.days),
          dependsOn: list(fields.after),
          requirementIds: list(fields.requires),
          sourceRefs: [ref],
          completesRequirementId: fields.completes || null,
          completionState: fields.state || "verified",
          preparation: fields.preparation === "true",
        });
      }
      if (type === "policy")
        policies.push({
          id: fields.id,
          title: fields.title,
          description: fields.description || fields.title,
          sourceRefs: [ref],
          allowedOverrides: Object.fromEntries(
            list(fields.parallel).map((id) => [id, []]),
          ),
        });
      if (type === "evidence")
        evidence.push({
          code: fields.code,
          title: fields.title,
          claimedState: fields.state || "received",
          ref,
        });
    });
    if (unrecognized.length)
      findings.push(
        finding(
          `unrecognized-${doc.id}`,
          "info",
          "Passages require human interpretation",
          `${unrecognized.length} passage${unrecognized.length === 1 ? "" : "s"} in ${doc.name || doc.id} did not create a requirement, task, or policy. Review the original source; no timing or approval was inferred.`,
          unrecognized,
        ),
      );
  }
  for (const requirement of requirements) {
    requirement.evidenceRefs = evidence
      .filter(
        (item) => item.code.toUpperCase() === requirement.code.toUpperCase(),
      )
      .map((item) => item.ref);
    requirement.status = requirement.evidenceRefs.length
      ? "received"
      : "missing";
    if (
      !requirement.evidenceRefs.length &&
      requirement.kind === "training" &&
      evidence.length
    )
      findings.push(
        finding(
          `scope-${requirement.id}`,
          "warning",
          "Required course is not evidenced",
          `${requirement.title} requires ${requirement.code}. Received evidence names ${[...new Set(evidence.map((item) => item.code))].join(", ")}; another course certificate does not satisfy this requirement.`,
          [...requirement.sourceRefs, ...evidence.map((item) => item.ref)],
        ),
      );
  }
  for (const item of evidence) {
    if (
      !requirements.some(
        (req) => req.code.toUpperCase() === item.code.toUpperCase(),
      )
    )
      findings.push(
        finding(
          `unmatched-${item.ref.documentId}-${item.ref.line}`,
          "warning",
          "Evidence has no matching requirement",
          `${item.title} names ${item.code}; no current requirement has that code.`,
          [item.ref],
        ),
      );
    if (rank(item.claimedState) > rank("received"))
      findings.push(
        finding(
          `claim-${item.ref.documentId}-${item.ref.line}`,
          "info",
          "Evidence awaits human confirmation",
          `The source claims “${item.claimedState}”. It is recorded as received until a person checks and confirms it.`,
          [item.ref],
        ),
      );
  }
  return { requirements, tasks, policies, findings };
}

/** Re-extract after source edits; retain confirmations only against identical evidence. */
export function reconcileProject(project) {
  const next = clone(project),
    extracted = analyzeDocuments(next.documents || []);
  next.requirements = extracted.requirements.map((requirement) => {
    const previous = (project.requirements || []).find(
      (item) => item.id === requirement.id,
    );
    if (!previous) return requirement;
    const same =
      previous.confirmationFingerprint &&
      previous.confirmationFingerprint ===
        fingerprint(
          {
            ...requirement,
            status: previous.status,
            reviewerNote: previous.reviewerNote,
          },
          next.documents,
        );
    const previousSourceLine = previous.sourceRefs?.[0]?.quote || "";
    const previousSourceOwner = parseFields(
      previousSourceLine.replace(/^Requirement\s*(?:\||:)\s*/i, ""),
    ).owner;
    const manuallyAssigned =
      previous.ownerOverride ||
      (previousSourceOwner && previous.owner !== previousSourceOwner);
    return {
      ...requirement,
      owner: manuallyAssigned ? previous.owner : requirement.owner,
      ownerOverride: !!manuallyAssigned,
      notes: previous.notes || "",
      reviewerNote: previous.reviewerNote || "",
      status: same ? previous.status : requirement.status,
      confirmationFingerprint: same ? previous.confirmationFingerprint : null,
      confirmationInvalidated: !!previous.confirmationFingerprint && !same,
    };
  });
  next.tasks = extracted.tasks;
  next.policies = extracted.policies;
  return next;
}

/** A human attestation. Claims in packet text cannot call this function. */
export function confirmRequirement(
  project,
  requirementId,
  status,
  reviewerNote = "",
) {
  if (!STATES.includes(status))
    throw new Error(`Unknown verification state: ${status}`);
  const next = clone(project),
    requirement = next.requirements.find((item) => item.id === requirementId);
  if (!requirement) throw new Error("Requirement not found.");
  const extracted = analyzeDocuments(next.documents);
  const sourceRequirement = extracted.requirements.find(
    (item) => item.id === requirementId,
  );
  if (!sourceRequirement)
    throw new Error(
      "This requirement no longer exists in the source packet. Re-analyze the documents first.",
    );
  requirement.sourceRefs = sourceRequirement.sourceRefs;
  requirement.evidenceRefs = sourceRequirement.evidenceRefs;
  if (rank(status) >= rank("verified") && !reviewerNote.trim())
    throw new Error(
      "Add a reviewer note describing what you checked before confirming this state.",
    );
  if (
    rank(status) >= rank("verified") &&
    (!requirement.evidenceRefs.length ||
      !requirement.evidenceRefs.every((ref) =>
        referenceLive(ref, next.documents),
      ))
  )
    throw new Error(
      `Attach evidence with the exact requirement code ${requirement.code} before confirming this state.`,
    );
  requirement.status = status;
  requirement.reviewerNote = reviewerNote;
  requirement.confirmationFingerprint = fingerprint(
    requirement,
    next.documents,
  );
  requirement.confirmationInvalidated = false;
  next.audit ||= [];
  next.audit.push({
    id: `audit-${Date.now()}-${next.audit.length}`,
    at: new Date().toISOString(),
    type: "verification",
    requirementId,
    status,
    note: reviewerNote,
  });
  return next;
}

function topological(tasks, dependencyKey = "dependsOn") {
  const result = [],
    visited = new Set(),
    visiting = new Set(),
    byId = new Map(tasks.map((task) => [task.id, task]));
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Dependency cycle includes ${id}.`);
    const task = byId.get(id);
    if (!task) throw new Error(`Unknown task dependency: ${id}.`);
    visiting.add(id);
    for (const dependency of task[dependencyKey] || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    result.push(task);
  };
  for (const task of tasks) visit(task.id);
  return result;
}

export function validateProject(data, options = {}) {
  const semantic = !options.structuralOnly;
  const errors = [],
    warnings = [];
  const record = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const stringArray = (value) =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  const validRef = (ref) =>
    record(ref) &&
    typeof ref.documentId === "string" &&
    Number.isInteger(ref.line) &&
    ref.line >= 1 &&
    typeof ref.quote === "string";
  if (!record(data))
    return { valid: false, errors: ["Project must be an object."], warnings };
  for (const key of [
    "id",
    "title",
    "studyId",
    "startDate",
    "targetDate",
    "activeScenarioId",
  ])
    if (typeof data[key] !== "string") errors.push(`${key} must be a string.`);
  if (
    !record(data.person) ||
    ["name", "role", "institution"].some(
      (key) => typeof data.person[key] !== "string",
    )
  )
    errors.push("person must include name, role, and institution strings.");
  for (const key of [
    "documents",
    "requirements",
    "tasks",
    "policies",
    "scenarios",
    "audit",
  ])
    if (!Array.isArray(data[key])) errors.push(`${key} must be an array.`);
  if (errors.length) return { valid: false, errors, warnings };
  for (const field of ["startDate", "targetDate"])
    if (semantic && data[field] && !isoValid(data[field]))
      errors.push(`${field} must be a valid ISO calendar date.`);
  for (const key of [
    "documents",
    "requirements",
    "tasks",
    "policies",
    "scenarios",
  ]) {
    const ids = new Set();
    for (const item of data[key]) {
      if (!record(item) || typeof item.id !== "string" || !item.id.trim()) {
        errors.push(`Each ${key} entry needs an id.`);
        continue;
      }
      if (semantic && ids.has(item.id))
        errors.push(`Duplicate ${key} id: ${item.id}.`);
      ids.add(item.id);
    }
  }
  if (errors.length) return { valid: false, errors, warnings };
  for (const doc of data.documents)
    if (["name", "kind", "text"].some((key) => typeof doc[key] !== "string"))
      errors.push(`Document ${doc.id} needs name, kind, and text strings.`);
  for (const requirement of data.requirements) {
    if (
      !STATES.includes(requirement.status) ||
      !STATES.includes(requirement.requiredState) ||
      requirement.requiredState === "missing"
    )
      errors.push(
        `Requirement ${requirement.id} has an invalid verification state.`,
      );
    if (
      ["title", "code", "kind", "owner"].some(
        (key) => typeof requirement[key] !== "string",
      )
    )
      errors.push(
        `Requirement ${requirement.id} needs title, code, kind, and owner strings.`,
      );
    if (
      !Array.isArray(requirement.evidenceRefs) ||
      !requirement.evidenceRefs.every(validRef)
    )
      errors.push(
        `Requirement ${requirement.id} has malformed evidence references.`,
      );
    for (const key of ["notes", "reviewerNote"])
      if (
        requirement[key] !== undefined &&
        typeof requirement[key] !== "string"
      )
        errors.push(`Requirement ${requirement.id} ${key} must be a string.`);
    if (
      requirement.confirmationFingerprint != null &&
      typeof requirement.confirmationFingerprint !== "string"
    )
      errors.push(
        `Requirement ${requirement.id} has a malformed confirmation fingerprint.`,
      );
  }
  for (const item of [...data.requirements, ...data.tasks, ...data.policies])
    if (!Array.isArray(item.sourceRefs) || !item.sourceRefs.every(validRef))
      errors.push(`Record ${item.id} has malformed source references.`);
  const requirementIds = new Set(data.requirements.map((item) => item.id));
  for (const task of data.tasks) {
    if (["title", "owner"].some((key) => typeof task[key] !== "string"))
      errors.push(`Task ${task.id} needs title and owner strings.`);
    if (
      !Number.isInteger(task.duration) ||
      (semantic && (task.duration < 0 || task.duration > 3650))
    )
      errors.push(
        `Task ${task.id} duration must be a whole number from 0 to 3650.`,
      );
    if (!stringArray(task.dependsOn) || !stringArray(task.requirementIds)) {
      errors.push(
        `Task ${task.id} needs arrays of dependency and requirement ids.`,
      );
      continue;
    }
    if (!STATES.includes(task.completionState))
      errors.push(`Task ${task.id} has an invalid completionState.`);
    if (
      task.completesRequirementId != null &&
      typeof task.completesRequirementId !== "string"
    )
      errors.push(
        `Task ${task.id} completesRequirementId must be a string or null.`,
      );
    if (task.preparation !== undefined && typeof task.preparation !== "boolean")
      errors.push(`Task ${task.id} preparation must be a boolean.`);
    for (const id of [
      ...task.requirementIds,
      ...(task.completesRequirementId ? [task.completesRequirementId] : []),
    ])
      if (semantic && !requirementIds.has(id))
        errors.push(`Task ${task.id} references unknown requirement ${id}.`);
  }
  for (const policy of data.policies) {
    if (
      typeof policy.title !== "string" ||
      typeof policy.description !== "string"
    )
      errors.push(`Policy ${policy.id} needs title and description strings.`);
    if (
      !record(policy.allowedOverrides) ||
      !Object.values(policy.allowedOverrides).every(stringArray)
    )
      errors.push(
        `Policy ${policy.id} allowedOverrides must map task ids to dependency-id arrays.`,
      );
  }
  for (const scenario of data.scenarios) {
    if (
      typeof scenario.name !== "string" ||
      typeof scenario.description !== "string"
    )
      errors.push(
        `Scenario ${scenario.id} needs name and description strings.`,
      );
    if (
      !record(scenario.taskDelays) ||
      !Object.values(scenario.taskDelays).every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ) ||
      !stringArray(scenario.assumedRequirementIds) ||
      !record(scenario.dependencyOverrides) ||
      !Object.values(scenario.dependencyOverrides).every(stringArray)
    )
      errors.push(
        `Scenario ${scenario.id} needs numeric taskDelays, requirement-id assumptions, and dependency-id arrays.`,
      );
  }
  if (data.audit.some((entry) => !record(entry)))
    errors.push("Audit entries must be objects.");
  if (semantic && !errors.length)
    try {
      topological(data.tasks);
    } catch (error) {
      errors.push(error.message);
    }
  if (semantic && !errors.length) {
    const extracted = analyzeDocuments(data.documents);
    for (const item of extracted.findings.filter(
      (item) => item.severity === "error",
    ))
      errors.push(item.detail);
    const taskFields = [
      "id",
      "title",
      "owner",
      "duration",
      "dependsOn",
      "requirementIds",
      "sourceRefs",
      "completesRequirementId",
      "completionState",
      "preparation",
    ];
    const policyFields = [
      "id",
      "title",
      "description",
      "sourceRefs",
      "allowedOverrides",
    ];
    const canonical = (value, keys) =>
      JSON.stringify(keys.map((key) => value[key]));
    for (const [key, fields] of [
      ["tasks", taskFields],
      ["policies", policyFields],
    ]) {
      if (
        data[key].length !== extracted[key].length ||
        data[key].some((item) => {
          const fromSource = extracted[key].find(
            (candidate) => candidate.id === item.id,
          );
          return (
            !fromSource ||
            canonical(item, fields) !== canonical(fromSource, fields)
          );
        })
      )
        errors.push(
          `Stored ${key} differ from the current source records. Re-analyze the documents before planning; edit source records or use scenario delays instead of changing derived fields.`,
        );
    }
  }
  if (!data.documents.length)
    warnings.push("Add a source packet before assessing readiness.");
  if (!data.startDate)
    warnings.push("Choose a start date to calculate readiness dates.");
  if (
    semantic &&
    data.activeScenarioId &&
    !data.scenarios.some((scenario) => scenario.id === data.activeScenarioId)
  )
    errors.push("activeScenarioId does not refer to a scenario.");
  return { valid: errors.length === 0, errors, warnings };
}

function effectiveRequirements(project, findings, scenario) {
  const extracted = analyzeDocuments(project.documents);
  return project.requirements.map((requirement) => {
    const current = extracted.requirements.find(
      (item) => item.id === requirement.id,
    );
    const evidenceMatches = current?.evidenceRefs || [];
    let effectiveStatus = evidenceMatches.length ? "received" : "missing";
    const unchanged =
      current &&
      requirement.confirmationFingerprint ===
        fingerprint(
          {
            ...current,
            status: requirement.status,
            reviewerNote: requirement.reviewerNote,
          },
          project.documents,
        );
    if (unchanged) effectiveStatus = requirement.status;
    else if (
      requirement.confirmationInvalidated ||
      requirement.confirmationFingerprint ||
      rank(requirement.status) >= rank("verified")
    )
      findings.push(
        finding(
          `stale-${requirement.id}`,
          "warning",
          "Human confirmation needs review",
          `${requirement.title}: its source or evidence changed, or no current human confirmation is recorded. Reconfirm after checking the current documents.`,
          current?.sourceRefs || requirement.sourceRefs,
        ),
      );
    if (!current)
      findings.push(
        finding(
          `removed-${requirement.id}`,
          "error",
          "Requirement is absent from current source",
          `${requirement.title} no longer has a matching source record. Re-analyze the packet before planning.`,
          requirement.sourceRefs,
        ),
      );
    return {
      ...requirement,
      ...(current
        ? {
            title: current.title,
            code: current.code,
            requiredState: current.requiredState,
            kind: current.kind,
          }
        : {}),
      sourceRefs: current?.sourceRefs || requirement.sourceRefs,
      evidenceRefs: evidenceMatches,
      effectiveStatus,
      satisfied:
        rank(effectiveStatus) >=
        rank(current?.requiredState || requirement.requiredState),
      assumed: !!scenario.assumedRequirementIds?.includes(requirement.id),
      evidenceMatches,
    };
  });
}
function schedule(project, requirements, scenario, findings) {
  const reqMap = new Map(requirements.map((item) => [item.id, item]));
  const taskIds = new Set(project.tasks.map((item) => item.id));
  const assumptions = new Set(scenario.assumedRequirementIds || []);
  for (const id of assumptions)
    if (!reqMap.has(id))
      findings.push(
        finding(
          `unknown-assumption-${id}`,
          "warning",
          "Unknown scenario assumption ignored",
          `No requirement named ${id} exists.`,
        ),
      );
  const taskList = project.tasks.map((task) => {
    const req = reqMap.get(task.completesRequirementId);
    const completed =
      !!req && rank(req.effectiveStatus) >= rank(task.completionState);
    const projectedCompleted =
      completed ||
      (!!req &&
        assumptions.has(req.id) &&
        rank(req.requiredState) >= rank(task.completionState));
    let dependencies = [...task.dependsOn];
    const override = scenario.dependencyOverrides?.[task.id];
    if (override !== undefined) {
      const policy = project.policies.find(
        (item) =>
          Array.isArray(item.allowedOverrides?.[task.id]) &&
          Array.isArray(override) &&
          [...item.allowedOverrides[task.id]].sort().join("|") ===
            [...override].sort().join("|") &&
          item.sourceRefs?.length &&
          item.sourceRefs.every((ref) => referenceLive(ref, project.documents)),
      );
      if (policy && task.preparation) dependencies = [...override];
      else
        findings.push(
          finding(
            `override-${task.id}`,
            "warning",
            "Unsupported dependency change ignored",
            `${task.title}: only a current source-backed preparation policy may change dependencies. Verification, approval, and access gates remain enforced.`,
            task.sourceRefs,
          ),
        );
    }
    const delay = scenario.taskDelays?.[task.id] ?? 0;
    const validDelay = Number.isInteger(delay) && delay >= 0 && delay <= 3650;
    if (!validDelay)
      findings.push(
        finding(
          `delay-${task.id}`,
          "warning",
          "Invalid delay ignored",
          `${task.title}: additional delay must be a whole number from 0 to 3650.`,
        ),
      );
    return {
      ...task,
      completed,
      projectedCompleted,
      effectiveDependsOn: dependencies,
      effectiveDuration: projectedCompleted
        ? 0
        : task.duration + (validDelay ? delay : 0),
    };
  });
  for (const id of Object.keys(scenario.taskDelays || {}))
    if (!taskIds.has(id))
      findings.push(
        finding(
          `unknown-delay-${id}`,
          "warning",
          "Unknown delayed task ignored",
          `No task named ${id} exists.`,
        ),
      );
  for (const id of Object.keys(scenario.dependencyOverrides || {}))
    if (!taskIds.has(id))
      findings.push(
        finding(
          `unknown-override-${id}`,
          "warning",
          "Unknown dependency override ignored",
          `No task named ${id} exists.`,
        ),
      );
  const ordered = topological(taskList, "effectiveDependsOn"),
    byId = new Map(ordered.map((task) => [task.id, task]));
  for (const task of ordered) {
    task.startOffset = task.projectedCompleted
      ? 0
      : Math.max(
          0,
          ...task.effectiveDependsOn.map((id) => byId.get(id).finishOffset),
        );
    task.finishOffset = task.startOffset + task.effectiveDuration;
    task.startDate = addWorkingDays(project.startDate, task.startOffset);
    task.finishDate = addWorkingDays(project.startDate, task.finishOffset);
    // Actual availability never uses assumed evidence. Policy-authorized preparation is actionable.
    task.blockedBy = task.completed
      ? []
      : task.effectiveDependsOn.filter((id) => !byId.get(id).completed);
    task.available = !task.completed && task.blockedBy.length === 0;
  }
  const total = Math.max(0, ...ordered.map((task) => task.finishOffset));
  for (const task of [...ordered].reverse()) {
    const successors = ordered.filter(
      (next) =>
        !next.projectedCompleted && next.effectiveDependsOn.includes(task.id),
    );
    task.latestFinish = Math.min(
      total,
      ...successors.map((next) => next.latestStart),
    );
    task.latestStart = task.latestFinish - task.effectiveDuration;
    task.slack = task.projectedCompleted
      ? 0
      : Math.max(0, task.latestStart - task.startOffset);
    task.critical = !task.projectedCompleted && task.slack === 0;
  }
  return { tasks: project.tasks.map((task) => byId.get(task.id)), total };
}

/** See ENGINE_CONTRACT.md for the stable, serializable return shape. */
export function calculateReadiness(project, scenario) {
  const validation = validateProject(project);
  const selected = scenario ||
    project?.scenarios?.find(
      (item) => item.id === project.activeScenarioId,
    ) || {
      id: "baseline",
      name: "Current plan",
      taskDelays: {},
      assumedRequirementIds: [],
      dependencyOverrides: {},
    };
  const result = {
    valid: validation.valid,
    errors: [...validation.errors],
    startDate: project?.startDate || "",
    finishDate: null,
    totalWorkingDays: null,
    targetVarianceDays: null,
    requirements: [],
    tasks: [],
    criticalPath: [],
    actions: [],
    findings: [],
    roleReviews: [],
    comparison: {
      baselineDays: null,
      scenarioDays: null,
      daysSaved: null,
      baselineFinishDate: null,
      scenarioFinishDate: null,
    },
    policyOptions: project?.policies || [],
    scenarioName: selected.name || "Scenario",
    isScenario:
      !!Object.keys(selected.taskDelays || {}).length ||
      !!selected.assumedRequirementIds?.length ||
      !!Object.keys(selected.dependencyOverrides || {}).length,
  };
  if (!validation.valid) {
    result.findings = validation.errors.map((detail, index) =>
      finding(
        `validation-${index}`,
        "error",
        "Project needs correction",
        detail,
      ),
    );
    return result;
  }
  result.findings = analyzeDocuments(project.documents).findings;
  result.requirements = effectiveRequirements(
    project,
    result.findings,
    selected,
  );
  const extractedRequirements = analyzeDocuments(
    project.documents,
  ).requirements;
  for (const requirement of extractedRequirements)
    if (!project.requirements.some((item) => item.id === requirement.id))
      result.findings.push(
        finding(
          `new-source-${requirement.id}`,
          "error",
          "New source requirement needs analysis",
          `${requirement.title} was added to the packet. Re-analyze the documents to include it in the plan.`,
          requirement.sourceRefs,
        ),
      );
  if (
    !project.documents.length ||
    !project.requirements.length ||
    !project.tasks.length
  )
    result.findings.push(
      finding(
        "no-plan",
        "warning",
        "No complete readiness plan yet",
        "Add source requirements and explicit Task records with working-day durations and dependencies. An empty packet cannot be assessed as ready.",
      ),
    );
  if (!project.startDate)
    result.findings.push(
      finding(
        "no-start",
        "warning",
        "Start date needed",
        "Choose the planning start date to calculate calendar dates.",
      ),
    );
  const unscheduled = result.requirements.filter(
    (req) =>
      !req.satisfied &&
      !project.tasks.some(
        (task) =>
          task.completesRequirementId === req.id &&
          rank(task.completionState) >= rank(req.requiredState),
      ),
  );
  for (const req of unscheduled)
    result.findings.push(
      finding(
        `unscheduled-${req.id}`,
        "warning",
        "Requirement has no completion task",
        `${req.title} is ${req.effectiveStatus} and requires ${req.requiredState}. Add a task that reaches that state before estimating overall readiness.`,
        req.sourceRefs,
      ),
    );
  result.valid = !result.findings.some((item) => item.severity === "error");
  result.errors = result.findings
    .filter((item) => item.severity === "error")
    .map((item) => item.detail);
  if (!result.valid) return result;
  if (project.tasks.length) {
    try {
      const current = schedule(
        project,
        result.requirements,
        selected,
        result.findings,
      );
      const baseline = schedule(
        project,
        result.requirements,
        { taskDelays: {}, assumedRequirementIds: [], dependencyOverrides: {} },
        [],
      );
      result.tasks = current.tasks;
      for (const task of current.tasks.filter((item) => item.completed)) {
        const unresolved = task.dependsOn.filter(
          (id) => !current.tasks.find((item) => item.id === id)?.completed,
        );
        if (unresolved.length)
          result.findings.push(
            finding(
              `inconsistent-${task.id}`,
              "warning",
              "Recorded completion has unresolved prerequisites",
              `${task.title} is confirmed, but prerequisite steps are not confirmed. Review the records and dependency scope with the responsible owner.`,
              task.sourceRefs,
            ),
          );
      }
      result.criticalPath = current.tasks
        .filter((task) => task.critical)
        .map((task) => task.id);
      const estimable =
        project.documents.length &&
        project.requirements.length &&
        !unscheduled.length;
      if (estimable) {
        result.totalWorkingDays = current.total;
        result.finishDate = addWorkingDays(project.startDate, current.total);
        result.targetVarianceDays =
          result.finishDate && project.targetDate
            ? workingDistance(project.targetDate, result.finishDate)
            : null;
        result.comparison = {
          baselineDays: baseline.total,
          scenarioDays: current.total,
          daysSaved: baseline.total - current.total,
          baselineFinishDate: addWorkingDays(project.startDate, baseline.total),
          scenarioFinishDate: result.finishDate,
        };
      }
      result.actions = current.tasks.map((task) => ({
        id: `action-${task.id}`,
        taskId: task.id,
        title: task.title,
        owner: task.owner,
        state: task.completed
          ? "complete"
          : task.available
            ? "available"
            : "blocked",
        reason: task.completed
          ? `Current evidence meets this step’s required completion state: ${task.completionState}.`
          : task.available
            ? task.preparation
              ? "Preparation can begin under the current plan. This does not grant approval or access."
              : "Prerequisite steps meet their required completion states; a person must carry out and verify this step."
            : `Waiting for ${task.blockedBy.map((id) => current.tasks.find((item) => item.id === id)?.title || id).join("; ")}.`,
        sourceRefs: task.sourceRefs,
      }));
    } catch (error) {
      result.valid = false;
      result.errors.push(error.message);
      result.findings.push(
        finding(
          "schedule-error",
          "error",
          "Dependency schedule is invalid",
          error.message,
        ),
      );
    }
  }
  if (selected.assumedRequirementIds?.length)
    result.findings.push(
      finding(
        "assumptions",
        "info",
        "Scenario assumptions are not verification",
        "The projected schedule treats selected requirements as satisfied. Actual statuses and action availability still require current human verification.",
      ),
    );
  result.roleReviews = [
    {
      id: "coordinator",
      role: "Study coordinator",
      title: "Evidence and course scope",
      kinds: ["training", "document"],
    },
    {
      id: "investigator",
      role: "Principal investigator / approving lead",
      title: "Authorization gates",
      kinds: ["approval"],
    },
    {
      id: "systems",
      role: "Systems administrator",
      title: "Active access",
      kinds: ["access"],
    },
  ].map(({ kinds, ...review }) => {
    const requirements = result.requirements.filter((item) =>
        kinds.includes(item.kind),
      ),
      pending = requirements.filter((item) => !item.satisfied);
    return {
      ...review,
      status: pending.length || !requirements.length ? "attention" : "clear",
      summary: !project.requirements.length
        ? "No source-backed requirements are available to review."
        : pending.length
          ? pending
              .map(
                (req) =>
                  `${req.title}: ${req.effectiveStatus}; needs ${req.requiredState}.`,
              )
              .join(" ")
          : requirements.length
            ? "All requirements in this review meet their stated completion states. Receipt alone does not establish verification or approval."
            : "No requirements of this type were extracted; review the packet for omissions.",
      requirementIds: requirements.map((req) => req.id),
      sourceRefs: requirements.flatMap((req) => req.sourceRefs),
    };
  });
  return result;
}
