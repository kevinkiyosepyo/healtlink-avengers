import { reviewAgents, TOPIC_LABELS } from '../../../shared/reviewAgents.js'

const TYPES = [
  { id: 'scenario', label: 'Study', color: 'var(--ui-accent)' },
  { id: 'agent', label: 'Reviewed agents', color: 'var(--ui-success)' },
  { id: 'queued', label: 'Awaiting review', color: 'var(--ui-muted)' },
  { id: 'document', label: 'Documents', color: 'var(--ui-warning)' },
  { id: 'topic', label: 'Review topics', color: 'var(--ui-accent)' },
  { id: 'response', label: 'AI response', color: 'var(--ui-success)' },
]

export function createGeneratedSimulationGraph(run, context, title, response = '') {
  const nodes = [], links = []
  function node(id, label, type, description, x, y, properties = {}) {
    nodes.push({ id, label, type, description, properties, x, y, vx: 0, vy: 0, radius: type === 'scenario' ? 12 : type === 'agent' || type === 'queued' ? 6 : 8 })
  }
  function link(source, target, label) {
    links.push({ id: `${source}->${target}`, source, target, label })
  }
  const sources = run.sources || context?.documents || []
  node('study', title || 'Research study', 'scenario', run.prompt, 0, 0, { Question: run.prompt, Status: run.status, Perspectives: run.agentCount })
  sources.forEach((source, index) => {
    const angle = index / Math.max(1, sources.length) * Math.PI * 2
    node(`document:${source.id}`, source.name, 'document', 'Researcher-supplied study material. A citation edge records an AI reference, not verification of the document.', Math.cos(angle) * 380, Math.sin(angle) * 380, { 'Document ID': source.id, Format: source.kind })
    link('study', `document:${source.id}`, run.sources ? 'Supplied to this run' : 'Document in current study setup')
  })
  const reviews = new Map((run.agentReviews || []).map(review => [review.agentId, review]))
  if (run.agentReviews) {
    const topics = [...new Set(run.agentReviews.flatMap(review => review.topics))]
    topics.forEach((topic, index) => {
      const angle = (index + .5) / Math.max(1, topics.length) * Math.PI * 2
      node(`topic:${topic}`, TOPIC_LABELS[topic], 'topic', 'A topic explicitly returned in generated agent reviews. This connection does not measure importance or predict an outcome.', Math.cos(angle) * 140, Math.sin(angle) * 140)
    })
    const agents = reviewAgents(run.agentCount)
    const validSources = new Set(sources.map(source => source.id))
    agents.forEach((agent, index) => {
      const review = reviews.get(agent.id)
      const angle = index * 2.3999632297
      const radius = 180 + Math.sqrt(index / agents.length) * 350
      node(agent.id, `${agent.id.slice(-3)} · ${agent.role}`, review ? 'agent' : 'queued',
        review?.summary || (run.status === 'running' ? 'Queued for AI review. No finding has been generated for this agent yet.' : 'This agent has no completed review.'),
        Math.cos(angle) * radius, Math.sin(angle) * radius,
        { Role: agent.role, Lens: agent.lens, Status: review ? 'Reviewed' : 'Awaiting review', ...(review ? {
          ...(review.nextSteps?.length ? { 'Next steps': review.nextSteps.join('\n\n') } : {}),
          ...(review.questions.length ? { Questions: review.questions.join('\n\n') } : {}),
          'Source documents': review.sourceIds.map(id => sources.find(source => source.id === id)?.name || id).join(', ') || 'No document citation returned',
        } : {}) })
      link('study', agent.id, review ? 'Returned an AI review' : 'Selected review perspective')
      if (!review) return
      for (const topic of review.topics) link(agent.id, `topic:${topic}`, 'Raises review topic')
      for (const source of review.sourceIds) if (validSources.has(source)) link(agent.id, `document:${source}`, 'Cites supplied document')
    })
  } else {
    const completed = run.status === 'completed' && response.trim()
    node('ai-response', completed ? `${run.agentCount} perspectives · AI response` : `AI run · ${run.status}`, completed ? 'response' : 'queued',
      completed ? response : 'No completed AI response is available for this run.', 180, 0,
      { Status: run.status, Format: 'Legacy text response', References: 'Individual agent citations were not returned by this run.' })
    link('study', 'ai-response', completed ? 'Generated review of the study question' : 'AI request status')
  }
  return {
    mode: 'generated', runId: run.id, nodes, links, types: TYPES.filter(type => nodes.some(node => node.type === type.id)),
    title: 'Study knowledge graph', completedCount: reviews.size, agentCount: run.agentCount,
    description: run.agentReviews
      ? `${reviews.size} / ${run.agentCount} agents reviewed. Select an agent to read its insights, next steps, and document references.${reviews.size < run.agentCount ? ' Gray agents have no completed review yet.' : ''}`
      : 'Response map for the saved three-perspective review. Choose 50–300 agents in setup for a live agent graph.',
  }
}
