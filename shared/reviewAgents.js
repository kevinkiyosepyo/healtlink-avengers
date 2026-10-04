export const AGENT_MIN = 50
export const AGENT_MAX = 300
export const AGENT_STEP = 10
export const AGENT_BATCH_SIZE = 10
export const AGENT_CONCURRENCY = 2

const ROLES = [
  ['Scientific reviewer', 'study design and scientific rationale'],
  ['Ethics reviewer', 'ethical justification and participant protections'],
  ['Community representative', 'community concerns and trust'],
  ['Consent reviewer', 'understanding and voluntary consent'],
  ['Privacy reviewer', 'identifiability and confidentiality'],
  ['Data security reviewer', 'access controls and secure storage'],
  ['Research coordinator', 'ownership and research workflow'],
  ['Participant perspective', 'practical participation experience'],
  ['Recruitment reviewer', 'fair recruitment and eligibility'],
  ['Accessibility reviewer', 'language, disability, and access barriers'],
  ['Statistician perspective', 'analysis assumptions and uncertainty'],
  ['Methods reviewer', 'measurement validity and study methods'],
  ['Risk reviewer', 'foreseeable harms and safeguards'],
  ['Benefit reviewer', 'benefit claims and proportionality'],
  ['Operations reviewer', 'staff capacity and dependencies'],
  ['Training reviewer', 'competency and authorization evidence'],
  ['Student researcher perspective', 'supervision and role boundaries'],
  ['Principal investigator perspective', 'oversight and accountability'],
  ['Independent reviewer', 'conflicts of interest and independence'],
  ['Family perspective', 'caregiver burden and communication'],
  ['Equity reviewer', 'fair distribution of burdens and benefits'],
  ['Documentation reviewer', 'consistency and missing documentation'],
  ['Protocol reviewer', 'protocol clarity and feasibility'],
  ['Monitoring reviewer', 'incident handling and monitoring plans'],
  ['Technology reviewer', 'technical reliability and failure modes'],
  ['Data quality reviewer', 'data integrity and quality controls'],
  ['Governance reviewer', 'permissions and responsibility boundaries'],
  ['Communication reviewer', 'clarity of participant communications'],
  ['Retention reviewer', 'withdrawal and retention burdens'],
  ['Readiness reviewer', 'unresolved questions before review'],
]
const LENSES = [
  'evidence gaps', 'practical safeguards', 'participant burden', 'implementation dependencies',
  'alternative approaches', 'failure scenarios', 'equity and access', 'ongoing oversight',
  'document consistency', 'preparation priorities',
]
export const REVIEW_TOPICS = [
  'consent', 'privacy', 'recruitment', 'risk', 'study-design', 'data-security',
  'accessibility', 'operations', 'oversight', 'evidence-gaps',
]
export const TOPIC_LABELS = {
  consent: 'Consent', privacy: 'Privacy', recruitment: 'Recruitment', risk: 'Risks and safeguards',
  'study-design': 'Study design', 'data-security': 'Data security', accessibility: 'Accessibility',
  operations: 'Study operations', oversight: 'Oversight', 'evidence-gaps': 'Evidence gaps',
}

export function validateAgentCount(count) {
  if (!Number.isInteger(count) || count < AGENT_MIN || count > AGENT_MAX || count % AGENT_STEP !== 0) {
    throw new Error('Choose 50 to 300 agents in steps of 10.')
  }
  return count
}

export function reviewAgents(count) {
  validateAgentCount(count)
  return Array.from({ length: count }, (_, index) => {
    const [role, focus] = ROLES[index % ROLES.length]
    const lens = LENSES[Math.floor(index / ROLES.length)]
    return { id: `agent-${String(index + 1).padStart(3, '0')}`, role, focus, lens, label: `${role} · ${lens}` }
  })
}

export function agentBatch(batch) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new Error('Choose a valid agent batch.')
  const total = validateAgentCount(batch.total)
  if (!Number.isInteger(batch.offset) || batch.offset < 0 || batch.offset >= total || batch.offset % AGENT_BATCH_SIZE !== 0) {
    throw new Error('Choose a valid agent batch.')
  }
  return reviewAgents(total).slice(batch.offset, batch.offset + AGENT_BATCH_SIZE)
}

function reviewText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('An agent returned invalid review text.')
  return value.trim()
}

// Shared by the provider boundary, browser transport, and saved-run recovery.
// A graph edge can only cite a source actually supplied to this run.
export function validateAgentReviews(reviews, expectedAgents, sourceIds, { partial = false, requireNextSteps = false } = {}) {
  if (!Array.isArray(reviews) || reviews.length > expectedAgents.length || (!partial && reviews.length !== expectedAgents.length)) {
    throw new Error('The AI returned an incomplete agent batch. Completed reviews are preserved; retry the simulation.')
  }
  const allowed = new Set(expectedAgents.map(agent => agent.id))
  const sources = new Set(sourceIds)
  const seen = new Set()
  return reviews.map(review => {
    if (!review || !allowed.has(review.agentId) || seen.has(review.agentId)) throw new Error('The AI returned duplicate or unknown agents.')
    seen.add(review.agentId)
    if (!Array.isArray(review.questions) || review.questions.length > 2) throw new Error('An agent returned invalid review questions.')
    let nextSteps
    // Older saved reviews did not return preparation steps. Keep their findings
    // readable, while requiring actual model-generated steps for new batches.
    if (review.nextSteps !== undefined || requireNextSteps) {
      if (!Array.isArray(review.nextSteps) || review.nextSteps.length < 1 || review.nextSteps.length > 2) throw new Error('An agent returned invalid preparation steps.')
      nextSteps = review.nextSteps.map(step => reviewText(step, 200))
    }
    if (!Array.isArray(review.topics) || review.topics.length < 1 || review.topics.length > 3 || review.topics.some(topic => !REVIEW_TOPICS.includes(topic))) {
      throw new Error('An agent returned an unknown review topic.')
    }
    if (!Array.isArray(review.sourceIds) || review.sourceIds.length > 4 || review.sourceIds.some(id => !sources.has(id))) {
      throw new Error('An agent cited a document that was not supplied to this run.')
    }
    return {
      agentId: review.agentId, summary: reviewText(review.summary, 600),
      questions: review.questions.map(question => reviewText(question, 200)),
      ...(nextSteps ? { nextSteps } : {}),
      topics: [...new Set(review.topics)], sourceIds: [...new Set(review.sourceIds)],
    }
  })
}

export function reviewSummary(reviews, count, sources = []) {
  const counts = new Map(REVIEW_TOPICS.map(topic => [topic, 0]))
  for (const review of reviews) for (const topic of review.topics) counts.set(topic, counts.get(topic) + 1)
  const topics = [...counts].filter(([, value]) => value).sort((a, b) => b[1] - a[1])
  const ordered = [...reviews].sort((a, b) => a.agentId.localeCompare(b.agentId))
  const selected = [], seen = new Set()
  const key = text => text.trim().replace(/\s+/g, ' ').toLowerCase()
  function select(review) {
    if (!review || selected.length >= 8 || seen.has(key(review.summary))) return
    seen.add(key(review.summary))
    selected.push(review)
  }
  for (const [topic] of topics) select(ordered.find(review => review.topics.includes(topic) && !seen.has(key(review.summary))))
  for (const review of ordered) select(review)
  const agents = new Map(reviewAgents(count).map(agent => [agent.id, agent]))
  const sourceNames = new Map(sources.map(source => [source.id, source.name]))
  function references(review) {
    if (!review.sourceIds.length) return 'No document citation returned.'
    const names = review.sourceIds.slice(0, 2).map(id => {
      const name = sourceNames.get(id) || id
      return name.length > 80 ? name.slice(0, 77) + '…' : name
    })
    return `Sources: ${names.join(', ')}${review.sourceIds.length > 2 ? ` (+${review.sourceIds.length - 2} more in the graph)` : ''}.`
  }
  const candidates = [...selected, ...ordered.filter(review => !selected.includes(review))]
  const steps = [], questions = [], stepKeys = new Set(), questionKeys = new Set()
  for (const review of candidates) {
    for (const step of review.nextSteps || []) if (steps.length < 6 && !stepKeys.has(key(step))) {
      stepKeys.add(key(step))
      steps.push(`${steps.length + 1}. ${step}\n${references(review)}`)
    }
    for (const question of review.questions) if (questions.length < 3 && !questionKeys.has(key(question))) {
      questionKeys.add(key(question))
      questions.push(`• ${question}`)
    }
  }
  return [
    `AI study review · ${reviews.length} of ${count} agent perspectives completed`,
    'Key insights',
    ...selected.map((review, index) => `${index + 1}. ${review.summary}\n${agents.get(review.agentId).role} · ${references(review)}`),
    ...(steps.length ? ['Recommended next steps', ...steps] : []),
    ...(questions.length ? ['Remaining uncertainties', ...questions] : []),
    'Review coverage', topics.map(([topic, value]) => `${TOPIC_LABELS[topic]}: ${value} reviews`).join(' · '),
    'These are AI interpretations of the supplied context, not verified research findings or an IRB decision. Open the graph to inspect all agent reviews and references.',
  ].join('\n\n')
}
