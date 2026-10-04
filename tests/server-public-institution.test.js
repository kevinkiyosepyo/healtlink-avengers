import test from "node:test";
import assert from "node:assert/strict";
import { createPublicInstitutionPreviewHandler, PUBLIC_INSTITUTION_SOURCES, publicInstitutionPreview } from "../server/publicInstitution.js";

const now = Date.parse("2026-10-04T16:00:00Z");
// Excerpts reflect the actual official sources fetched on 4 October 2026.
const ucsfText = "IRB Rosters & Meeting Dates Human Research Protection Program IRB Committee Rosters The committee members have various areas of expertise and are from all schools and many disciplines. Submission deadlines apply only to modifications and continuing review submissions that require full committee review. Current roster (Last Updated 10/1/2026) IRB Leadership Group The IRB Leadership Group is composed of the HRPP Director and the Chairs and Vice Chairs of all six IRB Committees. Current membership: Edward Kuczynski, MA Director, HRPP Matthias Behrends Vice Chair, Laurel Heights IRB Tom Bersot Chair, ZSFG IRB Norman Brand Community Member Arthur D'Harlingue Vice Chair, Oakland IRB Archived IRB Committee Rosters/Meeting Dates 2018-2026 Last updated: October 1, 2026";
const stanfordIndex = "IRB Rosters The IRB Chairs and members are appointed by the Vice Provost and Dean of Research. IRB & OHRP # IRB Staff Current Rosters Roster Archives IRB 1 OHRP# 00000348 Manager: Crystal Inacay Manager: Elizabeth Sullivan 2026-2027 2025-2026 About the IRB The goal of the IRB is to protect human research participants by ensuring that participants' rights and welfare are adequately protected, research is guided by the ethical principles of respect for persons, beneficence, and justice as set forth in the Belmont Report";
const stanfordRoster = "IRB 1 Roster Page 1 of 3 STANFORD UNIVERSITY Institutional Review Board (IRB) in Medical Research 2026-2027 IRB #1: Roster Stanford, CA 94305 Assurance #FWA00000935 This IRB is composed of 34 members. VOTING MEMBERS Nine members affiliated with Stanford LEMMENS, Hendrikus (MD, PhD) (CHAIR) Professor Anesthesiology, Perioperative & Pain Medicine HEESTAND, Gregory M. (MD) Clinical Associate Professor Medicine, Oncology BLONIGEN, Daniel M. (PhD) Associate Professor Psychiatry and Behavioral Sciences Two Outside Nonscientific Members Otherwise Unaffiliated with Stanford EIGENBROD, Richard A. (MBA) Business Consultant MORRIS, Deborah (BA) Program Coordinator IRB 1 Roster Page 2 of 3 Eleven Alternate Members affiliated with Stanford NON-VOTING MEMBERS Last updated: September 2026";
const ucsdPolicy = "Information for Prospective Committee Members What role do IRB members play? IRB members review human subjects research before it begins and while it is ongoing. Who serves as an IRB member? IRB membership is composed of a diverse group of individuals. Among those members must be at least one person with a scientific background, one person with a non-scientific background, and one person unaffiliated with the institution.";
const ucsdAvailability = "University of California San Diego Office of IRB Administration April 8, 2024 Re: Common Information Requested by Sponsors IRB Membership: UCSD IRBs meet membership requirements. UCSD does not currently make member rosters available, but roster information is properly filed with DHHS.";
const usdText = "Members - Institutional Review Board - University of San Diego Members Administrator, Chairperson, Faculty Analyst and Coordinator Dr. Austin Choi-Fitzpatrick, IRB Administrator Official signatory for the IRB for the University irb@sandiego.edu Dr. Jane Georges, IRB Chairperson Resource person and ombudsman to faculty, staff, and students in matters related to IRB jgeorges@sandiego.edu Dr. Marcus Lam, IRB Faculty Analyst Assists IRB Administrator with application reviews mlam@sandiego.edu Academic Unit IRB Representatives School of Leadership and Education Sciences Review by Principal Investigator's Last Name Dr. Talia Leibovitz tleibovitz@sandiego.edu A - D Additional IRB Members Dr. Angelica Almonte, Community Member Representative AngelicaAlmonte@pointloma.edu";
const byKind = { "ucsf-roster": ucsfText, "stanford-index": stanfordIndex, "stanford-roster": stanfordRoster, "ucsd-policy": ucsdPolicy, "ucsd-availability": ucsdAvailability, "usd-roster": usdText };
const sources = Object.values(PUBLIC_INSTITUTION_SOURCES).flat();

function fixtures(overrides = {}, inspect = () => {}) {
  return async (url, domains, options) => {
    inspect(url, domains, options);
    const source = sources.find((entry) => entry.url === url);
    assert.ok(source, "Only fixed catalogue URLs may be fetched");
    assert.deepEqual(domains, source.domains);
    return { url, text: overrides[source.kind] ?? byKind[source.kind] };
  };
}

test("UCSF public preview extracts current named board roles and exact page evidence without model credentials", async () => {
  const requests = [];
  const profile = await publicInstitutionPreview("uc-san-francisco", { now, fetchSource: fixtures({}, (url, _domains, options) => {
    requests.push(url);
    assert.deepEqual(Object.keys(options), ["signal"]);
  }) });
  assert.equal(profile.status, "verified");
  assert.equal(profile.lookupMode, "public-preview");
  assert.equal(profile.retrievedAt, new Date(now).toISOString());
  assert.deepEqual(profile.reviewers.map(({ name }) => name), ["Matthias Behrends", "Tom Bersot", "Norman Brand"]);
  assert.deepEqual(profile.reviewers.map(({ role }) => role), ["Vice Chair, Laurel Heights IRB", "Chair, ZSFG IRB", "Community Member"]);
  assert.ok(profile.reviewers.every((entry) => ucsfText.includes(entry.membershipEvidence) && entry.sourceUrls.length === 1 && entry.kind === "public-profile"));
  assert.ok(profile.reviewers.every((entry) => !entry.background.includes("specializes") && entry.background.includes("Generic")));
  assert.ok(!profile.reviewers.some(({ name }) => name.includes("Kuczynski")));
  assert.equal(profile.policies[0].summary, "Submission deadlines apply only to modifications and continuing review submissions that require full committee review.");
  assert.deepEqual(requests, [PUBLIC_INSTITUTION_SOURCES["uc-san-francisco"][0].url]);
  assert.ok(profile.warnings.some((warning) => warning.includes("simulated reviewers")));
});

test("Stanford extracts voting chair, scientific and unaffiliated members from a current official-linked roster", async () => {
  const profile = await publicInstitutionPreview("stanford", { now, fetchSource: fixtures() });
  assert.equal(profile.status, "verified");
  assert.deepEqual(profile.reviewers.map(({ name }) => name), ["Hendrikus Lemmens", "Gregory M. Heestand", "Richard A. Eigenbrod"]);
  assert.ok(profile.reviewers.every((entry) => stanfordRoster.includes(entry.membershipEvidence)));
  assert.match(profile.reviewers[0].role, /Chair/);
  assert.match(profile.reviewers[2].role, /Unaffiliated nonscientific voting/);
  assert.ok(!profile.reviewers.some(({ name }) => name.includes("Inacay") || name.includes("Sullivan")));
  assert.equal(profile.sources.length, 2);
  assert.ok(profile.warnings.some((warning) => warning.includes("medical IRB 1")));
});

test("historical or stale rosters and absent membership headers cannot establish current names", async () => {
  const cases = [
    ["uc-san-francisco", { "ucsf-roster": ucsfText.replace("Current membership:", "Former membership:") }],
    ["uc-san-francisco", { "ucsf-roster": ucsfText.replace("October 1, 2026", "October 1, 2023") }],
    ["stanford", { "stanford-roster": stanfordRoster.replace("2026-2027", "2025-2026") }],
    ["stanford", { "stanford-index": stanfordIndex.replaceAll("2026-2027", "2025-2026") }],
    ["stanford", { "stanford-roster": stanfordRoster.replace("VOTING MEMBERS", "FORMER MEMBERS") }],
  ];
  for (const [university, overrides] of cases) {
    const profile = await publicInstitutionPreview(university, { now, fetchSource: fixtures(overrides) });
    assert.ok(profile.reviewers.every(({ kind }) => kind === "composite"), JSON.stringify(overrides));
    assert.ok(profile.warnings.some((warning) => warning.includes("fictional composite")));
  }
});

test("UCSD verifies policy and dated roster-availability evidence without turning office staff into board members", async () => {
  const profile = await publicInstitutionPreview("uc-san-diego", { now, fetchSource: fixtures() });
  assert.equal(profile.status, "partial");
  assert.ok(profile.reviewers.every(({ kind }) => kind === "composite"));
  assert.equal(profile.policies[0].sourceUrl, PUBLIC_INSTITUTION_SOURCES["uc-san-diego"][0].url);
  assert.equal(profile.rosterAvailability.sourceDate, "April 8, 2024");
  assert.ok(ucsdAvailability.includes(profile.rosterAvailability.evidence));
  assert.ok(profile.warnings.some((warning) => warning.includes("April 8, 2024")));
});

test("custom University of San Diego extracts its explicit representatives and excludes administrators and analysts", async () => {
  const profile = await publicInstitutionPreview({ id: "other", name: "University of San Diego" }, { now, fetchSource: fixtures() });
  assert.equal(profile.status, "verified");
  assert.deepEqual(profile.reviewers.map(({ name }) => name), ["Jane Georges", "Angelica Almonte", "Talia Leibovitz"]);
  assert.ok(profile.reviewers.every(({ membershipEvidence }) => usdText.includes(membershipEvidence)));
  assert.ok(!profile.reviewers.some(({ name }) => name.includes("Choi-Fitzpatrick") || name.includes("Marcus")));
});

test("unknown institutions and malicious URL-like custom names never choose outbound network destinations", async () => {
  for (const university of [{ id: "other", name: "https://127.0.0.1/private" }, { id: "other", name: "University of San Diego.attacker.example" }, "independent", "harvard"]) {
    const profile = await publicInstitutionPreview(university, { now, fetchSource: () => assert.fail("Unmapped universities must not make network requests") });
    assert.equal(profile.status, "composite");
    assert.deepEqual(profile.sources, []);
  }
  await assert.rejects(publicInstitutionPreview({ id: "other", name: "University\u0000" }), (error) => error.code === "invalid_university");
  await assert.rejects(publicInstitutionPreview(["stanford"]), (error) => error.code === "invalid_university");
});

test("unreadable and off-domain evidence yields composite profiles and cancellation interrupts lookup", async () => {
  for (const fetchSource of [async () => { throw new Error("Network unavailable"); }, async () => ({ url: "https://attacker.example/roster", text: ucsfText })]) {
    const profile = await publicInstitutionPreview("uc-san-francisco", { now, fetchSource });
    assert.equal(profile.status, "composite");
    assert.deepEqual(profile.sources, []);
  }
  const abort = new AbortController();
  await assert.rejects(publicInstitutionPreview("uc-san-francisco", { now, signal: abort.signal, fetchSource: async () => { abort.abort(); return { url: sources[0].url, text: ucsfText }; } }), (error) => error.code === "request_cancelled");
});

function request(body, { method = "POST", headers = {} } = {}) {
  return new Request("http://localhost/api/institution-preview", { method, headers: { "content-type": "application/json", ...headers }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
}

test("public preview handler works without an account or API key and returns bounded no-store JSON", async () => {
  const handle = createPublicInstitutionPreviewHandler({ fetchSource: fixtures(), now: () => now });
  const response = await handle(request({ university: "uc-san-francisco" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).profile.reviewers[0].name, "Matthias Behrends");
});

test("public preview handler rejects invalid methods, cross-site requests, invalid universities and oversized input before fetching", async () => {
  const handle = createPublicInstitutionPreviewHandler({ fetchSource: () => assert.fail("Invalid requests must not reach university sites") });
  assert.equal((await handle(request(null, { method: "GET" }))).status, 405);
  assert.equal((await handle(request({ university: "stanford" }, { headers: { origin: "https://attacker.example" } }))).status, 403);
  assert.equal((await handle(request({ university: "stanford" }, { headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await handle(request({ university: { id: "arbitrary", name: "Attacker" } }))).status, 400);
  assert.equal((await handle(request({ university: "stanford", padding: "x".repeat(2100) }))).status, 413);
  assert.equal((await handle(request({ university: "stanford" }, { headers: { "content-type": "text/plain" } }))).status, 415);
});
