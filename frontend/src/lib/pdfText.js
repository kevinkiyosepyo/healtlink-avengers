// Extract text from a PDF in the browser (pdf.js, self-hosted worker, loaded
// only when a PDF is added). Returns the text plus page start offsets so
// citations can point at a page. Scanned/image-only PDFs have no text layer.
export async function extractPdfText(file) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  let text = "";
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push({ page: n, start: text.length });
    // hasEOL marks line breaks inside the text layer; keep paragraphs intact for chunking.
    text += content.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n") + "\n\n";
  }
  await task.destroy();
  if (!text.trim()) throw new Error(`${file.name} has no text layer (scanned image?). OCR it first, then add it again.`);
  return { text, pages };
}
