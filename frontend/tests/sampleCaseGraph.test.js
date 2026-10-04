import test from 'node:test'
import assert from 'node:assert/strict'
import { CASE_REVIEW_GROUPS, createSampleCaseGraph, SAMPLE_REVIEW_EVENTS } from '../src/lib/sampleCaseGraph.js'
import { getSampleCaseComparison, SAMPLE_CASE_START, SAMPLE_CASE_ROTATION_END } from '../src/lib/sampleCaseStudy.js'
import { settleLayout } from '../src/lib/simulationGraph.js'

test('the fictional review has exactly 60 distinct agents in six equal groups', () => {
  const { nodes, types, description } = createSampleCaseGraph()
  const agents = nodes.filter(node => node.kind === 'agent')
  assert.equal(nodes.length, 69)
  assert.equal(agents.length, 60)
  assert.equal(new Set(agents.map(node => node.role)).size, 60)
  assert.equal(new Set(nodes.map(node => node.id)).size, nodes.length)
  assert.deepEqual(CASE_REVIEW_GROUPS.map(group => group.id), ['research', 'ethics', 'training', 'operations', 'data', 'participants'])
  for (const group of CASE_REVIEW_GROUPS) {
    assert.equal(agents.filter(node => node.groupId === group.id && node.type === group.id).length, 10)
    assert.ok(types.some(type => type.id === group.id && type.color === group.color))
  }
  assert.match(description, /scripted sample replay/)
  assert.ok(nodes.every(node => node.properties.Source.includes('Fictional')))
  assert.ok(agents.every(node => node.description === node.reviewText && node.focusIds.length === 2))
})

test('every agent has one distinct replay event with valid case references', () => {
  const { nodes } = createSampleCaseGraph()
  const byId = new Map(nodes.map(node => [node.id, node]))
  assert.equal(SAMPLE_REVIEW_EVENTS.length, 60)
  assert.equal(new Set(SAMPLE_REVIEW_EVENTS.map(event => event.id)).size, 60)
  assert.equal(new Set(SAMPLE_REVIEW_EVENTS.map(event => event.agentId)).size, 60)
  assert.equal(new Set(SAMPLE_REVIEW_EVENTS.map(event => event.text)).size, 60)
  SAMPLE_REVIEW_EVENTS.forEach((event, index) => {
    const agent = byId.get(event.agentId)
    assert.equal(agent?.kind, 'agent')
    assert.equal(event.title, agent.role)
    assert.equal(event.text, agent.reviewText)
    assert.equal(event.groupId, CASE_REVIEW_GROUPS[index % 6].id)
    assert.deepEqual(event.relatedIds, [agent.id, ...agent.focusIds])
    assert.ok(event.relatedIds.every(id => byId.has(id)))
  })
})

test('sparse relationships are valid, unique and connect every node to the case', () => {
  const { nodes, links } = createSampleCaseGraph()
  const ids = new Set(nodes.map(node => node.id))
  const pairs = new Set()
  const connected = new Map(nodes.map(node => [node.id, []]))
  assert.ok(links.length >= nodes.length - 1)
  assert.ok(links.length < nodes.length * 2)
  for (const link of links) {
    assert.ok(ids.has(link.source) && ids.has(link.target))
    assert.notEqual(link.source, link.target)
    const pair = [link.source, link.target].sort().join(':')
    assert.ok(!pairs.has(pair), pair)
    pairs.add(pair)
    assert.ok(link.label.length > 0)
    connected.get(link.source).push(link.target)
    connected.get(link.target).push(link.source)
  }
  const visited = new Set(['scenario'])
  const queue = ['scenario']
  while (queue.length) {
    for (const next of connected.get(queue.shift())) {
      if (!visited.has(next)) { visited.add(next); queue.push(next) }
    }
  }
  assert.equal(visited.size, nodes.length)
})

test('positions are deterministic, distinct, finite, clustered and compatible with the force engine', () => {
  const graph = createSampleCaseGraph()
  assert.deepEqual(graph, createSampleCaseGraph())
  const coordinateKeys = graph.nodes.map(node => `${node.x},${node.y}`)
  assert.equal(new Set(coordinateKeys).size, graph.nodes.length)
  for (const group of CASE_REVIEW_GROUPS) {
    const agents = graph.nodes.filter(node => node.groupId === group.id)
    const centerX = agents.reduce((sum, node) => sum + node.x, 0) / agents.length
    const centerY = agents.reduce((sum, node) => sum + node.y, 0) / agents.length
    assert.ok(agents.every(node => Math.hypot(node.x - centerX, node.y - centerY) < 110))
  }
  settleLayout(graph.nodes, graph.links)
  assert.ok(graph.nodes.every(node => ['x', 'y', 'vx', 'vy', 'radius'].every(key => Number.isFinite(node[key]))))
})

test('case dates and the seven-plus-three explanation match the authoritative sample', () => {
  const { nodes } = createSampleCaseGraph()
  const comparison = getSampleCaseComparison()
  const fact = id => nodes.find(node => node.id === id)
  assert.equal(fact('rotation-window').properties.Start, SAMPLE_CASE_START)
  assert.equal(fact('rotation-window').properties.End, SAMPLE_CASE_ROTATION_END)
  assert.equal(fact('rotation-window').properties.Availability, '12 hours per week')
  assert.equal(fact('readiness-gain').properties.Original, comparison.original.readyDate)
  assert.equal(fact('readiness-gain').properties.Prepared, comparison.prepared.readyDate)
  assert.equal(fact('readiness-gain').properties['Working days recovered'], 10)
  assert.equal(fact('readiness-gain').properties['Calendar days recovered'], 14)
  assert.equal(fact('packet-correction').properties['Avoided delay'], '7 working days')
  assert.equal(fact('empty-workspace').properties.Duration, '3 working days')
  assert.equal(fact('formal-review').properties.Duration, '5 working days in both paths')
  assert.match(fact('role-boundary').description, /excludes recruitment, consent, clinical decisions, and the identity-linking key/)
  assert.match(fact('access-gate').description, /waits for both release and empty-workspace readiness/)
})

test('graph consumers can mutate returned objects without corrupting later graphs or events', () => {
  const baseline = createSampleCaseGraph()
  const changed = createSampleCaseGraph()
  changed.nodes[0].properties.Source = 'changed'
  changed.nodes.find(node => node.kind === 'agent').focusIds.push('missing')
  changed.links[0].target = 'missing'
  changed.types[0].color = 'changed'
  changed.nodes[1].x = Infinity
  assert.deepEqual(createSampleCaseGraph(), baseline)
  assert.ok(!SAMPLE_REVIEW_EVENTS.some(event => event.relatedIds.includes('missing')))
  assert.notEqual(CASE_REVIEW_GROUPS[0].color, 'changed')
})
