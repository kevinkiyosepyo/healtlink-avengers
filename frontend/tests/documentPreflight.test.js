import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFLIGHT_CATEGORIES, CHECK_SCOPE, createSamplePacket, analyzePacket, inferDocumentVersion } from '../src/lib/documentPreflight.js'

function cleanPacket() {
  return [
    { id: 'protocol', name: 'Protocol.md', kind: 'protocol', version: '2.0', text: '# Protocol\nStudy ID: REST-101\nVersion: 2.0\nClinic visits: 3' },
    { id: 'consent', name: 'Consent.md', kind: 'consent', version: '1.0', text: '# Consent\nStudy ID: REST-101\nVersion: 1.0\nClinic visits: 3' },
    { id: 'onboarding', name: 'Onboarding.md', kind: 'onboarding', version: '1.0', text: '# Onboarding\nStudy ID: REST-101\nVersion: 1.0\nContact owner: Morgan Lee' },
  ]
}

const ofCategory = (result, category) => result.findings.filter(finding => finding.category === category)

test('the fictional sample gives six actionable findings across all four categories', () => {
  const result = analyzePacket(createSamplePacket())
  assert.equal(result.findings.length, 6)
  assert.deepEqual(PREFLIGHT_CATEGORIES.map(item => item.id), ['missing', 'conflict', 'outdated', 'question'])
  assert.deepEqual(PREFLIGHT_CATEGORIES.map(item => ofCategory(result, item.id).length), [1, 2, 1, 2])
  assert.ok(result.checksRun > result.findings.length)
  assert.match(CHECK_SCOPE, /Local text checks/)
  assert.equal(new Set(result.findings.map(finding => finding.id)).size, result.findings.length)
  assert.ok(result.findings.every(finding => finding.title && finding.summary && finding.recommendation))
})

test('fixing the sample documents removes the detected issues', () => {
  const packet = createSamplePacket().filter(document => document.id !== 'sample-protocol-v1')
  packet[1].text = packet[1].text.replace('REST-010', 'REST-101').replace('Clinic visits: 4', 'Clinic visits: 3') + '\nAnswer: The study office reimburses approved travel.'
  packet[2].text = packet[2].text.replace('- TODO: Confirm who signs the workspace access request.', 'Contact owner: Morgan Lee\nMorgan Lee signs the workspace access request.')
  assert.deepEqual(analyzePacket(packet).findings, [])
})

test('every returned citation quotes an exact source line, including Markdown and CRLF text', () => {
  const packet = createSamplePacket()
  packet[2].text = packet[2].text.replace('Study ID: REST-010', '- **Study ID:** REST-010').replaceAll('\n', '\r\n')
  const result = analyzePacket(packet)
  for (const finding of result.findings) {
    for (const source of finding.sources) {
      const document = packet.find(item => item.id === source.documentId)
      assert.ok(document)
      assert.equal(source.documentName, document.name)
      assert.ok(source.line >= 1)
      assert.equal(source.quote, document.text.split(/\r\n|\n|\r/)[source.line - 1])
    }
  }
  const studyConflict = ofCategory(result, 'conflict').find(item => item.title === 'Study IDs do not match')
  assert.ok(studyConflict.sources.some(source => source.quote === '- **Study ID:** REST-010'))
  assert.deepEqual(result, analyzePacket(packet))
})

test('matching explicit values accept case differences, Markdown, and numeric visit formatting', () => {
  const packet = cleanPacket()
  packet[1].text = '# Consent\r\n- **Study ID:** rest-101\r\n**Clinic visits:** 03 visits\r\nVersion: 1.0'
  packet[2].text = '## Study ID: Rest-101\n- __Study contact:__ Morgan Lee'
  assert.deepEqual(analyzePacket(packet).findings, [])
  packet[0].text += '\nThe planning team discussed 5 extra visits in an unrelated example.'
  packet[1].text += '\nQuestion: Is this study open? Answer: Yes, the office confirmed enrollment.'
  assert.deepEqual(analyzePacket(packet).findings, [])
})

test('versions are compared numerically and stale text is excluded from current conflicts', () => {
  const packet = cleanPacket()
  packet[0].version = 'v2.10'
  packet[0].text = packet[0].text.replace('Version: 2.0', 'Version: 2.10')
  packet.push({ id: 'old', name: 'Earlier protocol.md', kind: 'protocol', version: '2.9', text: 'Study ID: REST-101\nVersion: 2.9\nClinic visits: 8\nTODO: This old copy is archived.' })
  const result = analyzePacket(packet)
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0].category, 'outdated')
  assert.equal(result.findings[0].sources[0].quote, 'Version: 2.9')
  assert.equal(result.findings[0].sources[1].quote, 'Version: 2.10')
  packet[3].version = '2.10.0'
  packet[3].text = packet[0].text
  assert.deepEqual(analyzePacket(packet).findings, [])
})

test('unknown version labels and unrelated other documents are not declared outdated', () => {
  const packet = cleanPacket()
  packet.push({ id: 'draft', name: 'Draft.md', kind: 'protocol', version: 'draft', text: 'Study ID: REST-101\nClinic visits: 3' })
  packet.push({ id: 'notes', name: 'Notes.md', kind: 'other', version: '1.0', text: 'Research preparation notes' })
  packet.push({ id: 'plan', name: 'Plan.md', kind: 'other', version: '8.0', text: 'Workspace plan' })
  assert.deepEqual(analyzePacket(packet).findings, [])
})

test('a lower version from another study stays visible to the study identifier check', () => {
  const packet = cleanPacket()
  packet.push({ id: 'different-study', name: 'Other study protocol.md', kind: 'protocol', version: '1.0', text: 'Study ID: OTHER-202\nVersion: 1.0\nClinic visits: 3\nTODO: Confirm owner.' })
  const result = analyzePacket(packet)
  assert.equal(ofCategory(result, 'outdated').length, 0)
  assert.ok(ofCategory(result, 'conflict').some(finding => finding.title === 'Study IDs do not match' && finding.sources.some(source => source.documentId === 'different-study')))
  assert.equal(ofCategory(result, 'question').length, 1)
})

test('training records and documents without a definite study ID are not grouped as old copies', () => {
  const packet = cleanPacket()
  packet.push({ id: 'training-a', name: 'Lab safety training.md', kind: 'training', version: '1.0', text: 'Study ID: REST-101\nVersion: 1.0\nTODO: Attach attendance.' })
  packet.push({ id: 'training-b', name: 'Data privacy training.md', kind: 'training', version: '4.0', text: 'Study ID: REST-101\nVersion: 4.0' })
  packet.push({ id: 'unidentified', name: 'Unidentified protocol.md', kind: 'protocol', version: '1.0', text: '# Protocol\nVersion: 1.0' })
  const result = analyzePacket(packet)
  assert.equal(ofCategory(result, 'outdated').length, 0)
  assert.equal(ofCategory(result, 'question').length, 1)
  assert.ok(ofCategory(result, 'missing').some(finding => finding.title === 'Unidentified protocol.md needs a study ID'))
})

test('version inference accepts explicit plain and Markdown fields and normalizes numeric components', () => {
  for (const text of [
    'Version: 2.0', '**Version:** 2.0', '**Version**: 2.0', '## Version: 2.0',
    'Document version: 2.0', '- **Document version:** v02.00', '__Version:__ 2.0',
    '# Title\r\nVersion: 2.0\r\nStudy ID: REST-101',
  ]) assert.equal(inferDocumentVersion(text), '2.0', text)
  assert.equal(inferDocumentVersion('Version: v002.010.0003'), '2.10.3')
  assert.equal(inferDocumentVersion('Version: 2.0\nDocument version: v2.0.0'), '2.0')
})

test('version inference rejects unsupported values or conflicting declarations without truncating them', () => {
  for (const text of [
    'Version: 2.0-draft', 'Version: 2.0 approved', 'Version: 2.0.1.2.3',
    'Version: latest', 'Version: ', 'We discussed Version: 2.0', 'Version: -2',
    'Version: 2.0\nVersion: 3.0', 'Version: 2.0\nDocument version: draft',
    'Version: 9007199254740992', undefined, null,
  ]) assert.equal(inferDocumentVersion(text), '', String(text))
})

test('missing document types, empty text, and missing required fields are reported without invented citations', () => {
  const empty = analyzePacket([])
  assert.equal(empty.findings.length, 3)
  assert.ok(empty.findings.every(finding => finding.category === 'missing' && finding.sources.length === 0))
  const packet = cleanPacket()
  packet[0].text = ' \n\t'
  packet[1].text = '# Consent\nStudy ID: '
  packet[2].text = '# Onboarding\nStudy ID: REST-101\nContact owner: '
  const result = analyzePacket(packet)
  assert.equal(result.findings.length, 3)
  assert.equal(result.findings.find(finding => finding.title.includes('no text')).sources.length, 0)
  assert.ok(result.findings.some(finding => finding.title.includes('needs a study ID')))
  assert.ok(result.findings.some(finding => finding.title.includes('contact is missing')))
})

test('unanswered questions and literal placeholders are detected without substring matches', () => {
  const packet = cleanPacket()
  packet[0].text += '\nQuestion: Who issues access?\n\nAnswer: Morgan Lee.\nQuestion: Is orientation complete? Answer: Yes.\nTODO: Assign a reviewer.\nDevice availability: TBD\nWorkspace owner: [?]\nTodos Santos is a place name.\nQuestion: Which workspace can I use?'
  const questions = ofCategory(analyzePacket(packet), 'question')
  assert.equal(questions.length, 4)
  assert.ok(questions.every(finding => !finding.sources[0].quote.startsWith('Todos')))
  assert.equal(questions.filter(finding => finding.title === 'An open question needs an answer').length, 1)
  packet[0].text += '\nAnswer: TBD'
  assert.ok(ofCategory(analyzePacket(packet), 'question').some(finding => finding.sources[0].quote === 'Question: Which workspace can I use?'))
})

test('ambiguous clinic visit prose is not interpreted as a structured count', () => {
  const packet = cleanPacket()
  packet[1].text = packet[1].text.replace('Clinic visits: 3', 'Clinic visits: 3–4 depending on availability')
  assert.equal(ofCategory(analyzePacket(packet), 'conflict').length, 0)
  packet[1].text = packet[1].text.replace('3–4 depending on availability', '4')
  const conflict = ofCategory(analyzePacket(packet), 'conflict')
  assert.equal(conflict.length, 1)
  assert.equal(conflict[0].title, 'The clinic visit counts disagree')
  assert.equal(conflict[0].sources.length, 2)
})

test('inputs and sample documents remain independent between runs', () => {
  const packet = createSamplePacket()
  const original = JSON.stringify(packet)
  const result = analyzePacket(packet)
  result.findings[0].sources[0].quote = 'Changed by a consumer'
  assert.equal(JSON.stringify(packet), original)
  packet[0].text = 'Changed sample'
  assert.notEqual(createSamplePacket()[0].text, packet[0].text)
  assert.doesNotThrow(() => analyzePacket(null))
  assert.doesNotThrow(() => analyzePacket([null, {}, { text: undefined }]))
})
