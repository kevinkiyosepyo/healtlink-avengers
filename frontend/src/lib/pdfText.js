// Extract text from a PDF in the browser (pdf.js, self-hosted worker, loaded
// only when a PDF is added). Pages are read with bounded concurrency (the
// pdf.js worker handles requests in parallel), then joined in page order so
// citations can point at an exact page. Scanned/image-only PDFs have no text layer.
const PAGE_CONCURRENCY = 4;

function pageText(content) {
  // hasEOL marks line breaks inside the text layer; keep paragraphs intact for chunking.
  return content.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n");
}

export async function extractPdfText(file, { onPage = () => {} } = {}) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const texts = new Array(pdf.numPages);
    let next = 1;
    let done = 0;
    async function worker() {
      while (next <= pdf.numPages) {
        const n = next++;
        const page = await pdf.getPage(n);
        texts[n - 1] = pageText(await page.getTextContent());
        page.cleanup(); // release per-page resources as soon as the text is out
        onPage(++done, pdf.numPages);
      }
    }
    await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pdf.numPages) }, worker));
    let text = "";
    const pages = texts.map((pageBody, i) => {
      const entry = { page: i + 1, start: text.length };
      text += `${pageBody}\n\n`;
      return entry;
    });
    if (!text.trim()) throw new Error(`${file.name} has no text layer (scanned image?). OCR it first, then add it again.`);
    return { text, pages };
  } finally {
    await task.destroy();
  }
}
