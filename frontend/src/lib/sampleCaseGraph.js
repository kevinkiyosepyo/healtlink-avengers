import { getSampleCaseComparison, SAMPLE_CASE_START, SAMPLE_CASE_ROTATION_END } from './sampleCaseStudy.js'

// Each fictional role is replayed through five review lenses. These are scripted
// perspectives, not real people, concurrent model calls, or an IRB decision.
export const CASE_REVIEW_GROUPS = Object.freeze([
  { id: 'research', label: 'Research team', color: 'var(--graph-research, #315feb)' },
  { id: 'ethics', label: 'IRB members & oversight', color: 'var(--graph-ethics, #8958be)' },
  { id: 'training', label: 'Training & evidence', color: 'var(--graph-training, #d47930)' },
  { id: 'operations', label: 'Operations', color: 'var(--graph-operations, #139789)' },
  { id: 'data', label: 'Data & access', color: 'var(--graph-data, #3c87ba)' },
  { id: 'participants', label: 'Participant perspectives', color: 'var(--graph-participants, #c45b80)' },
].map(group => Object.freeze(group)))

const SOURCE = 'Fictional REST-101 case · scripted demo'
const ROLES = {
  research: [
    ['student-researcher', 'Student researcher', 'Alex has 12 hours per week. Reserve time for HS-02 evidence and orientation before planning work on the restricted extract.', ['rotation-window', 'hs-02']],
    ['principal-investigator', 'Principal investigator', 'Confirm a supervised data-quality role in the packet. Alex is joining an existing approved study, not designing a new trial.', ['role-boundary', 'formal-review']],
    ['study-coordinator', 'Study coordinator', 'Jordan should reconcile the two course records with the training matrix on October 5, before the October 7 submission.', ['hs-02', 'packet-correction']],
    ['rotation-mentor', 'Rotation mentor', 'The first deliverable checks missing wearable files, visit labels, and questionnaire records. Practice that workflow using fabricated records while review is pending.', ['role-boundary', 'empty-workspace']],
    ['task-design-reviewer', 'Task design reviewer', 'Specify the authorized extract and the supervised report before requesting permissions. A vague request to get access hides separate responsibilities.', ['role-boundary', 'access-gate']],
  ],
  ethics: [
    ['personnel-reviewer', 'Personnel modification reviewer', 'A recorded personnel-modification decision is still required before Alex receives study data. Preparing an empty environment does not grant that decision.', ['formal-review', 'access-gate']],
    ['human-subjects-reviewer', 'IRB scientific member', 'Two uploaded certificates do not establish the HS-02 requirement. Jordan must verify equivalent evidence or record completion before treating the packet as complete.', ['hs-02', 'formal-review']],
    ['role-boundary-reviewer', 'IRB nonscientific member', 'Alex will not recruit participants, obtain consent, deliver the intervention, or make clinical decisions. Preserve those boundaries in the personnel description.', ['role-boundary', 'access-gate']],
    ['authorization-reviewer', 'IRB privacy reviewer', 'Local release checks must confirm the decision, training, orientation, role, and permitted data scope before production activation.', ['access-gate', 'formal-review']],
    ['research-governance-reviewer', 'IRB community member', 'This case uses an office-level personnel workflow. The scripted IRB-member perspectives question the plan from scientific, nonscientific, community, and privacy roles; they do not convene a real board or issue an approval.', ['formal-review', 'role-boundary']],
  ],
  training: [
    ['training-matrix-reviewer', 'Training matrix reviewer', 'Match each course record to the applicable matrix requirement. The received files establish general conduct and privacy awareness, leaving HS-02 unresolved.', ['hs-02', 'packet-correction']],
    ['certificate-reviewer', 'Certificate evidence reviewer', 'File receipt and requirement satisfaction are different states. Mark HS-02 as needing verification until a matching record is supplied.', ['hs-02', 'formal-review']],
    ['equivalency-reviewer', 'Training equivalency reviewer', 'First ask Jordan whether equivalent HS-02 evidence exists. If it does not, Alex completes the missing component and supplies the record.', ['hs-02', 'packet-correction']],
    ['orientation-planner', 'Orientation planner', 'Study-specific orientation remains inside the two-day local release stage in both paths. Do not count it as eliminated work.', ['access-gate', 'readiness-gain']],
    ['training-audit-reviewer', 'Training audit reviewer', 'Retain the exact record supporting HS-02 and who verified it. The graph describes a proposed workflow, not a newly issued course certificate.', ['hs-02', 'formal-review']],
  ],
  operations: [
    ['intake-process-reviewer', 'Intake process reviewer', 'An incomplete packet incurs three working days of screening plus four for correction and resubmission. First-day verification avoids that seven-day detour in this case.', ['packet-correction', 'hs-02']],
    ['computing-queue-planner', 'Computing queue planner', 'Sam can start the three-day empty-environment request on October 7. The original sequence waits until October 27 to open the same request.', ['empty-workspace', 'readiness-gain']],
    ['dependency-analyst', 'Dependency analyst', 'Production activation waits for both local release and environment readiness. Moving environment preparation earlier does not change this final join.', ['access-gate', 'empty-workspace']],
    ['critical-path-reviewer', 'Critical-path reviewer', 'Seven avoided working days of packet return plus three overlapped setup days explain the ten-working-day gain. Do not count the setup overlap twice.', ['packet-correction', 'readiness-gain']],
    ['readiness-milestone-reviewer', 'Readiness milestone reviewer', 'The original path reaches the assigned task on November 2 after 20 working days; the prepared path reaches it on October 19 after 10.', ['readiness-gain', 'rotation-window']],
  ],
  data: [
    ['research-computing-admin', 'Research computing administrator', 'Sam prepares identity setup, MFA, packages, and a fabricated-data notebook in the empty environment. These tasks do not need the restricted study extract.', ['empty-workspace', 'access-gate']],
    ['data-steward', 'Local data steward', 'Before releasing the extract, confirm the recorded decision, training, orientation, assigned role, and scope. Environment readiness is only one prerequisite.', ['access-gate', 'role-boundary']],
    ['least-privilege-reviewer', 'Least-privilege reviewer', 'Request only the study-data role needed for supervised quality checks. Alex does not receive the identity-linking key.', ['role-boundary', 'access-gate']],
    ['environment-isolation-reviewer', 'Environment isolation reviewer', 'Keep rehearsal data fabricated until release conditions are met. Empty-workspace preparation and production data activation must remain separate states.', ['empty-workspace', 'access-gate']],
    ['access-verification-reviewer', 'Access verification reviewer', 'After both branches complete, Sam activates the approved role and checks that the intended folder and notebook work. Keep the one-day verification stage.', ['access-gate', 'empty-workspace']],
  ],
  participants: [
    ['participant-privacy-perspective', 'Participant privacy perspective', 'A volunteer would expect onboarding convenience not to expand access to identifying information. Keep the identity key outside Alex’s assigned role.', ['role-boundary', 'access-gate']],
    ['consent-boundary-perspective', 'Consent boundary perspective', 'Alex’s role excludes obtaining consent. Earlier technical readiness should not silently add participant-facing responsibilities.', ['role-boundary', 'readiness-gain']],
    ['wearable-data-perspective', 'Wearable data perspective', 'Wearable measurements remain study data even when labeled with codes. A fabricated-data rehearsal can test tooling without exposing those measurements.', ['empty-workspace', 'access-gate']],
    ['participant-safeguards-perspective', 'Participant safeguards perspective', 'Keep authorization, orientation, and release checks visible alongside the faster schedule. A shorter administrative path should still show each required gate.', ['access-gate', 'readiness-gain']],
    ['participant-impact-perspective', 'Participant impact perspective', 'Two more weeks of Alex’s rotation become available for the assigned work. The demonstration does not claim better sleep outcomes or a measured participant benefit.', ['readiness-gain', 'rotation-window']],
  ],
}

const agentId = (groupId, roleId) => `agent-${groupId}-${roleId}`

export const SAMPLE_REVIEW_LENSES = Object.freeze([
  { id: 'case-review', label: 'Case review' },
  { id: 'evidence-check', label: 'Evidence check' },
  { id: 'dependency-check', label: 'Dependency check' },
  { id: 'preparation-action', label: 'Preparation action' },
  { id: 'release-check', label: 'Release check' },
].map(lens => Object.freeze(lens)))

const LENS_ACTIONS = {
  'hs-02': {
    'evidence-check': 'Ask Jordan for the record that satisfies HS-02; the two received certificates do not establish it.',
    'dependency-check': 'Keep submission dependent on verified HS-02 evidence rather than on a planned completion date.',
    'preparation-action': 'Check for equivalent HS-02 evidence first, then arrange the missing component if no matching record exists.',
    'release-check': 'Confirm the HS-02 record and its verifier are retained before marking training satisfied.',
  },
  'role-boundary': {
    'evidence-check': 'Check the personnel description for supervised data-quality work and the exclusions on recruitment, consent, clinical decisions, and the identity key.',
    'dependency-check': 'Make the requested permissions depend on Alex’s assigned quality-check role, not general study membership.',
    'preparation-action': 'Draft the missing-file, visit-label, and questionnaire checks using fabricated records within the assigned role.',
    'release-check': 'Compare the activated role with the supervised assignment and confirm the identity-linking key remains outside its scope.',
  },
  'packet-correction': {
    'evidence-check': 'Compare the training matrix with the attachments to find the unresolved evidence behind the returned packet.',
    'dependency-check': 'Require a complete corrected packet before starting the unchanged personnel review.',
    'preparation-action': 'Reserve Jordan’s verification and PI confirmation in the initial preparation window to avoid a later return cycle.',
    'release-check': 'Check the submitted packet contains the verified evidence; avoiding resubmission does not itself authorize data access.',
  },
  'formal-review': {
    'evidence-check': 'Request the recorded personnel-modification decision; an estimated date is not a review record.',
    'dependency-check': 'Keep the complete-packet review between submission and local release, with the same duration in both paths.',
    'preparation-action': 'Prepare questions and the personnel description for the existing approved study without claiming a new trial approval.',
    'release-check': 'Confirm the actual review decision before local release; no scripted reviewer can supply that decision.',
  },
  'empty-workspace': {
    'evidence-check': 'Check fictional Computing Policy §4.2 for permission to prepare an empty or fabricated-data environment.',
    'dependency-check': 'Let environment preparation overlap review while keeping production activation dependent on both completed branches.',
    'preparation-action': 'Ask Sam to prepare identity setup, MFA, packages, and the fabricated-data notebook without loading the study extract.',
    'release-check': 'Verify environment readiness separately from data authorization and retain fabricated records until release conditions are met.',
  },
  'access-gate': {
    'evidence-check': 'Check the release record for authorization, training, orientation, role, and permitted data scope.',
    'dependency-check': 'Make activation wait for both local release and environment readiness; completing either alone is insufficient.',
    'preparation-action': 'List the release checks and assign Sam’s activation and access verification after the dependency join.',
    'release-check': 'Record the permitted folder and notebook access test before marking the first restricted-data task ready.',
  },
  'rotation-window': {
    'evidence-check': 'Confirm Alex’s rotation window and weekly availability, and flag the weekday-only calendar as an assumption.',
    'dependency-check': 'Recalculate readiness if Alex, the PI, Jordan, or Sam cannot attend the reserved work blocks.',
    'preparation-action': 'Reserve training, evidence verification, and orientation time within the existing rotation rather than assuming unseen earlier work.',
    'release-check': 'Check the remaining rotation against the actual readiness date; available weeks do not guarantee research output.',
  },
  'readiness-gain': {
    'evidence-check': 'Trace the earlier readiness to the avoided packet return and overlapping setup; the gain is illustrative, not measured participant benefit.',
    'dependency-check': 'Retain review, local release, and activation in the revised sequence when comparing readiness dates.',
    'preparation-action': 'Separate return avoidance from setup overlap so the recovered time is not counted twice.',
    'release-check': 'Label the result as modeled readiness for the assigned task only after checking every prerequisite, not as a trial approval or clinical outcome.',
  },
}

// Interleave disciplines so the replay reads like a review across teams rather
// than six disconnected blocks. All content is local and remains deterministic.
const REVIEWERS = Object.freeze(Array.from({ length: ROLES.research.length * SAMPLE_REVIEW_LENSES.length }, (_, round) =>
  CASE_REVIEW_GROUPS.map(group => {
    const [roleId, baseRole, originalText, focusIds] = ROLES[group.id][round % ROLES[group.id].length]
    const lens = SAMPLE_REVIEW_LENSES[Math.floor(round / ROLES[group.id].length)]
    const baseAgentId = agentId(group.id, roleId)
    const id = lens.id === 'case-review' ? baseAgentId : `${baseAgentId}-${lens.id}`
    const role = lens.id === 'case-review' ? baseRole : `${baseRole} · ${lens.label}`
    const reviewText = lens.id === 'case-review' ? originalText
      : `${baseRole} — ${lens.label.toLowerCase()}: ${focusIds.map(focusId => LENS_ACTIONS[focusId][lens.id]).join(' ')}`
    return Object.freeze({
      id, groupId: group.id, role, baseRole, baseAgentId,
      lensId: lens.id, lensLabel: lens.label, reviewText,
      focusIds: Object.freeze([...focusIds]),
    })
  }),
).flat())

export const SAMPLE_REVIEW_EVENTS = Object.freeze(REVIEWERS.map(reviewer => Object.freeze({
  id: `review-${reviewer.id}`, agentId: reviewer.id, groupId: reviewer.groupId,
  title: reviewer.role, text: reviewer.reviewText, baseRole: reviewer.baseRole,
  lensId: reviewer.lensId, lensLabel: reviewer.lensLabel,
  relatedIds: Object.freeze([reviewer.id, ...reviewer.focusIds]),
})))
export const SAMPLE_AGENT_COUNT = SAMPLE_REVIEW_EVENTS.length
export const SAMPLE_INITIAL_REVIEWED = SAMPLE_AGENT_COUNT - 10
export const SAMPLE_ROLE_COUNT = Object.values(ROLES).reduce((sum, roles) => sum + roles.length, 0)

export function createSampleCaseGraph() {
  const comparison = getSampleCaseComparison()
  const title = `REST-101 · a ${SAMPLE_AGENT_COUNT}-agent case review`
  const description = `A scripted sample replay of training, review, and data-access dependencies in the fictional REST-101 case. ${SAMPLE_ROLE_COUNT} roles × ${SAMPLE_REVIEW_LENSES.length} review lenses include simulated IRB-member perspectives, not a board decision.`
  const types = [
    ...CASE_REVIEW_GROUPS.map(group => ({ ...group })),
    { id: 'scenario', label: 'Sample case', color: 'var(--graph-scenario, #223856)' },
    { id: 'factor', label: 'Case evidence', color: 'var(--graph-factor, #ed805d)' },
    { id: 'outcome', label: 'Modeled outcome', color: 'var(--graph-outcome, #8654a5)' },
  ]
  const facts = [
    ['hs-02', 'HS-02 evidence gap', 'factor', 'Two supplied certificates do not establish the fictional HS-02 requirement. Verify equivalent evidence or complete the missing component during the October 5–7 preparation window.', { Requirement: 'HS-02', Status: 'Unresolved at the start', 'Active training': 'About 2 hours in the fictional plan' }],
    ['role-boundary', 'Supervised data quality', 'factor', 'Alex joins the already-approved REST-101 sleep-coaching study at fictional Cedar Bay University. The assignment checks wearable files, visit labels, and questionnaires; it excludes recruitment, consent, clinical decisions, and the identity-linking key.', { Study: 'REST-101 · 40 fictional adult volunteers', Role: 'Supervised data-quality checks', 'Participant contact': 'Outside the assigned role' }],
    ['packet-correction', '7-day return cycle', 'factor', 'The original packet is returned after 3 working days of screening and takes 4 more to correct and resubmit. Verifying HS-02 in the same initial two-day preparation window avoids this later seven-day cycle.', { Screening: '3 working days', Correction: '4 working days', 'Avoided delay': '7 working days' }],
    ['formal-review', '5-day review preserved', 'factor', 'Both complete packets undergo the same five-working-day personnel-modification review. The fictional workflow is office-level; demo agents do not issue a decision or replace institutional reviewers.', { Duration: '5 working days in both paths', Original: 'October 16–23', Prepared: 'October 7–14' }],
    ['empty-workspace', 'Prepare an empty workspace', 'factor', 'Under fictional Computing Policy §4.2, Sam can prepare identity setup, MFA, packages, and a fabricated-data notebook before study-data authorization. The same three-day task overlaps review in the prepared path.', { Duration: '3 working days', Original: 'October 27–30', Prepared: 'October 7–12', 'Study data': 'Unavailable during preparation' }],
    ['access-gate', 'Release before activation', 'factor', 'The recorded decision is followed by two working days of local release checks. One day of production activation and verification waits for both release and empty-workspace readiness.', { 'Release checks': '2 working days', 'Activation & test': '1 working day', 'Prerequisites': 'Recorded authorization, local release, environment ready' }],
    ['rotation-window', 'Six-week rotation', 'factor', 'Alex’s rotation begins October 5 and ends at the start of November 16, 2026, at 12 hours per week. The modeled calendar uses weekdays without holiday closures; availability is assumed.', { Start: SAMPLE_CASE_START, End: SAMPLE_CASE_ROTATION_END, Availability: '12 hours per week', Calendar: 'Monday–Friday; no modeled holidays' }],
    ['readiness-gain', 'Ready 14 days earlier', 'outcome', 'The original sequence reaches the first authorized data-quality task November 2; the prepared sequence reaches it October 19. Seven avoided working days plus three overlapped setup days recover ten working days, or fourteen calendar days.', { Original: comparison.original.readyDate, Prepared: comparison.prepared.readyDate, 'Working days recovered': comparison.workingDaysRecovered, 'Calendar days recovered': comparison.calendarDaysRecovered, 'Rotation remaining': '4 weeks instead of 2', Meaning: 'Illustrative readiness, not a clinical result' }],
  ]
  const nodes = [{
    id: 'scenario', label: 'REST-101 · Alex’s onboarding', type: 'scenario', kind: 'scenario',
    radius: 16, x: 0, y: 0, vx: 0, vy: 0, description,
    properties: { Source: SOURCE, Institution: 'Cedar Bay University · fictional', Reviewers: SAMPLE_AGENT_COUNT, Roles: SAMPLE_ROLE_COUNT, 'Review lenses': SAMPLE_REVIEW_LENSES.length, Mode: 'Scripted sample replay' },
  }]
  const links = []
  function link(source, target, label) {
    links.push({ id: `link:${source}:${target}`, source, target, label })
  }

  facts.forEach(([id, label, type, detail, properties], index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 4
    nodes.push({ id, label, type, kind: type, radius: type === 'outcome' ? 11 : 9,
      x: Math.cos(angle) * 155, y: Math.sin(angle) * 142, vx: 0, vy: 0,
      description: detail, properties: { Source: SOURCE, ...properties } })
    link('scenario', id, type === 'outcome' ? 'Compares readiness' : 'Contains case evidence')
  })

  CASE_REVIEW_GROUPS.forEach((group, groupIndex) => {
    const clusterAngle = -Math.PI / 2 + groupIndex * Math.PI / 3
    const centerX = Math.cos(clusterAngle) * 590
    const centerY = Math.sin(clusterAngle) * 510
    const reviewers = REVIEWERS.filter(reviewer => reviewer.groupId === group.id)
    reviewers.forEach((reviewer, index) => {
      const { id, role, reviewText, focusIds, baseRole, baseAgentId, lensId, lensLabel } = reviewer
      const angle = clusterAngle + index * Math.PI * (3 - Math.sqrt(5))
      const spread = 28 * Math.sqrt(index + 0.5)
      nodes.push({
        id, label: role, type: group.id, kind: 'agent', groupId: group.id, role,
        baseRole, baseAgentId, lensId, lensLabel,
        reviewText, focusIds: [...focusIds], description: reviewText,
        radius: 7, x: centerX + Math.cos(angle) * spread,
        y: centerY + Math.sin(angle) * spread, vx: 0, vy: 0,
        properties: { Source: SOURCE, Role: baseRole, 'Review lens': lensLabel, Perspective: role, Team: group.label, Identity: 'Fictional scripted reviewer', Focus: focusIds.map(focusId => facts.find(fact => fact[0] === focusId)[1]).join(' · ') },
      })
      link(id, focusIds[0], 'Reviews case evidence')
      if (index % 3 === 0) link(id, focusIds[1], 'Cross-checks dependency')
      if (index % 2 === 1) {
        link(reviewers[index - 1].id, id, `Related ${group.label.toLowerCase()} perspectives`)
      }
    })
  })

  for (const [source, target, label] of [
    ['hs-02', 'packet-correction', 'Explains the returned packet'],
    ['packet-correction', 'formal-review', 'Complete evidence enables review'],
    ['formal-review', 'access-gate', 'Recorded decision precedes release'],
    ['empty-workspace', 'access-gate', 'Environment required before activation'],
    ['role-boundary', 'access-gate', 'Limits the requested permissions'],
    ['packet-correction', 'readiness-gain', 'Avoids 7 working days'],
    ['empty-workspace', 'readiness-gain', 'Overlaps 3 working days'],
    ['access-gate', 'readiness-gain', 'First task waits for final verification'],
    ['rotation-window', 'readiness-gain', 'Defines the remaining work window'],
  ]) link(source, target, label)

  return { nodes, links, types, title, description }
}
