import { hkdfSync, randomUUID } from "node:crypto";
import { EncryptJWT, jwtDecrypt, SignJWT, jwtVerify } from "jose";

export const SESSION_SECONDS = 8 * 60 * 60;
export const BODY_LIMIT = 16 * 1024;
export const SIMULATION_BODY_LIMIT = 640 * 1024;
export const API_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,500}$/;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function settings(env = process.env) {
  let origin;
  try {
    const url = new URL(env.AUTH_URL);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    origin = url.origin;
  } catch { return null; }
  if (typeof env.AUTH_SECRET !== "string" || env.AUTH_SECRET.length < 32 || !env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) return null;
  return {
    origin,
    secret: env.AUTH_SECRET,
    googleId: env.AUTH_GOOGLE_ID,
    googleSecret: env.AUTH_GOOGLE_SECRET,
    secure: origin.startsWith("https:"),
    model: /^[a-zA-Z0-9._:-]{1,100}$/.test(env.OPENAI_MODEL || "") ? env.OPENAI_MODEL : "gpt-4.1-mini",
  };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

export function requireSameOrigin(request, config) {
  if (request.headers.get("origin") !== config.origin) {
    throw new HttpError(403, "origin_rejected", "This request must come from this website.");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new HttpError(403, "origin_rejected", "This request must come from this website.");
  }
}

export async function readJson(request, limit = BODY_LIMIT) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "invalid_content_type", "Send a JSON request.");
  }
  const length = Number(request.headers.get("content-length"));
  if (length > limit) throw new HttpError(413, "request_too_large", "The request is too large.");
  let size = 0;
  const chunks = [];
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "request_too_large", "The request is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new HttpError(400, "invalid_json", "The request could not be read."); }
}

export function keyCookieName(config) {
  return `${config.secure ? "__Host-" : ""}microfish.openai`;
}

function encryptionKey(config) {
  return new Uint8Array(hkdfSync("sha256", config.secret, config.origin, "microfish.openai-connection.v1", 32));
}

export function cookieValue(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const divider = part.indexOf("=");
    if (part.slice(0, divider).trim() === name) return part.slice(divider + 1).trim();
  }
  return null;
}

export async function sealApiKey(apiKey, session, config, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  return new EncryptJWT({ apiKey, sid: session.sid })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(session.id)
    .setIssuer(config.origin)
    .setAudience("microfish.openai")
    .setIssuedAt(issued)
    .setExpirationTime(Math.min(issued + SESSION_SECONDS, session.expiresAt))
    .setJti(randomUUID())
    .encrypt(encryptionKey(config));
}

export async function readApiKey(request, session, config, now = Date.now()) {
  const sealed = cookieValue(request, keyCookieName(config));
  if (!sealed || !session) return null;
  try {
    const { payload } = await jwtDecrypt(sealed, encryptionKey(config), {
      issuer: config.origin,
      audience: "microfish.openai",
      subject: session.id,
      currentDate: new Date(now),
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    if (payload.sid !== session.sid || !API_KEY_PATTERN.test(payload.apiKey || "") || session.expiresAt <= now / 1000) return null;
    return payload.apiKey;
  } catch { return null; }
}

export function keyCookie(value, config, maxAge = SESSION_SECONDS) {
  return `${keyCookieName(config)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${config.secure ? "; Secure" : ""}`;
}

function institutionSigningKey(config) {
  return new Uint8Array(hkdfSync("sha256", config.secret, config.origin, "microfish.institution-snapshot.v1", 32));
}

// Public research is readable in the browser; its signature prevents a client
// from replacing a verified member or policy with a fabricated institutional fact.
export async function sealInstitutionProfile(profile, session, config, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  return new SignJWT({ profile, sid: session.sid, version: 1 })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.id)
    .setIssuer(config.origin)
    .setAudience("microfish.institution")
    .setIssuedAt(issued)
    .setExpirationTime(Math.min(issued + SESSION_SECONDS, session.expiresAt))
    .sign(institutionSigningKey(config));
}

export async function readInstitutionProfile(token, session, config, now = Date.now()) {
  if (typeof token !== "string" || token.length > 80_000 || !session || session.expiresAt <= now / 1000) return null;
  try {
    const { payload } = await jwtVerify(token, institutionSigningKey(config), {
      issuer: config.origin,
      audience: "microfish.institution",
      subject: session.id,
      currentDate: new Date(now),
      algorithms: ["HS256"],
    });
    if (payload.sid !== session.sid || payload.version !== 1 || !payload.profile?.university || !Array.isArray(payload.profile.reviewers)) return null;
    return payload.profile;
  } catch { return null; }
}
