import { parentPort, workerData } from "node:worker_threads";
import { getResolvedPDFJS } from "unpdf";

let loading;
try {
  const { getDocument } = await getResolvedPDFJS();
  loading = getDocument({
    data: workerData, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, useWorkerFetch: false, disableAutoFetch: true,
    disableStream: true, enableXfa: false, verbosity: 0, stopAtErrors: true,
  });
  const pdf = await loading.promise;
  if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > 30) throw new Error("PDF page limit exceeded.");
  let text = "";
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    text += content.items.filter((item) => typeof item.str === "string").map((item) => item.str).join(" ") + "\n";
    page.cleanup();
    if (text.length > 180_000) throw new Error("PDF text limit exceeded.");
  }
  parentPort.postMessage({ text: text.replace(/\s+/gu, " ").trim() });
} catch {
  parentPort.postMessage({ error: "This PDF could not be verified." });
} finally {
  await loading?.destroy();
}
