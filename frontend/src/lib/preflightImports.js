import { importSimulationFile, IMPORT_LIMITS } from './simulationImports.js'
import { inferDocumentVersion } from './documentPreflight.js'

export const PREFLIGHT_IMPORT_ACCEPT = '.txt,.md,.markdown,.zip,text/plain,text/markdown,application/zip,application/x-zip-compressed'
export const PREFLIGHT_LIMITS = Object.freeze({ documents: 12, documentChars: 100000, packetChars: 500000, textFileBytes: 1024 * 1024 })

function inferKind(path) {
  // An archive's parent folder does not establish the document's type.
  const name = path.split('/').pop()
  if (/protocol/i.test(name)) return 'protocol'
  if (/consent/i.test(name)) return 'consent'
  if (/onboard|checklist/i.test(name)) return 'onboarding'
  if (/training|certificate/i.test(name)) return 'training'
  return 'other'
}

export async function importPreflightFiles(files, { existingDocuments = [], id } = {}) {
  const added = []
  const errors = []
  let total = existingDocuments.reduce((sum, document) => sum + document.text.length, 0)
  for (const file of Array.from(files || [])) {
    try {
      if (!/\.(txt|md|markdown|zip)$/i.test(file.name)) throw new Error('Choose text, Markdown, or a ZIP containing those documents.')
      const isZip = /\.zip$/i.test(file.name)
      if (file.size > (isZip ? IMPORT_LIMITS.fileBytes : PREFLIGHT_LIMITS.textFileBytes)) {
        throw new Error(isZip ? 'The ZIP exceeds the 15 MB file limit.' : 'The text file exceeds the 1 MB file limit.')
      }
      const remaining = PREFLIGHT_LIMITS.documents - existingDocuments.length - added.length
      if (remaining <= 0) throw new Error('The packet already has 12 documents. Remove one before adding more.')
      const imported = await importSimulationFile(file, {
        ...(id ? { id } : {}),
        documentChars: PREFLIGHT_LIMITS.documentChars,
        pdfReader: async () => { throw new Error('Document preflight accepts text and Markdown inside ZIPs. Import PDF study materials through New simulation.') },
      })
      // Each file or archive is accepted as a whole. Never silently drop its later documents.
      if (imported.length > remaining) throw new Error(`This archive contains ${imported.length} documents, but the packet has room for ${remaining}. Remove documents or use a smaller ZIP; nothing from this archive was added.`)
      const size = imported.reduce((sum, document) => sum + document.text.length, 0)
      if (total + size > PREFLIGHT_LIMITS.packetChars) throw new Error('These documents exceed the 500,000 character packet limit. Nothing from this file was added.')
      added.push(...imported.map(document => ({
        id: document.id, name: document.name, text: document.text,
        kind: inferKind(document.name), version: inferDocumentVersion(document.text),
      })))
      total += size
    } catch (error) {
      errors.push(`${file.name}: ${error.message || 'This file could not be imported.'}`)
    }
  }
  return { added, errors }
}
