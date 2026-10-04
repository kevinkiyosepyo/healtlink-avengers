import { inflate } from 'fflate'

export const IMPORT_LIMITS = Object.freeze({
  documents: 12, documentChars: 40000, overviewChars: 10000,
  transcriptChars: 40000, contextChars: 120000,
  fileBytes: 15 * 1024 * 1024, expandedBytes: 30 * 1024 * 1024,
})
export const SIMULATION_IMPORT_ACCEPT = '.pdf,.md,.markdown,.txt,.zip,application/pdf,text/plain,text/markdown,application/zip,application/x-zip-compressed'
const supported = new Set(['pdf', 'md', 'markdown', 'txt'])
const utf8 = new TextDecoder('utf-8', { fatal: true })
const extension = name => name.toLowerCase().split('.').pop()
const failure = message => { throw new Error(message) }

export function validateSimulationContext(context = {}) {
  if (typeof context.overview !== 'string' || typeof context.transcript !== 'string' || !Array.isArray(context.documents)) return 'The study context could not be read. Please reopen the setup.'
  if (context.overview.length > IMPORT_LIMITS.overviewChars) return 'Shorten the study overview to 10,000 characters or fewer.'
  if (context.transcript.length > IMPORT_LIMITS.transcriptChars) return 'Shorten the transcript to 40,000 characters or fewer. Your text is still available to edit.'
  if (context.documents.length > IMPORT_LIMITS.documents) return 'Use up to 12 documents per simulation.'
  for (const doc of context.documents) {
    if (!doc || typeof doc.text !== 'string' || !doc.text.trim()) return `Add readable text to ${doc?.name || 'each document'}, or remove it.`
    if (doc.text.length > IMPORT_LIMITS.documentChars) return `${doc.name || 'A document'} exceeds 40,000 characters. Shorten its text or remove it.`
  }
  if (context.overview.length + context.transcript.length + context.documents.reduce((total, doc) => total + doc.text.length, 0) > IMPORT_LIMITS.contextChars) return 'The combined study context exceeds 120,000 characters. Shorten the overview, transcript, or documents.'
  return ''
}

function safePath(name) {
  return name && !name.includes('\\') && !name.startsWith('/') && !/^[A-Za-z]:/.test(name) && !/[\u0000-\u001f]/.test(name) && !name.split('/').some(part => part === '..' || part === '.')
}

// Inspect the central directory before asking the inflater to allocate output buffers.
// ZIP64, encrypted files, symlinks, nested archives, and unsafe paths are intentionally unsupported.
export function inspectZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 22) failure('The ZIP file is incomplete or invalid.')
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break }
  }
  if (end < 0) failure('The ZIP file is incomplete or invalid.')
  const count = view.getUint16(end + 10, true)
  const start = view.getUint32(end + 16, true)
  const directorySize = view.getUint32(end + 12, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || start === 0xffffffff || directorySize === 0xffffffff) failure('Split and ZIP64 archives are not supported. Upload the documents directly.')
  if (count > 100 || start + directorySize !== end) failure('This ZIP is too complex or invalid. Upload up to 12 documents directly.')
  const entries = []
  const seen = new Set()
  let cursor = start
  let expanded = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) failure('The ZIP directory is invalid.')
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressed = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const offset = view.getUint32(cursor + 42, true)
    if (cursor + 46 + nameLength + extraLength + commentLength > end) failure('The ZIP directory is incomplete.')
    let name
    try { name = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)) } catch { failure('ZIP filenames must use UTF-8. Rename the files and try again.') }
    if (!safePath(name) || seen.has(name)) failure('The ZIP contains an unsafe or duplicate path. Upload the documents directly.')
    seen.add(name)
    if (flags & 1 || ![0, 8].includes(method) || size === 0xffffffff || compressed === 0xffffffff || ((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000) failure('Encrypted files, links, and this ZIP compression format are not supported.')
    if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50) failure('The ZIP file header is invalid.')
    const localNameLength = view.getUint16(offset + 26, true)
    const dataStart = offset + 30 + localNameLength + view.getUint16(offset + 28, true)
    if (dataStart + compressed > start || view.getUint16(offset + 8, true) !== method || view.getUint16(offset + 6, true) !== flags) failure('The ZIP file metadata does not match its contents.')
    let localName
    try { localName = utf8.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)) } catch { failure('The ZIP file header is invalid.') }
    if (localName !== name) failure('The ZIP file paths do not match their headers.')
    expanded += size
    if (expanded > IMPORT_LIMITS.expandedBytes) failure('The ZIP expands beyond 30 MB. Use a smaller archive.')
    if (size > IMPORT_LIMITS.fileBytes) failure(`${name} exceeds the 15 MB file limit.`)
    const ignored = name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').pop() === '.DS_Store'
    if (!ignored && !supported.has(extension(name))) failure(`${name} is not a PDF, Markdown, or text file. Nested ZIP files are not supported.`)
    if (!ignored) entries.push({ name, size, compressed, method, dataStart, crc: view.getUint32(cursor + 16, true) })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor !== end) failure('The ZIP directory is invalid.')
  if (!entries.length) failure('The ZIP contains no supported documents.')
  if (entries.length > IMPORT_LIMITS.documents) failure('The ZIP contains more than 12 documents. Use a smaller archive.')
  return entries
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let j = 0; j < 8; j++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1
  return i >>> 0
})
function checksum(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export async function extractPdfText(bytes) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loading = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true })
  let pdf
  try {
    pdf = await loading.promise
    if (pdf.numPages > 200) failure('This PDF exceeds 200 pages. Import a shorter excerpt.')
    const pages = []
    let length = 0
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim()
      length += text.length + 2
      if (length > IMPORT_LIMITS.documentChars) failure('This PDF exceeds 40,000 extracted characters. Import a shorter excerpt.')
      pages.push(text)
      page.cleanup()
    }
    const text = pages.join('\n\n').trim()
    if (!text) failure('No readable text was found in this PDF. Scanned pages need OCR first, or you can dictate the study context.')
    return text
  } catch (error) {
    if (error?.name === 'PasswordException') failure('This PDF is password protected. Upload an unlocked copy.')
    throw error
  } finally { await loading.destroy() }
}

export async function importSimulationFile(file, { pdfReader = extractPdfText, id = () => globalThis.crypto.randomUUID(), documentChars = IMPORT_LIMITS.documentChars } = {}) {
  if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size)) failure('Choose a valid file.')
  if (file.size > IMPORT_LIMITS.fileBytes) failure(`${file.name} exceeds the 15 MB file limit.`)
  if (file.size === 0) failure(`${file.name} is empty.`)
  const kind = extension(file.name)
  if (kind !== 'zip' && !supported.has(kind)) failure('Choose a PDF, Markdown (.md), text (.txt), or ZIP file.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > IMPORT_LIMITS.fileBytes) failure(`${file.name} exceeds the 15 MB file limit.`)
  let inputs = [{ name: file.name, bytes }]
  if (kind === 'zip') {
    const entries = inspectZip(bytes)
    inputs = []
    for (const entry of entries) {
      const compressed = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed)
      let content
      if (entry.method === 0) content = compressed.slice()
      else content = await new Promise((resolve, reject) => {
        let terminate
        const timeout = setTimeout(() => { terminate?.(); reject(new Error(`${entry.name} took too long to extract. Upload the document directly.`)) }, 5000)
        try {
          // Always decompress in a worker with a bounded output allocation. A deceptive
          // DEFLATE stream cannot freeze the UI and its worker is terminated on timeout.
          // The extra byte detects a dishonest original-size header, including zero.
          terminate = inflate(compressed, { size: entry.size + 1 }, (error, output) => {
            clearTimeout(timeout)
            if (error) reject(new Error(`${entry.name} could not be extracted. The ZIP may be damaged.`))
            else resolve(output)
          })
        } catch { clearTimeout(timeout); reject(new Error('ZIP extraction is unavailable in this browser. Upload the documents directly.')) }
      })
      if (!content || content.length !== entry.size || checksum(content) !== entry.crc) failure(`${entry.name} failed the ZIP integrity check.`)
      inputs.push({ name: entry.name, bytes: content })
    }
  }
  const documents = []
  for (const input of inputs) {
    const kind = extension(input.name) === 'pdf' ? 'pdf' : extension(input.name) === 'txt' ? 'text' : 'markdown'
    let text
    if (kind === 'pdf') text = await pdfReader(input.bytes)
    else {
      try { text = utf8.decode(input.bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim() } catch { failure(`${input.name} is not UTF-8 text. Save it as UTF-8 and try again.`) }
      if (text.includes('\u0000')) failure(`${input.name} appears to contain binary data.`)
    }
    if (!text.trim()) failure(`${input.name} contains no readable text.`)
    if (text.length > documentChars) failure(`${input.name} exceeds ${documentChars.toLocaleString('en-US')} characters. Import a shorter excerpt.`)
    documents.push({ id: id(), name: input.name, kind, text })
  }
  return documents
}
