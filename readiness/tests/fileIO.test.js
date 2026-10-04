import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  readDocuments,
  parseProjectFile,
  formatPacket,
  csvCell,
  INTAKE_LIMITS,
} from "../src/lib/fileIO.js";
import { createProject } from "../src/lib/sampleCases.js";
import { calculateReadiness } from "../src/lib/readiness.js";

const file = (name, content, type = "") => new File([content], name, { type });

function pdfFixture(text = "") {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return pdf + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

test("text intake preserves blank lines and exact normalized source references", async () => {
  const result = await readDocuments([
    file("policy.md", "\uFEFFFirst\r\n\r\nThird\rFourth\n"),
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.documents[0].text, "First\n\nThird\nFourth\n");
  assert.equal(result.documents[0].text.split("\n")[2], "Third");
  assert.equal(result.documents[0].format, "md");
  assert.equal(result.documents[0].kind, "source");
});

test("per-file errors preserve successful documents; oversized data is rejected before reading", async () => {
  let read = false;
  const oversized = {
    name: "large.txt",
    size: INTAKE_LIMITS.maxFileBytes + 1,
    arrayBuffer() {
      read = true;
      throw new Error("should not read");
    },
  };
  const result = await readDocuments([
    file("good.txt", "Source content"),
    file("empty.txt", "  "),
    file("script.exe", "anything"),
    oversized,
  ]);
  assert.equal(result.documents.length, 1);
  assert.equal(result.errors.length, 3);
  assert.equal(read, false);
  assert.match(result.errors[0].message, /No text/);
});

test("ZIP reads actual packaged documents and reports unsupported nested files", async () => {
  const zip = new JSZip();
  zip.file("requirements/site.txt", "Requirement | id=one\n");
  zip.file("readme.md", "# Notes\n\nNext line");
  zip.file("nested.zip", "not imported");
  zip.file("__MACOSX/._ignored", "metadata");
  const result = await readDocuments([
    file("packet.zip", await zip.generateAsync({ type: "uint8array" })),
  ]);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].name, "packet.zip / requirements/site.txt");
  assert.equal(result.documents[1].text.split("\n")[2], "Next line");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Nested ZIP/);
});

test("ZIP refuses packages declaring excessive expansion", async () => {
  const zip = new JSZip();
  zip.file("large.txt", "a".repeat(INTAKE_LIMITS.maxExpandedBytes + 1));
  const result = await readDocuments([
    file(
      "large.zip",
      await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    ),
  ]);
  assert.equal(result.documents.length, 0);
  assert.match(result.errors[0].message, /24 MB expanded/);
});

test("ZIP rejects entry floods and damaged archives before document extraction", async () => {
  const zip = new JSZip();
  for (let index = 0; index < 200; index++)
    zip.file(`file-${index}.txt`, "small");
  const result = await readDocuments([
    file("flood.zip", await zip.generateAsync({ type: "uint8array" })),
    file("broken.zip", "not a zip"),
  ]);
  assert.equal(result.documents.length, 0);
  assert.match(result.errors[0].message, /too many ZIP entries/);
  assert.match(result.errors[1].message, /missing or damaged/);
});

test("DOCX imports paragraphs from a real minimal Word package", async () => {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Training certificate</w:t></w:r></w:p><w:p><w:r><w:t>Course: REST-101</w:t></w:r></w:p></w:body></w:document>',
  );
  const result = await readDocuments([
    file("certificate.docx", await zip.generateAsync({ type: "uint8array" })),
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.documents[0].format, "docx");
  assert.match(
    result.documents[0].text,
    /Training certificate\n\nCourse: REST-101/,
  );
});

test("PDF extracts selectable text and explicitly rejects image-only pages", async () => {
  const result = await readDocuments([
    file("text.pdf", pdfFixture("Actual PDF source text")),
    file("scan.pdf", pdfFixture()),
  ]);
  assert.equal(result.documents.length, 1, JSON.stringify(result.errors));
  assert.match(result.documents[0].text, /Actual PDF source text/);
  assert.equal(result.errors[0].name, "scan.pdf");
  assert.match(result.errors[0].message, /Scanned PDFs need OCR/);
});

test("full project JSON roundtrips all documents, scenarios, and human review", async () => {
  const project = createProject("rest");
  const packet = formatPacket(project, calculateReadiness(project), "json");
  assert.deepEqual(
    await parseProjectFile(file("project.json", packet)),
    project,
  );
  assert.deepEqual(
    await parseProjectFile(file("raw.json", JSON.stringify(project))),
    project,
  );
});

test("a structurally valid draft with a dependency cycle roundtrips without granting readiness", async () => {
  const project = createProject("rest");
  project.tasks[0].dependsOn = [project.tasks.at(-1).id];
  const initial = calculateReadiness(project);
  assert.equal(initial.valid, false);
  const restored = await parseProjectFile(
    file("draft.json", formatPacket(project, initial, "json")),
  );
  assert.deepEqual(restored, project);
  const result = calculateReadiness(restored);
  assert.equal(result.valid, false);
  assert.equal(result.finishDate, null);
  assert.deepEqual(result.actions, []);
});

test("packet summaries use effective source fields while the raw saved record stays exact", async () => {
  const project = createProject("rest");
  const readiness = calculateReadiness(project);
  Object.assign(
    project.requirements.find((item) => item.id === "rest-course"),
    {
      title: "Incorrect stale title",
      code: "WRONG-COURSE",
      requiredState: "received",
    },
  );
  const markdown = formatPacket(project, readiness, "markdown");
  const summaries = markdown.split(
    "## Complete project and calculation record",
  )[0];
  assert.doesNotMatch(summaries, /Incorrect stale title|WRONG/);
  assert.match(summaries, /Required state: verified/);
  const csv = formatPacket(project, readiness, "csv");
  const requirementRows = csv
    .split("\r\n")
    .filter(
      (line) =>
        line.startsWith('"requirement",') && line.includes('"rest-course"'),
    );
  assert.ok(requirementRows.length);
  assert.ok(
    requirementRows.every(
      (row) =>
        row.includes('"REST-101 protocol-specific training"') &&
        row.includes('"missing","verified"'),
    ),
  );
  assert.ok(
    requirementRows.every((row) => !row.includes("Incorrect stale title")),
  );
  const packet = JSON.parse(formatPacket(project, readiness, "json"));
  assert.deepEqual(packet.project, project);
  assert.match(packet.recordSemantics.project, /Exact saved/);
  assert.deepEqual(
    await parseProjectFile(file("unchanged.json", JSON.stringify(packet))),
    project,
  );
});

test("project import rejects wrong versions, invalid engine models, and dangerous object keys", async () => {
  await assert.rejects(
    parseProjectFile(file("bad.json", "{ invalid")),
    /not valid JSON/,
  );
  await assert.rejects(
    parseProjectFile(
      file(
        "bad.json",
        '{"kind":"readiness-project","schemaVersion":99,"project":{}}',
      ),
    ),
    /unsupported version/,
  );
  await assert.rejects(
    parseProjectFile(file("bad.json", '{"documents":"not an array"}')),
    /Invalid project/,
  );
  await assert.rejects(
    parseProjectFile(file("bad.json", '{"__proto__":{"polluted":true}}')),
    /unsafe property/,
  );
  let deep = {};
  for (let index = 0; index < 30; index++) deep = { inner: deep };
  await assert.rejects(
    parseProjectFile(file("deep.json", JSON.stringify(deep))),
    /nested data/,
  );
  assert.equal({}.polluted, undefined);
});

test("Markdown preserves source fences and includes decisions, source refs, and complete record", () => {
  const project = createProject("rest");
  project.documents.push({
    id: "odd",
    kind: "notes",
    name: "Extra <script>.md",
    text: "First\n```\n``````\n<script>alert(1)</script>",
  });
  const result = formatPacket(project, calculateReadiness(project), "markdown");
  assert.match(
    result,
    /```````text\nFirst\n```\n``````\n<script>alert\(1\)<\/script>\n```````/,
  );
  assert.match(result, /Extra \\<script\\>/);
  assert.match(result, /Actual recorded state: verified/);
  assert.match(result, /line 2:/);
  assert.match(result, /Complete project and calculation record/);
  assert.match(result, /reviewerNote/);
  assert.match(result, /assumedRequirementIds/);
});

test("CSV defuses formulas even after whitespace and preserves all fields and source lines", () => {
  for (const unsafe of [
    '=HYPERLINK("bad")',
    "  =1+2",
    "\t@SUM(A1)",
    "-1+1",
    "\r\n+1",
  ])
    assert.match(csvCell(unsafe), /^"'/);
  assert.equal(csvCell('A "quoted", value'), '"A ""quoted"", value"');
  const project = createProject("rest");
  project.documents.push({
    id: "csv",
    name: "csv.txt",
    kind: "notes",
    text: "first\n=malicious\nthird",
  });
  const csv = formatPacket(project, calculateReadiness(project), "csv");
  assert.match(csv, /"'\=malicious","2","1"/);
  assert.match(csv, /reviewerNote/);
  assert.match(csv, /dependencyOverrides/);
  assert.match(csv, /"calculation"/);
  assert.match(
    csv,
    /"actual_state","required_state","scenario_assumed","start_date","finish_date","dependencies","blockers"/,
  );
  assert.match(csv, /"action","","summary"/);
  assert.match(csv, /"requirement","","summary"/);
});
