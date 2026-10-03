export const PREFLIGHT_CATEGORIES = [
  { id: 'missing', label: 'Missing items', description: 'Expected documents and explicit fields that need to be added.' },
  { id: 'conflict', label: 'Conflicting instructions', description: 'Study IDs or clinic visit counts that disagree across documents.' },
  { id: 'outdated', label: 'Outdated versions', description: 'Lower numbered versions of a document type in this packet.' },
  { id: 'question', label: 'Unanswered questions', description: 'Open questions and unresolved placeholders in the supplied text.' },
]

export const CHECK_SCOPE = 'Local text checks look for protocol, consent, and onboarding documents; Study ID and onboarding Contact owner fields; conflicting Study ID or Clinic visits values; numeric versions of the same document type and study; and TODO, TBD, [?], or unanswered Question: lines. Training records and other files are not compared for version age. This is a preparation aid, not a compliance or clinical review.'

const REQUIRED_KINDS = ['protocol', 'consent', 'onboarding']
const VERSIONED_KINDS = [...REQUIRED_KINDS, 'training']
const KIND_LABELS = { protocol: 'protocol', consent: 'consent form', onboarding: 'onboarding checklist', training: 'training record', other: 'document' }
const OPEN_MARKER = /\b(?:TODO|TBD)\b|\[\?\]/i

// Field labels may be Markdown headings, bullets, or bold text. Free prose is
// deliberately not interpreted: these checks only compare explicit fields.
function plainFieldLine(line) {
  return line.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').replace(/\*\*|__/g, '')
}

function fieldsFor(lines, label) {
  const pattern = new RegExp(`^(?:${label})\\s*:\\s*(.*?)\\s*$`, 'i')
  return lines.flatMap((quote, index) => {
    const match = plainFieldLine(quote).match(pattern)
    return match ? [{ value: match[1], line: index + 1, quote }] : []
  })
}

function numericVersion(value) {
  const match = String(value ?? '').trim().match(/^v?(\d+(?:\.\d+){0,3})$/i)
  if (!match) return null
  const parts = match[1].split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

export function inferDocumentVersion(text) {
  const fields = fieldsFor(String(text ?? '').split(/\r\n|\n|\r/), 'Version|Document\\s+version')
  if (!fields.length) return ''
  const versions = fields.map(field => numericVersion(field.value))
  if (versions.some(version => !version)) return ''
  const first = versions[0]
  return versions.every(version => compareVersions(version, first) === 0) ? first.join('.') : ''
}

function normalizedStudyId(value) {
  return /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value) && !OPEN_MARKER.test(value) ? value.toUpperCase() : ''
}

function documentFamily(document) {
  // A packet is expected to contain one protocol, consent form, and onboarding
  // checklist per study. Training records can describe different people or
  // courses, so their type and study alone do not establish a document family.
  if (!REQUIRED_KINDS.includes(document.kind) || !document.studyIds.length) return ''
  const ids = document.studyIds.map(field => normalizedStudyId(field.value))
  return ids.every(id => id && id === ids[0]) ? `${document.kind}:${ids[0]}` : ''
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}

function sourceFor(document, field) {
  const firstNonempty = document.lines.findIndex(line => line.trim())
  if (!field && firstNonempty === -1) return null
  return {
    documentId: document.id,
    documentName: document.name,
    line: field?.line ?? firstNonempty + 1,
    quote: field?.quote ?? document.lines[firstNonempty],
  }
}

function stableId(key) {
  let hash = 2166136261
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return `preflight-${(hash >>> 0).toString(16)}`
}

export function analyzePacket(documents = []) {
  const packet = (Array.isArray(documents) ? documents : []).map((document, index) => {
    const safe = document && typeof document === 'object' ? document : {}
    const lines = String(safe.text ?? '').split(/\r\n|\n|\r/)
    return {
      id: String(safe.id ?? `document-${index + 1}`),
      name: String(safe.name || `Untitled document ${index + 1}`),
      kind: VERSIONED_KINDS.includes(safe.kind) ? safe.kind : 'other',
      version: String(safe.version ?? '').trim(),
      parsedVersion: numericVersion(safe.version),
      lines,
      studyIds: fieldsFor(lines, 'Study\\s+ID'),
      visits: fieldsFor(lines, '(?:Number\\s+of\\s+)?Clinic\\s+visits'),
      contacts: fieldsFor(lines, 'Contact\\s+owner|Study\\s+contact'),
    }
  })
  const findings = []
  let checksRun = 0
  const add = (key, finding) => findings.push({ id: stableId(key), ...finding, sources: (finding.sources || []).filter(Boolean) })

  for (const kind of REQUIRED_KINDS) {
    checksRun += 1
    if (!packet.some(document => document.kind === kind)) {
      add(`missing-kind:${kind}`, {
        category: 'missing', severity: 'high', title: `Add a ${KIND_LABELS[kind]}`,
        summary: `No document is classified as a ${KIND_LABELS[kind]} in this packet.`,
        recommendation: `Add the ${KIND_LABELS[kind]}, or change the document type if it is already included.`, sources: [],
      })
    }
  }

  // Only compare numbered copies within the same explicitly identified study
  // and expected document type. A different study must remain visible to the
  // identifier conflict check, even if its version number happens to be lower.
  const latestByFamily = new Map()
  for (const document of packet) {
    const family = documentFamily(document)
    if (!document.parsedVersion || !family) continue
    const previous = latestByFamily.get(family)
    if (!previous || compareVersions(document.parsedVersion, previous.parsedVersion) > 0) latestByFamily.set(family, document)
  }
  const stale = new Set()
  for (const document of packet) {
    checksRun += 1
    const latest = latestByFamily.get(documentFamily(document))
    if (!document.parsedVersion || !latest || compareVersions(document.parsedVersion, latest.parsedVersion) >= 0) continue
    stale.add(document)
    const versionSource = item => {
      const field = fieldsFor(item.lines, 'Version|Document\\s+version').find(entry => {
        const version = numericVersion(entry.value)
        return version && compareVersions(version, item.parsedVersion) === 0
      })
      return field ? sourceFor(item, field) : null
    }
    add(`outdated:${document.id}:${latest.id}`, {
      category: 'outdated', severity: 'medium', title: `An older ${KIND_LABELS[document.kind]} is included`,
      summary: `${document.name} is marked version ${document.version}; ${latest.name} is marked version ${latest.version}. These are versions supplied in this packet.`,
      recommendation: `Confirm which version is approved, then remove or archive the older copy. A higher number alone does not establish approval.`,
      sources: [versionSource(document), versionSource(latest)],
    })
  }

  const active = packet.filter(document => !stale.has(document))
  for (const document of packet) {
    checksRun += 1
    if (!document.lines.some(line => line.trim())) {
      add(`empty:${document.id}`, {
        category: 'missing', severity: 'high', title: `${document.name} has no text`,
        summary: 'The document is listed, but there is no supplied text to check.',
        recommendation: 'Paste its text or upload a text or Markdown copy before reviewing the packet.', sources: [],
      })
      continue
    }
    if (stale.has(document)) continue
    if (REQUIRED_KINDS.includes(document.kind)) {
      checksRun += 1
      if (!document.studyIds.some(field => field.value.trim())) {
        add(`missing-study:${document.id}`, {
          category: 'missing', severity: 'medium', title: `${document.name} needs a study ID`,
          summary: 'No nonempty “Study ID:” field was found in the supplied text.',
          recommendation: 'Add an explicit Study ID: field so the packet can be checked for matching identifiers.',
          sources: [sourceFor(document)],
        })
      }
    }
    if (document.kind === 'onboarding') {
      checksRun += 1
      if (!document.contacts.some(field => field.value.trim())) {
        add(`missing-contact:${document.id}`, {
          category: 'missing', severity: 'medium', title: 'The onboarding contact is missing',
          summary: `${document.name} has no nonempty “Contact owner:” or “Study contact:” field.`,
          recommendation: 'Name the person responsible for onboarding questions in a Contact owner: field.', sources: [sourceFor(document)],
        })
      }
    }
    checksRun += 1
    document.lines.forEach((quote, index) => {
      const fieldLine = plainFieldLine(quote)
      const question = /^Question\s*:\s*(.+)/i.test(fieldLine)
      const marker = OPEN_MARKER.test(quote)
      if (!question && !marker) return
      // A Question can be answered on the same line, or the next nonempty line.
      // Merely writing "Answer: TBD" still leaves it unresolved.
      let nextIndex = index + 1
      if (question) {
        while (nextIndex < document.lines.length && !document.lines[nextIndex].trim()) nextIndex += 1
      }
      const nextLine = question ? document.lines[nextIndex] : undefined
      const inlineAnswer = fieldLine.match(/\bAnswer\s*:\s*(.+)$/i)?.[1]
      const followingAnswer = nextLine && plainFieldLine(nextLine).match(/^Answer\s*:\s*(.+)$/i)?.[1]
      const answer = inlineAnswer || followingAnswer
      const answered = Boolean(answer?.trim() && !OPEN_MARKER.test(answer))
      if (!marker && (!question || answered)) return
      add(`question:${document.id}:${index + 1}`, {
        category: 'question', severity: 'low', title: question ? 'An open question needs an answer' : 'An unresolved placeholder needs attention',
        summary: `${document.name}, line ${index + 1}: ${quote.trim()}`,
        recommendation: question ? 'Add an Answer: on this line or the next nonempty line, or resolve the question in the source document.' : 'Replace the TODO, TBD, or [?] marker with a confirmed detail.',
        sources: [sourceFor(document, { line: index + 1, quote })],
      })
    })
  }

  checksRun += 1
  const studyFields = active.flatMap(document => document.studyIds
    .filter(field => normalizedStudyId(field.value))
    .map(field => ({ document, field, value: normalizedStudyId(field.value) })))
  const distinctStudyIds = [...new Set(studyFields.map(entry => entry.value))].sort()
  if (distinctStudyIds.length > 1) {
    add('conflict:study-id', {
      category: 'conflict', severity: 'high', title: 'Study IDs do not match',
      summary: `The current supplied documents name different study IDs: ${distinctStudyIds.join(', ')}.`,
      recommendation: 'Confirm the intended study and correct its Study ID: field in each affected document.',
      sources: studyFields.map(entry => sourceFor(entry.document, entry.field)),
    })
  }

  checksRun += 1
  const visitFields = active.filter(document => ['protocol', 'consent'].includes(document.kind)).flatMap(document => document.visits.flatMap(field => {
    const match = field.value.match(/^(\d{1,4})(?:\s+(?:clinic\s+)?visits?)?\.?$/i)
    return match ? [{ document, field, value: Number(match[1]) }] : []
  }))
  if (new Set(visitFields.map(entry => entry.document.kind)).size === 2 && new Set(visitFields.map(entry => entry.value)).size > 1) {
    add('conflict:clinic-visits', {
      category: 'conflict', severity: 'high', title: 'The clinic visit counts disagree',
      summary: `Protocol and consent text list different Clinic visits: values (${[...new Set(visitFields.map(entry => entry.value))].sort((a, b) => a - b).join(' and ')}).`,
      recommendation: 'Ask the study owner to confirm the visit schedule and align the protocol and consent form.',
      sources: visitFields.map(entry => sourceFor(entry.document, entry.field)),
    })
  }

  const order = { high: 0, medium: 1, low: 2 }
  findings.sort((left, right) => order[left.severity] - order[right.severity])
  return { findings, checksRun }
}

export function createSamplePacket() {
  return [
    {
      id: 'sample-protocol-v1', name: 'REST-101 protocol — v1.md', kind: 'protocol', version: '1.0',
      text: '# REST-101 study protocol\nStudy ID: REST-101\nVersion: 1.0\nClinic visits: 2\nStudy contact: Dr. Morgan Lee\n\nFictional demo study of evening research appointments.\nThis earlier draft is retained in the onboarding folder.',
    },
    {
      id: 'sample-protocol-v2', name: 'REST-101 protocol — v2.md', kind: 'protocol', version: '2.0',
      text: '# REST-101 study protocol\nStudy ID: REST-101\nVersion: 2.0\nClinic visits: 3\nStudy contact: Dr. Morgan Lee\n\nFictional demo study of evening research appointments.\nVisits take place at enrollment, week 2, and week 4.',
    },
    {
      id: 'sample-consent', name: 'REST-101 participant consent.md', kind: 'consent', version: '1.0',
      text: '# Participant consent — fictional example\nStudy ID: REST-010\nVersion: 1.0\nClinic visits: 4\nStudy contact: Dr. Morgan Lee\n\nParticipation is voluntary.\nQuestion: Who covers travel costs for evening visits?',
    },
    {
      id: 'sample-onboarding', name: 'REST-101 researcher onboarding.md', kind: 'onboarding', version: '1.0',
      text: '# Researcher onboarding — fictional example\nStudy ID: REST-101\nVersion: 1.0\n\n- Confirm training completion before requesting workspace access.\n- Prepare the research environment while access is reviewed.\n- TODO: Confirm who signs the workspace access request.',
    },
  ]
}
