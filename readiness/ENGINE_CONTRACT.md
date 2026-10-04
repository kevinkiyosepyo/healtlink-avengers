# Readiness engine contract

ES modules. Imports: `createProject(kind = 'rest')` from `src/lib/sampleCases.js`; `analyzeDocuments`, `calculateReadiness`, `validateProject`, `reconcileProject`, `confirmRequirement`, `addWorkingDays`, `formatDate` from `src/lib/readiness.js`.

`createProject('rest'|'aurora'|'empty')` returns a fresh serializable project. Project fields follow the agreed shape. Requirements have `id,title,code,kind,owner,requiredState,status,sourceRefs,evidenceRefs,notes,reviewerNote,confirmationFingerprint`. States are `missing`, `received`, `verified`, `approved`, `active`. Source/evidence refs are `{documentId,line,quote}` with 1-based lines. Tasks have `id,title,owner,duration,dependsOn,requirementIds,sourceRefs,completesRequirementId,completionState,preparation`. Policies have `id,title,description,sourceRefs,allowedOverrides` where allowedOverrides maps task IDs to allowed dependency lists. Scenario shape: `{id,name,description,taskDelays:{[taskId]:additionalWorkingDays},assumedRequirementIds:[],dependencyOverrides:{[taskId]:dependencyIds}}`.

`analyzeDocuments(documents)` deterministically returns `{requirements,tasks,policies,findings}`. Each finding is `{id,severity,title,detail,sourceRefs}`. Requirement/Task/Policy lines use readable `key=value | key=value` fields. Unsupported nonempty passages are reported. Evidence lines explicitly state `code`, `state`, and `title`; extraction only records received evidence and never automatically confirms verification, approval, or active access.

`confirmRequirement(project, requirementId, status, reviewerNote = '')` returns a new project with a human decision and source/evidence fingerprint; does not mutate input. Verified/approved/active states require matching evidence and a nonempty reviewer note. Use for all status edits. `reconcileProject(project)` returns a new project re-extracted from current documents; preserves human changes to owner, notes, reviewerNote and statuses only when source/evidence fingerprint is unchanged; otherwise revokes confirmation. Source owner changes propagate unless a human owner override was made. Use after source document changes. `validateProject(data)` returns `{valid,errors:string[],warnings:string[]}`. It checks nested shapes and source-derived task/policy consistency as well as dates and graphs. `validateProject(data,{structuralOnly:true})` permits incomplete/invalid schedules in locally saved editable drafts while rejecting malformed fields. `calculateReadiness(project,scenario = activeScenario)` also checks changed fingerprints so stale confirmation cannot confer readiness.

Readiness result stable shape:
```
{
 valid, errors: string[], startDate, finishDate: string|null,
 totalWorkingDays: number|null, targetVarianceDays: number|null,
 requirements: [...requirements with effectiveStatus, satisfied, assumed, evidenceMatches],
 tasks: [...tasks with startOffset,finishOffset,startDate,finishDate,slack,critical,
   completed,projectedCompleted,available,blockedBy:string[],effectiveDuration,effectiveDependsOn],
 criticalPath: string[],
 actions: [{id,taskId,title,owner,state:'available'|'blocked'|'complete',reason,sourceRefs}],
 findings: [{id,severity:'info'|'warning'|'error',title,detail,sourceRefs}],
 roleReviews: [{id,role,title,status:'clear'|'attention',summary,requirementIds,sourceRefs}],
 comparison: {baselineDays,scenarioDays,daysSaved,baselineFinishDate,scenarioFinishDate},
 policyOptions: [{id,title,description,sourceRefs,allowedOverrides}],
 scenarioName, isScenario: boolean
}
```

`completed` and action availability always use actual human verification; `projectedCompleted` can additionally use scenario assumptions. Scenario assumptions never change actual requirement state. Supported dependency overrides must match a source-backed policy; unsupported overrides produce warnings and are ignored. Every finish date is a weekday boundary: Monday start + 5 working days = next Monday. `totalWorkingDays` is elapsed Mon–Fri work days, excludes weekends, does not account for holidays. Slack uses CPM latest/earliest finish. Negative targetVarianceDays means projected completion is before target. Empty input has null readiness/date and actionable findings; no invented dates or ready state.

More precisely, a received evidence record can complete a task whose completionState is received. It cannot complete a verified, approved, or active task. Those states require a current human confirmation. Source requirement lines, complete evidence documents, selected decision state, and reviewer note are fingerprinted; changes invalidate that confirmation. Fingerprints track local state and are not signed identity credentials.

## New packet grammar

Plain text, Markdown, extracted PDF/DOCX text, and pasted text all use the same deterministic parser. Each record fits on one line. Fields are separated by `|`; values may contain `=` but cannot contain `|`.

```text
Requirement | id=privacy | title=Study privacy induction | code=PRIV-77 | kind=training | owner=Sam | state=verified
Requirement | id=forms | title=Site forms | code=FORMS-77 | kind=document | owner=Coordinator | state=received
Task | id=learn | title=Complete privacy induction | owner=Sam | days=2 | after= | requires=privacy | completes=privacy | state=verified
Task | id=prepare | title=Prepare site forms | owner=Coordinator | days=3 | after=learn | requires=forms | completes=forms | state=received | preparation=true
Policy | id=parallel | title=Prepare blank forms during induction | parallel=prepare | description=The coordinator may prepare blank site forms while induction is pending. This grants no study duties or access.
Evidence | code=PRIV-77 | state=received | title=Sam privacy induction completion record
```

Requirement `state` is the required human state. Evidence `state` is only a claim in a received document. Task `state` is the milestone its `completes` requirement must reach; `requires` links the requirements discussed by the task, while `after` encodes prerequisite task gates. Task ids and requirement ids are project-wide and must be unique. `days` is an integer from 0–3650; no timing is inferred from prose. `parallel` lists preparation tasks allowed to have no prerequisites; it cannot authorize non-preparation tasks to bypass gates. `kind` values used in role reviews are training/document/approval/access.

The natural-language pattern “Sam must complete PRIV-88 training before accessing study data” extracts a provisional verified requirement and explicitly asks for review. It does not infer a duration or dependency plan. Other unrecognized nonempty passages are surfaced with exact source lines for human interpretation. Entirely unsupported packets and requirements lacking completion tasks yield no overall readiness estimate. Edit the source and re-analyze to correct extraction. The UI and exports must not claim arbitrary packet understanding or AI extraction.

The fictional REST case computes 20 working days sequentially and 10 with authorized preparation; AURORA computes 18 and 13. These are outputs of source task data, not constants in the calculator. A dominant independent prerequisite can make preparation save zero days.
