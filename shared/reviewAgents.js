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
export function validateAgentReviews(reviews, expectedAgents, sourceIds, { partial = false } = {}) {
  if (!Array.isArray(reviews) || reviews.length > expectedAgents.length || (!partial && reviews.length !== expectedAgents.length)) {
    throw new Error('The AI returned an incomplete agent batch. Completed reviews are preserved; retry the simulation.')
  }
  const allowed = new Set(expectedAgents.map(agent => agent.id))
  const sources = new Set(sourceIds)
  const seen = new Set()
  return reviews.map(review => {
    if (!review || !allowed.has(review.agentId) || seen.has(review.agentId)) throw new Error('The AI returned duplicate or unknown agents.')
    seen.add(review.agentId)
    if (!Array.isArray(review.questions) || review.questions.length < 1 || review.questions.length > 2) throw new Error('An agent returned invalid review questions.')
    if (!Array.isArray(review.topics) || review.topics.length < 1 || review.topics.length > 3 || review.topics.some(topic => !REVIEW_TOPICS.includes(topic))) {
      throw new Error('An agent returned an unknown review topic.')
    }
    if (!Array.isArray(review.sourceIds) || review.sourceIds.length > 4 || review.sourceIds.some(id => !sources.has(id))) {
      throw new Error('An agent cited a document that was not supplied to this run.')
    }
    return {
      agentId: review.agentId, summary: reviewText(review.summary, 600),
      questions: review.questions.map(question => reviewText(question, 200)),
      topics: [...new Set(review.topics)], sourceIds: [...new Set(review.sourceIds)],
    }
  })
}

export function reviewSummary(reviews, count) {
  const counts = new Map(REVIEW_TOPICS.map(topic => [topic, 0]))
  for (const review of reviews) for (const topic of review.topics) counts.set(topic, counts.get(topic) + 1)
  const topics = [...counts].filter(([, value]) => value).sort((a, b) => b[1] - a[1])
  const selected = topics.map(([topic]) => reviews.find(review => review.topics.includes(topic)))
    .filter((review, index, all) => all.findIndex(entry => entry.agentId === review.agentId) === index)
  return [
    `Exploratory AI review · ${reviews.length} of ${count} agent perspectives completed`,
    'These fictional perspectives are generated in batches. They are preparation for review, not actual board member statements or IRB decisions.',
    'Open the knowledge graph to inspect every agent, its questions, and its supplied document references.',
    '', 'Review topics', ...topics.map(([topic, value]) => `${TOPIC_LABELS[topic]}: ${value} agent reviews`),
    '', 'Questions to explore', ...selected.map(review => `${review.agentId}: ${review.questions[0]}`),
  ].join('\n\n')
}
