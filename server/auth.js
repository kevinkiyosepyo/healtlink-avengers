import { randomUUID } from "node:crypto";
import { Auth } from "@auth/core";
import Google from "@auth/core/providers/google";
import { getToken } from "@auth/core/jwt";
import { SESSION_SECONDS, keyCookie } from "./security.js";

export function authConfig(config) {
  return {
    secret: config.secret,
    basePath: "/api/auth",
    trustHost: true,
    useSecureCookies: config.secure,
    session: { strategy: "jwt", maxAge: SESSION_SECONDS },
    providers: [Google({
      clientId: config.googleId,
      clientSecret: config.googleSecret,
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
      checks: ["pkce", "state"],
    })],
    pages: { signIn: "/#/login", error: "/" },
    callbacks: {
      signIn({ account, profile }) {
        return account?.provider === "google" && profile?.email_verified === true;
      },
      jwt({ token, account }) {
        if (account) {
          token.provider = account.provider;
          token.sid = randomUUID();
          token.sessionExpiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
        }
        if ((token.provider && token.provider !== "google") || !token.sid || token.sessionExpiresAt <= Date.now() / 1000) return null;
        return token;
      },
      session({ session, token }) {
        session.user = { id: token.sub, name: token.name || "Researcher", email: token.email || "", image: token.picture || null };
        session.expires = new Date(token.sessionExpiresAt * 1000).toISOString();
        return session;
      },
      redirect({ url }) {
        try {
          const target = new URL(url, config.origin);
          if (target.origin === config.origin) return target.href;
        } catch { /* Fall back to the account page. */ }
        return `${config.origin}/#/login`;
      },
    },
    // Provider errors may include token response bodies. Never emit them to logs.
    logger: { error() {}, warn() {}, debug() {} },
  };
}

export async function authenticate(request, config) {
  const token = await getToken({ req: request, secret: config.secret, secureCookie: config.secure, logger: { error() {}, warn() {}, debug() {} } });
  if (!token || (token.provider && token.provider !== "google") || typeof token.sub !== "string" || typeof token.sid !== "string" || typeof token.sessionExpiresAt !== "number" || token.sessionExpiresAt <= Date.now() / 1000) return null;
  return {
    id: token.sub,
    sid: token.sid,
    expiresAt: token.sessionExpiresAt,
    name: typeof token.name === "string" ? token.name.slice(0, 120) : "Researcher",
    email: typeof token.email === "string" ? token.email.slice(0, 254) : "",
    image: typeof token.picture === "string" && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(token.picture) ? token.picture : null,
  };
}

export async function handleAuth(request, config) {
  // OAuth URLs must use the configured origin, never untrusted forwarded hosts.
  const incoming = new URL(request.url);
  const canonical = new URL(incoming.pathname + incoming.search, config.origin);
  const authResponse = await Auth(new Request(canonical, request), authConfig(config));
  // Auth.js may return an immutable Response.redirect for OAuth errors.
  const response = new Response(authResponse.body, {
    status: authResponse.status,
    statusText: authResponse.statusText,
    headers: new Headers(authResponse.headers),
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (incoming.pathname === "/api/auth/signout" && request.method === "POST") {
    response.headers.append("Set-Cookie", keyCookie("", config, 0));
  }
  return response;
}
