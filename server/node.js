import { BODY_LIMIT, HttpError, SIMULATION_BODY_LIMIT, json } from "./security.js";
import { AUDIO_BODY_LIMIT } from "./transcription.js";
import { SYNC_BODY_LIMIT } from "./sync.js";

async function toWebRequest(req, signal) {
  const pathname = (req.url || '/').split('?')[0].replace(/\/$/, '')
  const bodyLimit = pathname === '/api/simulate' ? SIMULATION_BODY_LIMIT
    : pathname === '/api/transcribe' ? AUDIO_BODY_LIMIT
      : pathname === '/api/sync' || pathname.startsWith('/api/sync/') ? SYNC_BODY_LIMIT : BODY_LIMIT
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  let body;
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    if (Number(headers.get("content-length")) > bodyLimit) throw new HttpError(413, "request_too_large", "The request is too large.");
    if (req.body !== undefined) {
      if (Buffer.isBuffer(req.body) || typeof req.body === "string") body = req.body;
      else if (headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) body = new URLSearchParams(req.body).toString();
      else body = JSON.stringify(req.body);
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > bodyLimit) throw new HttpError(413, "request_too_large", "The request is too large.");
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }
    if (Buffer.byteLength(body) > bodyLimit) throw new HttpError(413, "request_too_large", "The request is too large.");
  }
  const protocol = req.socket?.encrypted ? "https" : "http";
  const url = new URL(req.url || "/", `${protocol}://${headers.get("host") || "localhost"}`);
  return new Request(url, { method: req.method || "GET", headers, body, signal });
}

export function nodeHandler(handler) {
  return async (req, res) => {
    const abort = new AbortController();
    req.once?.("aborted", () => abort.abort());
    res.once?.("close", () => { if (!res.writableEnded) abort.abort(); });
    let response;
    try { response = await handler(await toWebRequest(req, abort.signal)); }
    catch (error) {
      response = error instanceof HttpError
        ? json({ error: error.message, code: error.code }, error.status)
        : json({ error: "The request could not be completed.", code: "internal_error" }, 500);
    }
    res.statusCode = response.status;
    for (const [name, value] of response.headers) {
      if (name !== "set-cookie") res.setHeader(name, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
