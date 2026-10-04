import {
  assertBoundedData,
  assertValidProject,
  DATA_LIMITS,
} from "./storage.js";

export const PACKET_VERSION = 1;
const recordSemantics = Object.freeze({
  project:
    "Exact saved project record; stored fields may differ from the current source text.",
  readiness:
    "Effective calculation from the current source packet. Use this record for current requirement labels, states, dates, and actions; consult valid/errors before relying on the calculation.",
});
const packetRecord = (project, readiness) => ({
  schemaVersion: PACKET_VERSION,
  kind: "readiness-project",
  recordSemantics,
  project,
  readiness,
});
export const INTAKE_LIMITS = Object.freeze({
  maxFiles: 40,
  maxFileBytes: 12000000,
  maxBatchBytes: 32000000,
  maxZipEntries: 80,
  maxExpandedBytes: 24000000,
  maxDocumentChars: 400000,
  maxTotalChars: 2000000,
  maxPdfPages: 200,
});
const SUPPORTED = new Set(["txt", "md", "pdf", "docx"]);
const extension = (name) =>
  String(name || "")
    .split(".")
    .pop()
    .toLowerCase();
const messageOf = (error) =>
  String(error?.message || "This file could not be read.");
const normalizeText = (text) =>
  String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "");
const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function checkZipDirectory(bytes, maxEntries) {
  // Inspect the bounded central-directory metadata before JSZip allocates an
  // object per entry. ZIP64/multipart archives are unnecessary for these limits.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let index = bytes.length - 22;
    index >= Math.max(0, bytes.length - 65557);
    index--
  ) {
    if (
      view.getUint32(index, true) === 0x06054b50 &&
      index + 22 + view.getUint16(index + 20, true) === bytes.length
    ) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error("The ZIP directory is missing or damaged.");
  const count = view.getUint16(end + 10, true);
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    count === 65535
  )
    throw new Error("Multipart and ZIP64 archives are not supported.");
  if (count > maxEntries)
    throw new Error(
      `This package contains too many ZIP entries (limit ${maxEntries}).`,
    );
  let offset = view.getUint32(end + 16, true),
    expanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("The ZIP directory is damaged.");
    const size = view.getUint32(offset + 24, true);
    if (size === 0xffffffff)
      throw new Error("ZIP64 archives are not supported.");
    expanded += size;
    if (expanded > INTAKE_LIMITS.maxExpandedBytes)
      throw new Error(
        "ZIP package contents exceed the 24 MB expanded size limit.",
      );
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  if (offset > end) throw new Error("The ZIP directory is damaged.");
}

function decodeText(bytes) {
  let decoder = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) decoder = "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) decoder = "utf-16be";
  try {
    return new TextDecoder(decoder, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "Text encoding is unsupported. Save this document as UTF-8 text and try again.",
    );
  }
}

async function pdfText(bytes) {
  const pdfjs =
    typeof window === "undefined"
      ? await import("pdfjs-dist/legacy/build/pdf.mjs")
      : await import("pdfjs-dist/build/pdf.mjs");
  if (typeof window !== "undefined") {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const loading = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  let pdf;
  try {
    pdf = await loading.promise;
    if (pdf.numPages > INTAKE_LIMITS.maxPdfPages)
      throw new Error(
        `PDFs can contain at most ${INTAKE_LIMITS.maxPdfPages} pages.`,
      );
    const pages = [];
    let total = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "",
        previousY = null,
        previousEndX = null;
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        const x = item.transform?.[4],
          y = item.transform?.[5];
        if (
          text &&
          !text.endsWith("\n") &&
          previousY !== null &&
          y !== undefined &&
          Math.abs(y - previousY) > 2
        )
          text += "\n";
        else if (
          text &&
          !/\s$/.test(text) &&
          item.str &&
          !/^\s/.test(item.str) &&
          Number.isFinite(x) &&
          Number.isFinite(previousEndX) &&
          x - previousEndX > 1
        )
          text += " ";
        text += item.str;
        if (item.hasEOL) text += "\n";
        previousY = y ?? null;
        previousEndX = Number.isFinite(x) ? x + (item.width || 0) : null;
        if (total + text.length > INTAKE_LIMITS.maxDocumentChars)
          throw new Error(
            "The PDF contains too much extracted text (400,000 character limit).",
          );
      }
      pages.push(text);
      total += text.length + 2;
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    await loading.destroy();
  }
}

async function extractText(bytes, format) {
  if (format === "txt" || format === "md") return decodeText(bytes);
  if (format === "pdf") return pdfText(bytes);
  if (format === "docx") {
    const module = await import("mammoth/mammoth.browser.js");
    const mammoth = module.default || module;
    // DOCX is itself a ZIP. Inspect declared expansion before handing it to
    // Mammoth, which otherwise inflates the complete document in memory.
    checkZipDirectory(bytes, 2000);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    let expanded = 0;
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const content = await boundedZipBytes(
        entry,
        INTAKE_LIMITS.maxExpandedBytes - expanded,
      );
      expanded += content.byteLength;
      if (expanded > INTAKE_LIMITS.maxExpandedBytes)
        throw new Error("This Word document expands beyond the 24 MB limit.");
    }
    const result = await mammoth.extractRawText({
      arrayBuffer: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    });
    return result.value;
  }
  throw new Error(
    "Supported document formats are TXT, MD, PDF, and DOCX. ZIP packages may contain these formats.",
  );
}

async function boundedZipBytes(entry, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0,
      rejected = false;
    const stream = entry.internalStream("uint8array");
    stream.on("data", (chunk) => {
      if (rejected) return;
      length += chunk.length;
      if (length > maxBytes) {
        rejected = true;
        stream.pause();
        reject(new Error("The expanded file exceeds the document size limit."));
      } else chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (rejected) return;
      const result = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(result);
    });
    stream.resume();
  });
}

/** Local-only extraction. Source line numbers refer to this stored text. */
export async function readDocuments(files) {
  const documents = [],
    errors = [];
  let batchBytes = 0,
    expandedBytes = 0,
    totalChars = 0,
    attemptedFiles = 0,
    inputCount = 0;
  const fail = (name, message) => errors.push({ name, message });
  async function readOne(name, bytes, format) {
    if (++attemptedFiles > INTAKE_LIMITS.maxFiles)
      throw new Error(
        "A batch can contain at most 40 documents, including files inside ZIPs.",
      );
    if (bytes.byteLength > INTAKE_LIMITS.maxFileBytes)
      throw new Error("This file exceeds the 12 MB limit.");
    const text = normalizeText(await extractText(bytes, format));
    if (!text.trim())
      throw new Error(
        format === "pdf"
          ? "No selectable text was found in this PDF. Scanned PDFs need OCR before import."
          : "No text was found in this document.",
      );
    if (text.length > INTAKE_LIMITS.maxDocumentChars)
      throw new Error("This document exceeds the 400,000 character limit.");
    if (totalChars + text.length > INTAKE_LIMITS.maxTotalChars)
      throw new Error("This batch exceeds the 2,000,000 character limit.");
    totalChars += text.length;
    documents.push({
      id: newId(),
      name: String(name).slice(0, 500),
      kind: "source",
      format,
      text,
    });
  }
  for (const file of files || []) {
    if (++inputCount > INTAKE_LIMITS.maxFiles) {
      fail(
        "Import batch",
        "Select at most 40 files at a time. Additional files were skipped.",
      );
      break;
    }
    const name = String(file?.name || "Untitled document");
    try {
      const format = extension(name);
      if (!SUPPORTED.has(format) && format !== "zip")
        throw new Error("Unsupported format. Use TXT, MD, PDF, DOCX, or ZIP.");
      if (
        !Number.isFinite(file?.size) ||
        file.size < 0 ||
        file.size > INTAKE_LIMITS.maxFileBytes
      )
        throw new Error(
          "This file exceeds the 12 MB limit or has an invalid size.",
        );
      if (batchBytes + file.size > INTAKE_LIMITS.maxBatchBytes)
        throw new Error("The selected files exceed the 32 MB batch limit.");
      batchBytes += file.size;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > INTAKE_LIMITS.maxFileBytes)
        throw new Error("This file exceeds the 12 MB limit.");
      if (format !== "zip") {
        await readOne(name, bytes, format);
        continue;
      }
      checkZipDirectory(bytes, INTAKE_LIMITS.maxZipEntries * 2);
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(bytes);
      const entries = Object.values(zip.files).filter(
        (entry) =>
          !entry.dir &&
          !entry.name.startsWith("__MACOSX/") &&
          !entry.name.endsWith(".DS_Store"),
      );
      if (!entries.length)
        throw new Error("This ZIP package contains no files.");
      if (entries.length > INTAKE_LIMITS.maxZipEntries)
        throw new Error("ZIP packages can contain at most 80 files.");
      let declaredBytes = 0;
      for (const entry of entries) {
        const size = entry._data?.uncompressedSize;
        if (!Number.isFinite(size) || size < 0)
          throw new Error("This ZIP package has invalid size metadata.");
        declaredBytes += size;
      }
      if (expandedBytes + declaredBytes > INTAKE_LIMITS.maxExpandedBytes)
        throw new Error(
          "ZIP package contents exceed the 24 MB expanded size limit.",
        );
      for (const entry of entries) {
        const entryName = `${name} / ${entry.name}`;
        try {
          if (attemptedFiles >= INTAKE_LIMITS.maxFiles) {
            fail(
              entryName,
              "The 40 document batch limit has been reached. Remaining package files were skipped.",
            );
            break;
          }
          const entryFormat = extension(entry.name);
          if (!SUPPORTED.has(entryFormat))
            throw new Error(
              entryFormat === "zip"
                ? "Nested ZIP packages are not supported. Unzip this file before importing."
                : "Unsupported package file. Use TXT, MD, PDF, or DOCX.",
            );
          if (entry._data.uncompressedSize > INTAKE_LIMITS.maxFileBytes)
            throw new Error("The expanded file exceeds the 12 MB limit.");
          const content = await boundedZipBytes(
            entry,
            Math.min(
              INTAKE_LIMITS.maxFileBytes,
              INTAKE_LIMITS.maxExpandedBytes - expandedBytes,
            ),
          );
          expandedBytes += content.length;
          await readOne(entryName, content, entryFormat);
        } catch (error) {
          fail(entryName, messageOf(error));
        }
      }
    } catch (error) {
      fail(name, messageOf(error));
    }
  }
  return { documents, errors };
}

/** Accept our complete packet or a raw engine project; never partially import. */
export async function parseProjectFile(file) {
  if (
    !Number.isFinite(file?.size) ||
    file.size < 0 ||
    file.size > DATA_LIMITS.maxProjectBytes
  )
    throw new Error("Project JSON must be smaller than 8 MB.");
  const raw = await file.text();
  if (raw.length > DATA_LIMITS.maxProjectBytes)
    throw new Error("Project JSON must be smaller than 8 MB.");
  let data;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose an exported project JSON file.",
    );
  }
  assertBoundedData(data);
  if (data?.kind === "readiness-project") {
    if (data.schemaVersion !== PACKET_VERSION)
      throw new Error("This preparation packet uses an unsupported version.");
    return assertValidProject(data.project, { structuralOnly: true });
  }
  return assertValidProject(data, { structuralOnly: true });
}

const escaped = (value) =>
  String(value ?? "")
    .replace(/[\\`*_{}\[\]()#+.!<>|~-]/g, "\\$&")
    .replace(/\r?\n/g, " ");
function fenced(value, language = "") {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const longest = (text.match(/`+/g) || []).reduce(
    (max, match) => Math.max(max, match.length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

function sourceText(ref, documents) {
  const document = documents.find((item) => item.id === ref.documentId);
  const line = Number.isInteger(ref.line) ? ref.line : null;
  const actualQuote =
    line && document ? document.text.split("\n")[line - 1] : undefined;
  return `${escaped(document?.name || ref.documentId || "Unknown document")}${line ? `, line ${line}` : ""}: ${escaped(ref.quote ?? actualQuote ?? "No quote recorded")}`;
}

function markdownPacket(project, readiness) {
  const docs = project.documents || [];
  const lines = [
    `# Preparation packet: ${escaped(project.name || project.title || "Untitled project")}`,
    "",
    "This packet preserves source text, human review records, and the computed plan. Scenario assumptions are listed separately from actual status.",
    "",
    "## Computed plan",
    "",
    `- Scenario: ${escaped(readiness.scenarioName || "Baseline")}`,
    `- Scenario assumptions applied: ${readiness.isScenario ? "Yes" : "No"}`,
    `- Start: ${escaped(readiness.startDate || "Not set")}`,
    `- Projected finish: ${escaped(readiness.finishDate || "Not available")}`,
    `- Elapsed working days: ${readiness.totalWorkingDays ?? "Not available"}`,
    `- Target variance (working days): ${readiness.targetVarianceDays ?? "Not available"}`,
    "",
    "Working days are Monday–Friday; public holidays are not included.",
    "",
    "## Requirements and human review",
    "",
  ];
  for (const req of project.requirements || []) {
    const computed = (readiness.requirements || []).find(
      (item) => item.id === req.id,
    );
    const effective = computed || req;
    lines.push(
      `### ${escaped(effective.title || req.id)}`,
      "",
      `- Calculation: ${computed ? "Current source fields shown below" : "Unavailable; saved fields below need validation"}`,
      `- ID / code: ${escaped(req.id)} / ${escaped(effective.code)}`,
      `- Owner: ${escaped(effective.owner || "Unassigned")}`,
      `- Actual recorded state: ${escaped(req.status || "missing")}`,
      `- Effective actual state: ${escaped(computed?.effectiveStatus || "Not calculated")}`,
      `- ${computed ? "Required state" : "Saved required state (not validated)"}: ${escaped(effective.requiredState)}`,
      `- Assumed in this scenario: ${computed?.assumed ? "Yes (does not change actual review)" : "No"}`,
      `- Satisfied by actual review: ${computed ? (computed.satisfied ? "Yes" : "No") : "Not calculated"}`,
      `- Reviewer note: ${escaped(effective.reviewerNote || "None")}`,
      `- Notes: ${escaped(effective.notes || "None")}`,
      `- Confirmation fingerprint: ${escaped(req.confirmationFingerprint || "Not confirmed")}`,
      "",
    );
    for (const [label, refs] of [
      ["Source", effective.sourceRefs || []],
      ["Evidence", effective.evidenceRefs || []],
    ]) {
      lines.push(`**${label} references**`, "");
      lines.push(
        ...(refs.length
          ? refs.map((ref) => `- ${sourceText(ref, docs)}`)
          : ["- None recorded."]),
        "",
      );
    }
  }
  lines.push("## Tasks, dependencies, and dates", "");
  for (const task of readiness.tasks || project.tasks || []) {
    lines.push(
      `### ${escaped(task.title || task.id)}`,
      "",
      `- ID: ${escaped(task.id)}`,
      `- Owner: ${escaped(task.owner || "Unassigned")}`,
      `- Duration: ${task.effectiveDuration ?? task.duration ?? "Unknown"} working days`,
      `- Dependencies: ${escaped((task.effectiveDependsOn || task.dependsOn || []).join(", ") || "None")}`,
      `- Start / finish: ${escaped(task.startDate || "Not scheduled")} / ${escaped(task.finishDate || "Not scheduled")}`,
      `- Complete based on actual review: ${task.completed ? "Yes" : "No"}`,
      `- Projected complete in scenario: ${task.projectedCompleted ? "Yes" : "No"}`,
      `- Critical path: ${task.critical ? "Yes" : "No"}`,
      `- Slack: ${task.slack ?? "Unknown"} working days`,
      `- Blocked by: ${escaped((task.blockedBy || []).join(", ") || "None")}`,
      "",
      ...(task.sourceRefs || []).map(
        (ref) => `- Source: ${sourceText(ref, docs)}`,
      ),
      "",
    );
  }
  lines.push("## Next actions", "");
  for (const action of readiness.actions || [])
    lines.push(
      `- **${escaped(action.title)}** — ${escaped(action.owner || "Unassigned")}; ${escaped(action.state)}. ${escaped(action.reason)}`,
      ...(action.sourceRefs || []).map((ref) => `  - ${sourceText(ref, docs)}`),
    );
  lines.push("", "## Role reviews", "");
  for (const review of readiness.roleReviews || [])
    lines.push(
      `### ${escaped(review.role || review.title)}`,
      "",
      `Status: ${escaped(review.status)}. ${escaped(review.summary)}`,
      "",
      ...(review.sourceRefs || []).map((ref) => `- ${sourceText(ref, docs)}`),
      "",
    );
  lines.push("## Findings and validation", "");
  for (const error of readiness.errors || [])
    lines.push(`- Error: ${escaped(error)}`);
  for (const finding of readiness.findings || [])
    lines.push(
      `- ${escaped(finding.severity)}: **${escaped(finding.title)}**. ${escaped(finding.detail)}`,
      ...(finding.sourceRefs || []).map(
        (ref) => `  - ${sourceText(ref, docs)}`,
      ),
    );
  lines.push(
    "",
    "## Saved scenarios and assumptions",
    "",
    fenced(project.scenarios || [], "json"),
    "",
    "## Source documents",
    "",
  );
  for (const document of docs)
    lines.push(
      `### ${escaped(document.name)}`,
      "",
      `Document ID: ${escaped(document.id)}. Kind: ${escaped(document.kind)}. Format: ${escaped(document.format || "text")}. Line references count from the first line in the block below, starting at 1.`,
      "",
      fenced(document.text || "", "text"),
      "",
    );
  lines.push(
    "## Complete project and calculation record",
    "",
    "The JSON below includes every saved field, review decision, policy, and scenario. The project field preserves the exact saved record, which may contain stale fields. The readiness field contains the effective calculation from current sources; check its validity and errors before relying on it.",
    "",
    fenced(packetRecord(project, readiness), "json"),
    "",
  );
  return lines.join("\n");
}

export function csvCell(value) {
  let text = String(value ?? "");
  // Leading whitespace/control characters can conceal a spreadsheet formula.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvPacket(project, readiness) {
  const rows = [
    [
      "record",
      "path",
      "value_type",
      "value",
      "source_line",
      "part",
      "id",
      "title",
      "owner",
      "actual_state",
      "required_state",
      "scenario_assumed",
      "start_date",
      "finish_date",
      "dependencies",
      "blockers",
      "source_document",
      "source_quote",
      "scenario",
      "reference_kind",
      "reviewer_note",
    ],
  ];
  const docs = project.documents || [];
  function summary(record, item, fields) {
    const refs = [
      ...(item.sourceRefs || []).map((ref) => ({
        ...ref,
        referenceKind: "source",
      })),
      ...(item.evidenceRefs || []).map((ref) => ({
        ...ref,
        referenceKind: "evidence",
      })),
    ];
    for (const ref of refs.length ? refs : [{}]) {
      const document = docs.find(
        (candidate) => candidate.id === ref.documentId,
      );
      const quote =
        ref.quote ??
        (ref.line && document ? document.text.split("\n")[ref.line - 1] : "");
      rows.push([
        record,
        "",
        "summary",
        fields.detail || "",
        ref.line || "",
        "",
        item.id,
        item.title,
        item.owner,
        fields.actual,
        fields.required || "",
        fields.assumed ? "yes" : "no",
        item.startDate || "",
        item.finishDate || "",
        (item.effectiveDependsOn || item.dependsOn || []).join("; "),
        (item.blockedBy || []).join("; "),
        document?.name || ref.documentId || "",
        quote,
        readiness.scenarioName || "Baseline",
        ref.referenceKind || "",
        item.reviewerNote || "",
      ]);
    }
  }
  for (const item of project.requirements || []) {
    const computed = (readiness.requirements || []).find(
      (candidate) => candidate.id === item.id,
    );
    const effective = computed || item;
    summary(
      computed ? "requirement" : "unvalidated_saved_requirement",
      effective,
      {
        actual: computed?.effectiveStatus || "not calculated",
        required: effective.requiredState,
        assumed: computed?.assumed,
        detail: effective.notes,
      },
    );
  }
  for (const item of readiness.tasks || project.tasks || [])
    summary("task", item, {
      actual: item.completed
        ? "complete"
        : item.available
          ? "available"
          : "blocked",
      assumed: !item.completed && item.projectedCompleted,
      detail: `Duration: ${item.effectiveDuration ?? item.duration ?? "unknown"} working days; critical: ${Boolean(item.critical)}; slack: ${item.slack ?? "unknown"}`,
    });
  for (const item of readiness.actions || [])
    summary("action", item, { actual: item.state, detail: item.reason });
  function visit(value, path, record) {
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length)
        rows.push([
          record,
          path,
          Array.isArray(value) ? "array" : "object",
          JSON.stringify(value),
          "",
          "",
        ]);
      for (const [key, child] of entries)
        visit(
          child,
          `${path}[${Array.isArray(value) ? key : JSON.stringify(key)}]`,
          record,
        );
      return;
    }
    const type = value === null ? "null" : typeof value;
    const text = value === null ? "null" : String(value ?? "");
    if (type === "string") {
      // One source line per row keeps citations intact and stays below common
      // spreadsheet cell limits, even for large extracted documents.
      for (const [index, line] of text.split("\n").entries()) {
        const chunks = line.match(/[\s\S]{1,16000}/g) || [""];
        chunks.forEach((chunk, part) =>
          rows.push([record, path, type, chunk, index + 1, part + 1]),
        );
      }
    } else rows.push([record, path, type, text, "", ""]);
  }
  visit(
    {
      schemaVersion: PACKET_VERSION,
      kind: "readiness-project",
      recordSemantics,
    },
    "$",
    "packet",
  );
  visit(project, "$.project", "project");
  visit(readiness, "$.readiness", "calculation");
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        Array.from({ length: rows[0].length }, (_, index) =>
          csvCell(row[index]),
        ).join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}

/** Pure format helper: no clock, browser state, or mutation. */
export function formatPacket(project, readiness = {}, format = "markdown") {
  if (format === "json")
    return JSON.stringify(packetRecord(project, readiness), null, 2);
  if (format === "markdown") return markdownPacket(project, readiness);
  if (format === "csv") return csvPacket(project, readiness);
  throw new Error("Choose markdown, json, or csv for the preparation packet.");
}

export function exportPacket(project, readiness, format = "markdown") {
  const text = formatPacket(project, readiness, format);
  const suffix = { markdown: "md", json: "json", csv: "csv" }[format];
  const type = {
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
  }[format];
  const filename = `${
    String(project.name || project.title || "readiness")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "readiness"
  }-preparation-packet.${suffix}`;
  const url = URL.createObjectURL(
    new Blob([text], { type: `${type};charset=utf-8` }),
  );
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, text };
}
