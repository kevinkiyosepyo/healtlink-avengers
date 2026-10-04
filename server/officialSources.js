import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Worker } from "node:worker_threads";

const MAX_PAGE_BYTES = 384 * 1024;
const MAX_PDF_BYTES = 2 * 1024 * 1024;

export function officialUrl(value, domains) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

// Only globally routable IPv4 endpoints are used. Pin the resolved IP into the
// HTTPS request so DNS cannot change between the safety check and connection.
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2))))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function withAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new Error("Source lookup cancelled."));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function fetchPinned(url, address, signal, requestImpl) {
  return new Promise((resolve, reject) => {
    const req = requestImpl(url, {
      method: "GET",
      signal,
      agent: false,
      // No cookie, Authorization, or researcher content is sent to university sites.
      headers: { Accept: "text/html,application/pdf,text/plain;q=0.8", "Accept-Encoding": "identity", "User-Agent": "Microfish-Research-Preview/1.0" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address, family: 4 }]);
        else callback(null, address, 4);
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        resolve({ redirect: response.headers.location });
        return;
      }
      const type = String(response.headers["content-type"] || "").toLowerCase();
      const pdf = /^application\/pdf(?:;|$)/.test(type);
      const byteLimit = pdf ? MAX_PDF_BYTES : MAX_PAGE_BYTES;
      if (status !== 200 || !/^(text\/html|application\/xhtml\+xml|text\/plain|application\/pdf)(?:;|$)/.test(type)
        || Number(response.headers["content-length"]) > byteLimit
        || ![undefined, "identity"].includes(response.headers["content-encoding"])) {
        response.destroy();
        reject(new Error("The official source is not a readable public text page."));
        return;
      }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > byteLimit) response.destroy(new Error("The source page is too large."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), pdf, url: url.href }));
    });
    req.on("error", reject);
    req.end();
  });
}

export function extractOfficialPdf(bytes, signal) {
  if (bytes.length > MAX_PDF_BYTES || !Buffer.from(bytes).subarray(0, 5).equals(Buffer.from("%PDF-"))) return Promise.reject(new Error("Invalid PDF source."));
  return new Promise((resolve, reject) => {
    const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
    if (bounded.aborted) return reject(new Error("PDF source extraction was cancelled."));
    // A separate, memory-bounded worker can be terminated even if a malformed
    // document traps the parser in synchronous work. It never renders or runs PDF JS.
    const worker = new Worker(new URL("./sourcePdfWorker.js", import.meta.url), {
      workerData: new Uint8Array(bytes), resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
      execArgv: [],
    });
    let finished = false;
    const finish = (error, text) => {
      if (finished) return;
      finished = true;
      bounded.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error); else resolve(text);
    };
    const abort = () => finish(new Error("PDF source extraction was cancelled."));
    bounded.addEventListener("abort", abort, { once: true });
    worker.once("message", (result) => {
      if (typeof result?.text !== "string" || !result.text.trim() || result.text.length > 180_000) finish(new Error("PDF source has no bounded readable text."));
      else finish(null, result.text);
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", () => { if (!finished) finish(new Error("PDF source could not be read.")); });
  });
}

export async function fetchOfficialPage(value, domains, { signal, lookupImpl = dnsLookup, requestImpl = httpsRequest } = {}) {
  let safe = officialUrl(value, domains);
  if (!safe) throw new Error("This source is not an approved university URL.");
  const deadline = AbortSignal.timeout(8000);
  const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let redirects = 0; redirects <= 2; redirects++) {
    boundedSignal.throwIfAborted();
    const url = new URL(safe);
    const addresses = await withAbort(lookupImpl(url.hostname, { all: true, family: 4, verbatim: true }), boundedSignal);
    if (!addresses.length || addresses.some(({ address }) => !publicIPv4(address))) throw new Error("The source address is not public.");
    const result = await fetchPinned(url, addresses[0].address, boundedSignal, requestImpl);
    if (result.redirect) {
      safe = officialUrl(new URL(result.redirect, url).href, domains);
      if (!safe) throw new Error("The source redirects outside its university.");
      continue;
    }
    return { url: result.url, text: result.pdf
      ? await extractOfficialPdf(result.bytes, boundedSignal)
      : plainText(result.bytes.toString("utf8")) };
  }
  throw new Error("The source redirected too many times.");
}

export function plainText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, entity) => {
      const point = entity[0].toLowerCase() === "x" ? parseInt(entity.slice(1), 16) : Number(entity);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/gi, (_match, name) => ({
      amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    })[name.toLowerCase()])
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180_000);
}
