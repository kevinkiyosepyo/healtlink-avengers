export const GRAPH_TYPES = [
  { id: 'scenario', label: 'Scenario', color: '#245b50' },
  { id: 'agent', label: 'Agent', color: '#347da9' },
  { id: 'factor', label: 'Factor', color: '#ed805d' },
  { id: 'outcome', label: 'Outcome', color: '#9764b4' },
]

const FACTORS = [
  ['Available time', 'The time allocated to the sample scenario.'],
  ['Team capacity', 'The people and effort available in this illustrative network.'],
  ['Starting assumptions', 'The assumptions a real simulation would need to make explicit.'],
  ['Information access', 'Which information each sample agent could have available.'],
  ['Shared objectives', 'The goals participants would use to guide their decisions.'],
  ['Coordination', 'How participants might organize work and exchange updates.'],
  ['Resource allocation', 'How available resources might be distributed.'],
  ['Decision timing', 'When a choice could enter the scenario.'],
  ['Feedback loops', 'Where one interaction could inform another.'],
  ['Uncertainty', 'Inputs that would need ranges or additional evidence.'],
  ['Dependencies', 'Work or information that a participant could depend on.'],
  ['Communication', 'The channels through which agents could exchange information.'],
  ['Priorities', 'The relative importance of the scenario objectives.'],
  ['Constraints', 'The boundaries a real simulation would need to respect.'],
  ['Adaptation', 'How an agent could reconsider a choice after new information.'],
  ['Participation', 'Which sample agents take part in the illustrative network.'],
  ['Review criteria', 'The criteria that could be used to review a scenario.'],
  ['Evidence quality', 'The reliability of the inputs a real simulation would require.'],
]

const OUTCOMES = [
  ['Decision paths', 'A placeholder for exploring alternative sequences of choices.'],
  ['Interaction patterns', 'A placeholder for reviewing connections between participants.'],
  ['Emerging questions', 'A placeholder for questions that would need further investigation.'],
  ['Points of agreement', 'A placeholder for examining where participant views could align.'],
  ['Trade-offs', 'A placeholder for comparing competing objectives.'],
  ['Next steps', 'A placeholder for planning a follow-up scenario.'],
]

const ROLES = ['Planner', 'Explorer', 'Coordinator', 'Reviewer', 'Contributor', 'Observer']
const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback

function seededRandom(seed) {
  let state = 2166136261
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619)
  return () => {
    state += 0x6D2B79F5
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Illustrative local data, not simulation findings. IDs and starting positions
 * are stable for a run, so progress updates need not rebuild the graph.
 */
export function createSimulationGraph(run = null, sessionTitle = '') {
  const random = seededRandom(run?.id || 'sample-scenario')
  const suppliedCount = Number(run?.agentCount ?? 12)
  const agentCount = clamp(Number.isFinite(suppliedCount) ? Math.floor(suppliedCount) : 12, 1, 24)
  const title = (typeof sessionTitle === 'string' && sessionTitle.trim())
    || (typeof run?.prompt === 'string' && run.prompt.trim()) || 'Sample scenario'
  const nodes = []
  const links = []
  const linkIds = new Set()
  const offset = random() * TAU

  function addNode(id, label, type, description, x, y, properties = {}) {
    nodes.push({
      id, label, type, description,
      properties: { Source: 'Illustrative demo', ...properties },
      radius: type === 'scenario' ? 12 : type === 'agent' ? 8 : type === 'outcome' ? 7 : 5.5,
      x, y, vx: 0, vy: 0,
    })
  }

  function addLink(source, target, label) {
    const key = [source, target].sort().join(':')
    if (source === target || linkIds.has(key)) return
    linkIds.add(key)
    links.push({ id: `link:${key}`, source, target, label })
  }

  addNode('scenario', title.length > 64 ? `${title.slice(0, 63)}…` : title, 'scenario',
    'The starting point for this chat’s illustrative relationship map. Nodes and connections are sample data, not generated findings or predictions.',
    0, 0, { Scenario: title, Agents: agentCount, Run: run?.id || 'Sample preview' })

  for (let index = 0; index < agentCount; index++) {
    const role = ROLES[index % ROLES.length]
    const angle = offset + index / agentCount * TAU
    const radius = 120 + random() * 50
    addNode(`agent-${index + 1}`, `Agent ${String(index + 1).padStart(2, '0')} · ${role}`, 'agent',
      `A sample ${role.toLowerCase()} used to demonstrate an individual participant and its relationships. This role does not represent a real person or a model-generated agent.`,
      Math.cos(angle) * radius, Math.sin(angle) * radius * 0.82,
      { Role: role, Participant: index + 1 })
    addLink('scenario', `agent-${index + 1}`, 'Includes sample agent')
  }

  FACTORS.forEach(([label, description], index) => {
    const angle = offset + (index + 0.4) / FACTORS.length * TAU
    const radius = 265 + random() * 70
    addNode(`factor-${index + 1}`, label, 'factor',
      `${description} This is an illustrative factor; its importance has not been measured.`,
      Math.cos(angle) * radius, Math.sin(angle) * radius * 0.78,
      { Category: 'Scenario input', Assessment: 'Not evaluated' })
  })

  OUTCOMES.forEach(([label, description], index) => {
    const angle = offset + (index + 0.65) / OUTCOMES.length * TAU
    const radius = 195 + random() * 35
    addNode(`outcome-${index + 1}`, label, 'outcome',
      `${description} This is an illustrative output category, not a predicted result.`,
      Math.cos(angle) * radius, Math.sin(angle) * radius * 0.85,
      { Category: 'Possible output', Assessment: 'Not generated' })
    addLink('scenario', `outcome-${index + 1}`, 'Frames possible output')
  })

  for (let index = 0; index < agentCount; index++) {
    // Nearby factors create visible neighborhoods with a few cross-connections.
    const start = Math.floor(index / agentCount * FACTORS.length)
    for (const shift of [0, 1, 4]) {
      addLink(`agent-${index + 1}`, `factor-${(start + shift) % FACTORS.length + 1}`, 'Considers factor')
    }
    if (index % 2 === 0 && agentCount > 1) {
      addLink(`agent-${index + 1}`, `agent-${(index + 1) % agentCount + 1}`, 'Sample interaction')
    }
  }

  FACTORS.forEach((_, index) => {
    addLink(`factor-${index + 1}`, `outcome-${Math.floor(index / 3) + 1}`, 'Relates to possible output')
    if (index % 3 === 0) addLink(`factor-${index + 1}`, `factor-${(index + 4) % FACTORS.length + 1}`, 'Related factor')
  })

  return { nodes, links }
}

/** A bounded force step. Link endpoints remain IDs and pins remain authoritative. */
export function stepLayout(nodes, links, { alpha = 1, dt = 1 } = {}) {
  const heat = clamp(finite(alpha, 1), 0, 1)
  const timestep = clamp(finite(dt, 1), 0, 2)
  const byId = new Map()
  const degree = new Map()
  for (const [index, node] of nodes.entries()) {
    node.x = Number.isFinite(node.fx) ? node.fx : finite(node.x, Math.cos(index * 2.4) * 20)
    node.y = Number.isFinite(node.fy) ? node.fy : finite(node.y, Math.sin(index * 2.4) * 20)
    node.vx = Number.isFinite(node.fx) ? 0 : finite(node.vx)
    node.vy = Number.isFinite(node.fy) ? 0 : finite(node.vy)
    byId.set(node.id, node)
  }
  for (const link of links) {
    if (!byId.has(link.source) || !byId.has(link.target) || link.source === link.target) continue
    degree.set(link.source, (degree.get(link.source) || 0) + 1)
    degree.set(link.target, (degree.get(link.target) || 0) + 1)
  }

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex++) {
      const other = nodes[otherIndex]
      let dx = other.x - node.x
      let dy = other.y - node.y
      let distance = Math.hypot(dx, dy)
      if (distance < 0.01) {
        const angle = (index + 1) * (otherIndex + 1) * 2.399963
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        distance = 1
      }
      const clearance = Math.max(0, finite(node.radius, 6)) + Math.max(0, finite(other.radius, 6)) + 22
      const repulsion = 2000 / Math.max(distance * distance, 400)
      const collision = Math.max(0, clearance - distance) * 0.11
      const force = (repulsion + collision) * heat * timestep
      const fx = finite(dx / distance * force)
      const fy = finite(dy / distance * force)
      node.vx -= fx
      node.vy -= fy
      other.vx += fx
      other.vy += fy
    }
  }

  for (const link of links) {
    const source = byId.get(link.source)
    const target = byId.get(link.target)
    if (!source || !target || source === target) continue
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.max(0.01, Math.hypot(dx, dy))
    const length = source.type === 'scenario' || target.type === 'scenario' ? 145 : 95
    const weight = Math.sqrt(Math.min(degree.get(source.id), degree.get(target.id))) || 1
    const force = (distance - length) * 0.032 / weight * heat * timestep
    const fx = finite(dx / distance * force)
    const fy = finite(dy / distance * force)
    source.vx += fx
    source.vy += fy
    target.vx -= fx
    target.vy -= fy
  }

  let maxSpeed = 0
  for (const node of nodes) {
    const damping = Math.pow(0.76, timestep)
    node.vx = clamp(finite((node.vx - node.x * 0.0015 * heat * timestep) * damping), -18, 18)
    node.vy = clamp(finite((node.vy - node.y * 0.0015 * heat * timestep) * damping), -18, 18)
    if (Number.isFinite(node.fx)) { node.x = node.fx; node.vx = 0 }
    else node.x = finite(node.x + node.vx * timestep)
    if (Number.isFinite(node.fy)) { node.y = node.fy; node.vy = 0 }
    else node.y = finite(node.y + node.vy * timestep)
    maxSpeed = Math.max(maxSpeed, Math.hypot(node.vx, node.vy))
  }
  return maxSpeed
}

export function settleLayout(nodes, links, iterations = 100) {
  const count = clamp(Math.floor(finite(iterations, 100)), 0, 1000)
  for (let index = 0; index < count; index++) {
    stepLayout(nodes, links, { alpha: Math.max(0.04, Math.pow(1 - index / count, 1.5)) })
  }
  return nodes
}

export function getNeighborhood(nodeId, links) {
  const neighborhood = new Set([nodeId])
  for (const link of links) {
    if (link.source === nodeId) neighborhood.add(link.target)
    if (link.target === nodeId) neighborhood.add(link.source)
  }
  return neighborhood
}

/** Camera uses screen = world * k + { x, y }. */
export function fitGraph(nodes, width, height, padding = 80) {
  const w = Math.max(1, finite(width, 1))
  const h = Math.max(1, finite(height, 1))
  const inset = Math.max(0, finite(padding, 80))
  const valid = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y))
  if (!valid.length) return { x: w / 2, y: h / 2, k: 1 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of valid) {
    const radius = Math.max(0, finite(node.radius, 6))
    minX = Math.min(minX, node.x - radius)
    maxX = Math.max(maxX, node.x + radius)
    minY = Math.min(minY, node.y - radius)
    maxY = Math.max(maxY, node.y + radius)
  }
  const k = clamp(Math.min(
    Math.max(1, w - inset * 2) / Math.max(1, maxX - minX),
    Math.max(1, h - inset * 2) / Math.max(1, maxY - minY),
  ), 0.25, 2)
  return { x: w / 2 - (minX + maxX) / 2 * k, y: h / 2 - (minY + maxY) / 2 * k, k }
}

/** Zoom about a screen point, keeping its corresponding world point stationary. */
export function zoomCamera(camera, factor, point, min = 0.25, max = 3) {
  const current = Number.isFinite(camera?.k) && camera.k > 0 ? camera.k : 1
  const lower = Math.max(0.01, finite(min, 0.25))
  const upper = Math.max(lower, finite(max, 3))
  const scale = Number.isFinite(factor) && factor > 0 ? factor : 1
  const k = clamp(current * scale, lower, upper)
  const px = finite(point?.x)
  const py = finite(point?.y)
  return {
    x: px - (px - finite(camera?.x)) * k / current,
    y: py - (py - finite(camera?.y)) * k / current,
    k,
  }
}
