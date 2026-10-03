import test from 'node:test'
import assert from 'node:assert/strict'
import { SAMPLE_DAY0, SAMPLE_PROTOCOL, SAMPLE_SOURCE, buildStudy, extractSource, generateQueries } from '../src/lib/studyBuild.js'

test('protocol parses into a schedule of activities, CRF, edit checks and burden', () => {
  const build = buildStudy(SAMPLE_PROTOCOL)
  assert.deepEqual(build.visits.map((v) => [v.id, v.day, v.window]), [['v1', -14, 3], ['v2', 0, 0], ['v3', 14, 2], ['v4', 28, 3], ['v5', 56, 3]])
  assert.equal(build.forms.length, 10)
  assert.ok(build.forms.every((f) => f.known))
  const sbp = build.forms.find((f) => f.id === 'vitals').fields.find((f) => f.name === 'systolic_bp')
  assert.equal(sbp.max, 150, 'protocol Range: line overrides the library')
  assert.deepEqual(build.overrides, [{ field: 'systolic_bp', min: 90, max: 150, line: 11 }])
  assert.ok(build.editChecks.some((c) => c.type === 'window' && c.visit === 'v3'))
  assert.deepEqual(build.burden[0], { visit: 'v1', participantMin: 85, siteMin: 95, fields: 12 })
  assert.equal(build.totals.participantMin, 85 + 65 + 35 + 60 + 70)
  assert.deepEqual(build.warnings, [])
})

test('unknown assessments, missing windows and overlapping visits become warnings', () => {
  const build = buildStudy('Visit 1 — Screen (Day -7 ± 7): vitals, mri scan\nVisit 2 — Week 1 (Day 2 ± 3): vitals\nVisit 3 — Day 9 (Day 9): vitals\nRange: nope 1-2')
  const messages = build.warnings.map((w) => w.message)
  assert.ok(messages.some((m) => m.includes('"mri scan"')))
  assert.ok(messages.some((m) => m.includes('no visit window')))
  assert.ok(messages.some((m) => m.includes('overlaps')))
  assert.ok(messages.some((m) => m.includes('unknown field "nope"')))
  assert.equal(build.forms.find((f) => f.id === 'mri scan').known, false)
  assert.deepEqual(buildStudy('').warnings.map((w) => w.line), [0])
})

test('source extraction keeps line references and queries flag range and window problems', () => {
  const build = buildStudy(SAMPLE_PROTOCOL)
  const extraction = extractSource(build, 'v3', SAMPLE_SOURCE)
  assert.equal(extraction.values.systolic_bp.raw, '162')
  assert.equal(extraction.values.diastolic_bp.raw, '88')
  assert.equal(extraction.values.heart_rate.raw, '71')
  assert.equal(extraction.values.total_sleep.raw, '6.5')
  assert.equal(extraction.values.ae_reported.raw, 'no')
  assert.equal(extraction.values.systolic_bp.line, 4)
  const queries = generateQueries(extraction, { day0Date: SAMPLE_DAY0 })
  assert.deepEqual(queries.map((q) => [q.severity, q.type, q.field]), [['high', 'range', 'systolic_bp'], ['high', 'window', 'visit_date']])
  assert.match(queries[1].message, /day 18; the protocol window is day 14 ± 2/)
})

test('missing required fields and invalid values are queried; clean notes produce none', () => {
  const build = buildStudy(SAMPLE_PROTOCOL)
  const sparse = generateQueries(extractSource(build, 'v3', 'Visit date: 2026-10-19\nHR fast\nAE reported: maybe'), { day0Date: SAMPLE_DAY0 })
  const types = sparse.map((q) => `${q.type}:${q.field}`)
  assert.ok(types.includes('missing:systolic_bp'))
  assert.ok(types.includes('missing:total_sleep'))
  assert.ok(types.includes('invalid:ae_reported'))
  const clean = 'Visit date: 2026-10-19\nBP 128/80\nHR 66\nTotal sleep: 7 h\nAE reported: no'
  assert.deepEqual(generateQueries(extractSource(build, 'v3', clean), { day0Date: SAMPLE_DAY0 }), [])
  assert.deepEqual(generateQueries(extractSource(build, 'v99', clean)), [])
})
