import test from 'node:test'
import assert from 'node:assert/strict'
import { GRAPH_TYPES, createSimulationGraph, stepLayout, settleLayout, getNeighborhood, fitGraph, zoomCamera } from '../src/lib/simulationGraph.js'

test('sample graph is deterministic, typed, and clearly identified as illustrative', () => {
  const first = createSimulationGraph()
  assert.deepEqual(first, createSimulationGraph())
  assert.equal(first.nodes.length, 37)
  assert.equal(first.links.length, 84)
  const types = new Set(GRAPH_TYPES.map(type => type.id))
  assert.equal(new Set(first.nodes.map(node => node.id)).size, first.nodes.length)
  for (const node of first.nodes) {
    assert.ok(types.has(node.type))
    assert.equal(node.properties.Source, 'Illustrative demo')
    assert.ok(node.label && node.description)
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y))
    assert.equal(node.vx, 0)
    assert.equal(node.vy, 0)
  }
})

test('run IDs seed positions, titles describe the scenario, and agent counts are bounded', () => {
  const run = { id: 'run-a', prompt: 'Explore a new workflow', agentCount: 12 }
  const graph = createSimulationGraph(run, 'Workflow scenario')
  assert.deepEqual(graph, createSimulationGraph(run, 'Workflow scenario'))
  assert.equal(graph.nodes[0].label, 'Workflow scenario')
  assert.equal(createSimulationGraph(run).nodes[0].label, run.prompt)
  assert.notDeepEqual(graph.nodes.map(node => [node.x, node.y]), createSimulationGraph({ ...run, id: 'run-b' }).nodes.map(node => [node.x, node.y]))
  for (const [count, expected] of [[0, 1], [-10, 1], [3.8, 3], [10000, 24], [NaN, 12]]) {
    assert.equal(createSimulationGraph({ agentCount: count }).nodes.filter(node => node.type === 'agent').length, expected)
  }
})

test('every node belongs to a connected network with valid unique non-self links', () => {
  for (const agentCount of [1, 12, 24]) {
    const { nodes, links } = createSimulationGraph({ id: 'connected', agentCount })
    const ids = new Set(nodes.map(node => node.id))
    assert.equal(new Set(links.map(link => link.id)).size, links.length)
    for (const link of links) {
      assert.ok(ids.has(link.source) && ids.has(link.target))
      assert.notEqual(link.source, link.target)
      assert.equal(typeof link.source, 'string')
      assert.equal(typeof link.target, 'string')
    }
    const visited = new Set(['scenario'])
    const remaining = ['scenario']
    while (remaining.length) {
      for (const id of getNeighborhood(remaining.pop(), links)) {
        if (!visited.has(id)) { visited.add(id); remaining.push(id) }
      }
    }
    assert.equal(visited.size, nodes.length)
    for (const node of nodes.filter(node => node.type === 'agent')) {
      assert.ok(getNeighborhood(node.id, links).size >= 5)
    }
  }
})

test('layout settles to finite, bounded positions without mutating link identities', () => {
  const { nodes, links } = createSimulationGraph({ id: 'layout' })
  const originalLinks = structuredClone(links)
  const initialPositions = nodes.map(node => [node.x, node.y])
  settleLayout(nodes, links, 200)
  assert.notDeepEqual(nodes.map(node => [node.x, node.y]), initialPositions)
  let speed
  for (let index = 0; index < 300; index++) speed = stepLayout(nodes, links, { alpha: 0.05 })
  assert.ok(speed < 0.2, `Expected settled motion, got ${speed}`)
  for (const node of nodes) {
    for (const key of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(node[key]))
    assert.ok(Math.abs(node.x) < 1000 && Math.abs(node.y) < 1000)
  }
  assert.deepEqual(links, originalLinks)
})

test('dragging pins only the chosen node and releasing it resumes the layout', () => {
  const { nodes, links } = createSimulationGraph()
  const dragged = nodes[4]
  dragged.fx = 325
  dragged.fy = -120
  settleLayout(nodes, links)
  assert.equal(dragged.x, 325)
  assert.equal(dragged.y, -120)
  assert.equal(dragged.vx, 0)
  assert.equal(dragged.vy, 0)
  delete dragged.fx
  delete dragged.fy
  stepLayout(nodes, links)
  assert.ok(dragged.x !== 325 || dragged.y !== -120)
})

test('coincident positions and malformed motion values recover without NaN', () => {
  const { nodes, links } = createSimulationGraph()
  for (const node of nodes) { node.x = 0; node.y = 0; node.vx = NaN; node.vy = Infinity }
  nodes[0].x = NaN
  links.push({ id: 'missing-endpoint', source: 'missing', target: 'scenario' })
  settleLayout(nodes, links, 150)
  assert.ok(nodes.every(node => [node.x, node.y, node.vx, node.vy].every(Number.isFinite)))
  assert.ok(new Set(nodes.map(node => `${node.x},${node.y}`)).size > 1)
})

test('fit camera centers all nodes inside the viewport with padding', () => {
  const { nodes } = createSimulationGraph()
  const camera = fitGraph(nodes, 1100, 850, 80)
  for (const node of nodes) {
    const x = camera.x + node.x * camera.k
    const y = camera.y + node.y * camera.k
    assert.ok(x - node.radius * camera.k >= 80 - 1e-6)
    assert.ok(x + node.radius * camera.k <= 1020 + 1e-6)
    assert.ok(y - node.radius * camera.k >= 80 - 1e-6)
    assert.ok(y + node.radius * camera.k <= 770 + 1e-6)
  }
  assert.deepEqual(fitGraph([], 800, 600), { x: 400, y: 300, k: 1 })
  assert.equal(fitGraph(nodes, 0, 0).k, 0.25)
})

test('zoom preserves the world position beneath the cursor, including at scale limits', () => {
  const camera = { x: 150, y: -20, k: 0.8 }
  const point = { x: 470, y: 350 }
  const world = { x: (point.x - camera.x) / camera.k, y: (point.y - camera.y) / camera.k }
  for (const factor of [0.5, 1.5, 0.0001, 1000]) {
    const next = zoomCamera(camera, factor, point)
    assert.ok(next.k >= 0.25 && next.k <= 3)
    assert.ok(Math.abs(next.x + world.x * next.k - point.x) < 1e-9)
    assert.ok(Math.abs(next.y + world.y * next.k - point.y) < 1e-9)
  }
  assert.deepEqual(camera, { x: 150, y: -20, k: 0.8 })
})
