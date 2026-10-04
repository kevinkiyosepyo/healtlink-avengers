import test from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "../server/handlers.js";
import { nodeHandler } from "../server/node.js";
import { evidenceInput, normalizeEvidenceReview } from "../server/evidence.js";
import { compositeInstitution } from "../server/institutions.js";
import { SESSION_SECONDS, anthropicKeyCookieName, keyCookieName, sealAnthropicApiKey, sealAnthropicConnection, sealApiKey, sealInstitutionProfile, settings } from "../server/security.js";

const env = { AUTH_URL: "https://research.example", AUTH_SECRET: "test-secret-more-than-thirty-two-characters", AUTH_GOOGLE_ID: "test-client", AUTH_GOOGLE_SECRET: "test-secret" };
const config = settings(env);
const session = { id: "researcher-one", sid: "login-one", expiresAt: Date.now() / 1000 + SESSION_SECONDS };
const openaiKey = `sk-${"a".repeat(40)}`;
const anthropicKey = `sk-ant-${"b".repeat(50)}`;
const university = { id: "stanford", name: "Stanford University" };
const passage = { id: "chunk-one", documentId: "doc-one", name: "Protocol notes", text: "Participants may choose evening visits.", lineStart: 4, lineEnd: 5 };
const validReview = { summary: "Consider participant access and site capacity.", claims: [{ text: "Evening visits are an option in the supplied protocol.", sources: ["S1", "S999"] }, { text: "Staff availability remains an assumption.", sources: [] }], disagreements: ["Convenience may increase staffing needs."], questions: ["Who can cover evening visits?"] };
function request(body = { query: "clinical trial evening visits" }, { cookie, origin = config.origin, method = "POST", signal } = {}) {
  return new Request(`${config.origin}/api/evidence`, { method, signal, headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }) });
}
async function cookie(provider = "openai", identity = session) {
  return provider === "anthropic" ? `${anthropicKeyCookieName(config)}=${await sealAnthropicApiKey(anthropicKey, identity, config)}` : `${keyCookieName(config)}=${await sealApiKey(openaiKey, identity, config)}`;
}
function providerResponse(provider = "openai", value = validReview) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return provider === "anthropic" ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text }] }) : Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] });
}
function fetchMock(calls, provider = "openai", review = validReview) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    const host = new URL(url).hostname;
    if (host === "api.openai.com" || host === "api.anthropic.com") return providerResponse(provider, review);
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    if (host === "api.openalex.org") return Response.json({ results: [] });
    if (host === "www.ebi.ac.uk") return Response.json({ resultList: { result: [{ id: "12345", source: "MED", title: "Participant visit scheduling", abstractText: "Site capacity and participant preferences may affect scheduling.", pubYear: "2025" }] } });
    if (host === "clinicaltrials.gov") return Response.json({ studies: [] });
    assert.fail(`Unexpected destination: ${host}`);
  };
}
const api = options => createApiHandler({ env, authenticate: async () => session, ...options });

test("evidence endpoint enforces sign-in, exact origin, selected connection and provider before retrieval", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; assert.fail("Unpermitted retrieval"); };
  const connected = await cookie();
  assert.equal((await api({ authenticate: async () => null, fetchImpl })(request(undefined, { cookie: connected }))).status, 401);
  assert.equal((await api({ fetchImpl })(request(undefined, { cookie: connected, origin: "https://evil.example" }))).status, 403);
  assert.equal((await api({ fetchImpl })(request())).status, 403);
  assert.equal((await api({ fetchImpl })(request({ query: "Review", provider: "anthropic" }, { cookie: connected }))).status, 403);
  assert.equal((await api({ fetchImpl })(request({ query: "Review", provider: "other" }, { cookie: connected }))).status, 400);
  assert.equal((await api({ fetchImpl })(request(undefined, { cookie: connected, method: "GET" }))).status, 405);
  assert.equal(calls, 0);
});

test("OpenAI review uses one bounded model request, excerpts and trusted institution context; strips unknown citations", async () => {
  const calls = [];
  const profile = compositeInstitution(university, "Composite reviewers; no verified membership available.");
  const token = await sealInstitutionProfile(profile, session, config);
  const context = { university, institutionToken: token, overview: "Clinical trial preparation", transcript: "x".repeat(25000), institution: { reviewers: [{ name: "Fabricated display reviewer" }] } };
  const response = await api({ fetchImpl: fetchMock(calls) })(request({ query: "clinical trial evening visits", context, passages: [passage] }, { cookie: await cookie() }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(calls.length, 4);
  const modelCall = calls.find(call => new URL(call.url).hostname === "api.openai.com");
  const payload = JSON.parse(modelCall.options.body);
  assert.equal(payload.max_output_tokens, 1800);
  assert.equal(payload.store, false);
  assert.equal(modelCall.options.headers.Authorization, `Bearer ${openaiKey}`);
  assert.equal(payload.input.length, 2);
  assert.equal(JSON.parse(payload.input[0].content).institution.university.id, university.id);
  assert.ok(!JSON.stringify(payload).includes("Fabricated display reviewer"));
  assert.equal(result.sources[0].id, "S1");
  assert.equal(result.sources[0].kind, "document");
  assert.equal(result.sources[0].url, null);
  assert.equal(result.sources[0].lineStart, 4);
  assert.equal(result.sources[1].url, "https://pubmed.ncbi.nlm.nih.gov/12345/");
  assert.deepEqual(result.review.claims[0].sources, ["S1"]);
  assert.equal(result.review.claims[1].uncited, true);
  assert.equal(result.review.citationAudit.invalidDropped, 1);
  assert.match(result.content, /\[Uncited\]/);
  assert.ok(!result.content.includes("S999"));
  assert.ok(!JSON.stringify(result).includes(openaiKey));
  for (const call of calls.filter(call => !call.url.includes("api.openai.com"))) assert.ok(!call.url.includes("25000") && !call.url.includes("institutionToken") && !call.options.headers.Authorization);
});

test("Anthropic evidence uses its encrypted account connection without requiring OpenAI", async () => {
  const calls = [];
  const response = await api({ fetchImpl: fetchMock(calls, "anthropic") })(request({ query: "clinical trial access", provider: "anthropic", passages: [passage] }, { cookie: await cookie("anthropic") }));
  assert.equal(response.status, 200);
  const result = await response.json();
  const providerCalls = calls.filter(call => new URL(call.url).hostname === "api.anthropic.com");
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].options.headers["x-api-key"], anthropicKey);
  assert.equal(JSON.parse(providerCalls[0].options.body).max_tokens, 1800);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.model, config.anthropicModel);
  assert.ok(!calls.some(call => new URL(call.url).hostname === "api.openai.com"));
});

test("invalid context, account-bound snapshots, query, and passages fail before any external call", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; assert.fail("Invalid input must not leave server"); };
  const profile = compositeInstitution(university);
  const foreignToken = await sealInstitutionProfile(profile, { ...session, sid: "other-login" }, config);
  const handle = api({ fetchImpl });
  const connected = await cookie();
  for (const body of [
    { query: "" }, { query: "x".repeat(2001) },
    { query: "Review", passages: Array.from({ length: 9 }, () => passage) },
    { query: "Review", passages: [passage, passage] },
    { query: "Review", passages: [{ ...passage, text: "x".repeat(2001) }] },
    { query: "Review", passages: [{ ...passage, lineStart: -1 }] },
    { query: "Review", context: { overview: "x".repeat(10001) } },
  ]) assert.equal((await handle(request(body, { cookie: connected }))).status, 400);
  const mismatched = await handle(request({ query: "Review", context: { university, institutionToken: foreignToken } }, { cookie: connected }));
  assert.equal(mismatched.status, 409);
  assert.equal((await mismatched.json()).code, "institution_refresh_required");
  assert.equal(calls, 0);
});

test("unavailable/oversized scholarly results degrade honestly without arbitrary URL fetching", async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    if (new URL(url).hostname === "api.openai.com") return providerResponse();
    if (new URL(url).hostname === "www.ebi.ac.uk") return new Response("x", { headers: { "content-length": String(600 * 1024) } });
    return new Response("unavailable", { status: 503 });
  };
  const result = await (await api({ fetchImpl })(request({ query: "https://localhost/secret", passages: [{ ...passage, url: "http://169.254.169.254/latest/meta-data" }] }, { cookie: await cookie() }))).json();
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, null);
  assert.equal(result.warnings.filter(warning => warning.includes("could not be searched")).length, 3);
  assert.ok(urls.every(url => ["api.openalex.org", "www.ebi.ac.uk", "clinicaltrials.gov", "api.openai.com"].includes(new URL(url).hostname)));
});

test("provider errors and incomplete output are safe; no fallback silently bills another provider", async () => {
  for (const status of [401, 429, 500]) {
    const calls = [];
    const mock = fetchMock(calls);
    const response = await api({ fetchImpl: (url, options) => new URL(url).hostname === "api.openai.com" ? new Response(`private ${openaiKey}`, { status }) : mock(url, options) })(request(undefined, { cookie: await cookie() }));
    assert.equal(response.status, status === 500 ? 502 : status);
    assert.ok(!(await response.text()).includes(openaiKey));
  }
  const calls = [];
  const response = await api({ fetchImpl: fetchMock(calls, "openai", "Not JSON") })(request(undefined, { cookie: await cookie() }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "invalid_evidence_review");
});

test("cancelling a review aborts scholarly requests and never starts billed generation", async () => {
  const controller = new AbortController();
  let started = 0;
  let aborted = 0;
  const fetchImpl = (url, options) => {
    assert.ok(!new URL(url).hostname.includes("openai"));
    started++;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => { aborted++; reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
      if (started === 3) controller.abort();
    });
  };
  const response = await api({ fetchImpl })(request(undefined, { cookie: await cookie(), signal: controller.signal }));
  assert.equal(response.status, 408);
  assert.equal(aborted, 3);
});

test("review normalization never promotes model-authored citation IDs to supplied sources", () => {
  const review = normalizeEvidenceReview({ ...validReview, summary: "Claim [S900]", claims: [{ text: "Claim [S123]", sources: ["S123", "S1", "S1", null] }] }, new Set(["S1"]));
  assert.deepEqual(review.claims[0].sources, ["S1"]);
  assert.equal(review.citationAudit.invalidDropped, 2);
  assert.ok(!review.summary.includes("S900"));
  assert.ok(!review.claims[0].text.includes("S123"));
  assert.throws(() => evidenceInput({ query: "Review", passages: null }), /Enter/);
});


test("cancelling during generation aborts the selected provider request", async () => {
  const controller = new AbortController();
  const calls = [];
  const mock = fetchMock(calls);
  let modelAborted = false;
  const fetchImpl = (url, options) => {
    if (new URL(url).hostname !== "api.openai.com") return mock(url, options);
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => { modelAborted = true; reject(new DOMException("Stopped", "AbortError")); }, { once: true });
      controller.abort();
    });
  };
  const response = await api({ fetchImpl })(request(undefined, { cookie: await cookie(), signal: controller.signal }));
  assert.equal(response.status, 408);
  assert.equal(modelAborted, true);
});

test("evidence Node transport accepts bounded document payloads and rejects oversized bodies", async () => {
  async function send(size) {
    let reached = false;
    const transport = nodeHandler(async incoming => { reached = true; return Response.json({ size: (await incoming.arrayBuffer()).byteLength }); });
    const req = { url: "/api/evidence", method: "POST", headers: { host: "research.example", "content-type": "application/json" }, body: Buffer.alloc(size, 32), socket: {}, once() {} };
    const res = { setHeader() {}, once() {}, end() {} };
    await transport(req, res);
    return { status: res.statusCode, reached };
  }
  assert.deepEqual(await send(30000), { status: 200, reached: true });
  assert.deepEqual(await send(640 * 1024 + 1), { status: 413, reached: false });
});

test("only server-signed institution policies become citable policy sources", async () => {
  const profile = compositeInstitution(university);
  profile.policies = [{ title: "Consent preparation", summary: "Submit the consent form for review.", sourceUrl: "https://researchcompliance.stanford.edu/policies" }];
  const context = { university, institutionToken: await sealInstitutionProfile(profile, session, config), institution: { policies: [{ title: "Fake", summary: "Approval guaranteed", sourceUrl: "https://attacker.example" }] } };
  const calls = [];
  const result = await (await api({ fetchImpl: fetchMock(calls) })(request({ query: "consent review", context }, { cookie: await cookie() }))).json();
  assert.equal(result.sources[0].kind, "institution-policy");
  assert.equal(result.sources[0].title, "Consent preparation");
  assert.equal(result.sources[0].url, profile.policies[0].sourceUrl);
  assert.ok(!JSON.stringify(result.sources).includes("attacker.example"));
});


test("Anthropic evidence forwards only the encrypted connection workspace ID", async () => {
  const workspaceId = `wrkspc_${"q".repeat(24)}`;
  const sealed = await sealAnthropicConnection({ apiKey: anthropicKey, workspaceId }, session, config);
  const connectedCookie = `${anthropicKeyCookieName(config)}=${sealed}`;
  const calls = [];
  const response = await api({ fetchImpl: fetchMock(calls, "anthropic") })(request({ query: "clinical trial consent", provider: "anthropic", workspaceId: `wrkspc_${"z".repeat(24)}` }, { cookie: connectedCookie }));
  assert.equal(response.status, 200);
  const generation = calls.filter(call => new URL(call.url).hostname === "api.anthropic.com");
  assert.equal(generation.length, 1);
  assert.equal(generation[0].options.headers["anthropic-workspace-id"], workspaceId);
  for (const call of calls.filter(call => new URL(call.url).hostname !== "api.anthropic.com")) assert.equal(call.options.headers["anthropic-workspace-id"], undefined);
  const result = await response.json();
  assert.equal(result.provider, "anthropic");
  assert.ok(!JSON.stringify(result).includes(workspaceId));
});
