import { createHash } from "node:crypto";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

const ISSUER = "https://auth.openai.com";
let cachedDiscovery;

export function chatgptSettings(env) {
  // Hosted applications must use their own OpenAI-provisioned client. Never
  // substitute Codex's client ID or the loopback-only dynamic_agent_client.
  if (!/^oaiapp_[A-Za-z0-9_-]+$/.test(env.AUTH_OPENAI_ID || "")) return null;
  const method = env.AUTH_OPENAI_TOKEN_AUTH_METHOD;
  if (!["none", "client_secret_basic"].includes(method)) return null;
  if (method === "client_secret_basic" && !env.AUTH_OPENAI_SECRET) return null;
  return { id: env.AUTH_OPENAI_ID, method, secret: method === "client_secret_basic" ? env.AUTH_OPENAI_SECRET : undefined };
}

async function discover() {
  if (cachedDiscovery?.expires > Date.now()) return cachedDiscovery.value;
  const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000), redirect: "error" });
  if (!response.ok) throw new Error("ChatGPT discovery unavailable");
  const value = await response.json();
  if (value.issuer !== ISSUER) throw new Error("Unexpected ChatGPT issuer");
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
    const url = new URL(value[key]);
    if (url.origin !== ISSUER || url.username || url.password || url.hash) throw new Error("Unexpected ChatGPT endpoint");
  }
  cachedDiscovery = { value, expires: Date.now() + 5 * 60_000 };
  return value;
}

export async function createChatGPTProvider(config) {
  const metadata = await discover();
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri), {
    [customFetch]: (...args) => fetch(...args), timeoutDuration: 10_000,
  });
  return {
    id: "chatgpt",
    name: "ChatGPT",
    type: "oidc",
    issuer: metadata.issuer,
    clientId: config.chatgpt.id,
    clientSecret: config.chatgpt.secret,
    client: { token_endpoint_auth_method: config.chatgpt.method },
    checks: ["pkce", "state", "nonce"],
    authorization: { url: metadata.authorization_endpoint, params: { scope: "openid profile email" } },
    token: {
      url: metadata.token_endpoint,
      async conform(response) {
        if (!response.ok) return response;
        const tokens = await response.json();
        // Auth.js validates the transaction's nonce, state and PKCE. Verify the
        // ID token's signature as well, before trusting any identity claims.
        const { payload } = await jwtVerify(tokens.id_token, jwks, {
          issuer: metadata.issuer,
          audience: config.chatgpt.id,
          algorithms: ["RS256", "ES256"],
          requiredClaims: ["sub", "exp", "iat", "nonce"],
          clockTolerance: 5,
        });
        if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Missing ChatGPT identity");
        // Identity-only SIWC may return only an ID token. Auth.js' OAuth parser
        // requires these fields; this marker is never used for inference or
        // persisted. No userinfo call is made for this OIDC provider.
        return Response.json({
          id_token: tokens.id_token,
          access_token: "identity-only-no-inference-permission",
          token_type: "Bearer",
        });
      },
    },
    profile(profile) {
      const identity = JSON.stringify([metadata.issuer, config.chatgpt.id, profile.sub]);
      return {
        id: `chatgpt:${createHash("sha256").update(identity).digest("hex")}`,
        name: typeof profile.name === "string" ? profile.name : "Researcher",
        email: profile.email_verified === true && typeof profile.email === "string" ? profile.email : null,
        image: null,
      };
    },
  };
}
