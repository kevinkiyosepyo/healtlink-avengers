import { compositeInstitution, COMPOSITE_REVIEWERS, institutionUniversity } from "./institutions.js";
import { fetchOfficialPage, officialUrl } from "./officialSources.js";
import { HttpError, json, readJson } from "./security.js";

// This public preview never searches a user-supplied URL and never sends study
// documents or credentials. Only these audited public sources are requested.
// The Stanford PDF is linked as IRB 1's current roster by its official index;
// Box's public download host is permitted only for that fixed catalogue entry.
export const PUBLIC_INSTITUTION_SOURCES = Object.freeze({
  "uc-san-francisco": [
    { url: "https://irb.ucsf.edu/irb-rosters-meeting-dates", domains: ["ucsf.edu"], kind: "ucsf-roster", title: "UCSF IRB rosters and current leadership membership" },
  ],
  stanford: [
    { url: "https://irb.stanford.edu/stanford-irb-office/irb-rosters", domains: ["stanford.edu"], kind: "stanford-index", title: "Stanford official IRB roster index" },
    { url: "https://stanfordmedicine.app.box.com/public/static/2oa2s0876bknxtsr4ek5f3lx2apd8tzx.pdf", domains: ["stanfordmedicine.app.box.com", "public.boxcloud.com"], kind: "stanford-roster", title: "Stanford IRB 1 voting membership, 2026–2027" },
  ],
  "uc-san-diego": [
    { url: "https://irb.ucsd.edu/committee-members/prospective-members.html", domains: ["ucsd.edu"], kind: "ucsd-policy", title: "UC San Diego official IRB committee roles" },
    { url: "https://actri.ucsd.edu/resources/compass/irb-review-approval/_files-irb-review-approval/Sponsor-Letter-5-31-23.pdf", domains: ["ucsd.edu"], kind: "ucsd-availability", title: "UC San Diego sponsor letter on roster availability (dated source)" },
  ],
  "university-of-san-diego": [
    { url: "https://www.sandiego.edu/irb/general-info/members.php", domains: ["sandiego.edu"], kind: "usd-roster", title: "University of San Diego official IRB members" },
  ],
});

const SIMULATION_NOTICE = "These are simulated reviewers informed by public roles, not the real people's statements, predicted votes, or an official IRB decision.";
const GENERIC_FOCUS = {
  chair: "Generic chair review: study purpose, participant risk, safeguards, and completeness of the protocol.",
  scientific: "Generic scientific review: whether the design answers the research question, methods are justified, and risks are minimized.",
  community: "Generic community review: understandable consent, voluntary participation, recruitment fairness, and practical participant burdens.",
};

function text(value) { return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : ""; }
function historical(value) { return /\b(?:former|past member|previous membership|no longer|archived membership|emeritus)\b/i.test(value); }
function nameValid(value) { return value.length >= 4 && value.length <= 100 && /^[\p{L}][\p{L}\p{M} .,'’\-]+$/u.test(value) && value.split(/\s+/u).length >= 2 && !historical(value); }
function evidence(page, excerpt) { return excerpt.length >= 12 && excerpt.length <= 700 && page.text.includes(excerpt); }

function reviewer(page, { name, role, membershipEvidence, focus = "scientific", publishedName = name }) {
  if (!nameValid(name) || !role || historical(membershipEvidence) || !evidence(page, membershipEvidence)
    || !membershipEvidence.includes(publishedName)) return null;
  return {
    name, role, kind: "public-profile", sourceUrls: [page.source.url], membershipEvidence,
    publishedName, reviewFocus: GENERIC_FOCUS[focus],
    background: `Public board role verified from the linked source. No additional biography was retrieved. ${GENERIC_FOCUS[focus]}`,
  };
}

function extractUcsf(page, now) {
  const section = page.text.match(/IRB Leadership Group The IRB Leadership Group[\s\S]*?Current membership:\s*([\s\S]*?)\s+Archived IRB Committee Rosters\/Meeting Dates/i)?.[1];
  if (!section || !recentPage(page.text, now)) return [];
  const roles = /Director, HRPP|(?:Vice )?Chair, [\p{L} .\-]+? IRB|Community Member|SFVAHCS Representative/gu;
  const output = [];
  let offset = 0;
  for (const match of section.matchAll(roles)) {
    const name = section.slice(offset, match.index).trim();
    offset = match.index + match[0].length;
    // HRPP office staff are not assumed to be IRB board members.
    if (match[0] === "Director, HRPP" || match[0] === "SFVAHCS Representative") continue;
    const entry = reviewer(page, { name, role: match[0], membershipEvidence: `${name} ${match[0]}`, focus: match[0] === "Community Member" ? "community" : "chair" });
    if (entry) output.push(entry);
    if (output.length === 3) break;
  }
  return output;
}

function recentPage(value, now) {
  const match = value.match(/Last updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/i);
  if (!match) return false;
  const updated = Date.parse(match[1]);
  return Number.isFinite(updated) && updated <= now + 24 * 60 * 60 * 1000 && now - updated <= 400 * 24 * 60 * 60 * 1000;
}

function displayRosterName(value) {
  const [last, first] = value.split(/,\s*/u);
  return `${first} ${last.toLocaleLowerCase("en-US").replace(/(^|[ '\-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"))}`;
}

function extractStanford(page, index, now) {
  const period = page.text.match(/Medical Research\s+(20\d{2})-(20\d{2}) IRB #1: Roster/);
  const date = new Date(now);
  const academicYear = date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  if (!period || Number(period[1]) !== academicYear || Number(period[2]) !== academicYear + 1
    || !index?.text.includes(`${period[1]}-${period[2]}`) || !index.text.includes("Current Rosters")) return [];
  const voting = page.text.match(/VOTING MEMBERS ([\s\S]*?) IRB 1 Roster Page 2 of 3/);
  if (!voting || historical(voting[1])) return [];
  const split = voting[1].split("Two Outside Nonscientific Members Otherwise Unaffiliated with Stanford");
  const names = /([A-Z][A-Z’' \-]+, [\p{L} .’'\-]+?)\s*\([^)]{1,50}\)\s*/gu;
  const rows = [...split[0].matchAll(names)];
  const output = [];
  for (const [i, row] of rows.entries()) {
    const end = rows[i + 1]?.index ?? split[0].length;
    const excerpt = split[0].slice(row.index, end).trim();
    const chair = excerpt.includes("(CHAIR)");
    const membershipEvidence = chair ? excerpt : `VOTING MEMBERS ${voting[1].slice(0, row.index + excerpt.length)}`;
    const entry = reviewer(page, { name: displayRosterName(row[1]), publishedName: row[1], role: chair ? "Chair, Stanford medical IRB 1" : "Voting scientific member, Stanford medical IRB 1", membershipEvidence, focus: chair ? "chair" : "scientific" });
    if (entry) output.push(entry);
    if (output.length === 2) break;
  }
  const outsider = split[1]?.match(names);
  if (outsider) {
    const match = [...split[1].matchAll(names)][0];
    const next = [...split[1].matchAll(names)][1];
    const excerpt = split[1].slice(match.index, next?.index ?? split[1].length).trim();
    const membershipEvidence = `Two Outside Nonscientific Members Otherwise Unaffiliated with Stanford ${excerpt}`;
    const entry = reviewer(page, { name: displayRosterName(match[1]), publishedName: match[1], role: "Unaffiliated nonscientific voting member, Stanford medical IRB 1", membershipEvidence, focus: "community" });
    if (entry) output.push(entry);
  }
  return output;
}

function extractUsd(page) {
  if (!page.text.includes("Members - Institutional Review Board - University of San Diego") || historical(page.text)) return [];
  const output = [];
  const chair = page.text.match(/(Dr\. [\p{L} .’'\-]+?), (IRB Chairperson)\s+(Resource person and ombudsman[^@]{0,140}?related to IRB)/u);
  if (chair) {
    const entry = reviewer(page, { name: chair[1].replace(/^Dr\. /, ""), publishedName: chair[1], role: chair[2], membershipEvidence: chair[0], focus: "chair" });
    if (entry) output.push(entry);
  }
  const community = page.text.match(/(Dr\. [\p{L} .’'\-]+?), (Community Member Representative)/u);
  if (community) {
    const entry = reviewer(page, { name: community[1].replace(/^Dr\. /, ""), publishedName: community[1], role: community[2], membershipEvidence: community[0], focus: "community" });
    if (entry) output.push(entry);
  }
  // An explicitly labelled representative section establishes membership; office
  // administrators, coordinators and analysts are deliberately not promoted.
  const faculty = page.text.match(/Academic Unit IRB Representatives School of Leadership and Education Sciences Review by Principal Investigator's Last Name (Dr\. [\p{L} .’'\-]+?)\s+[a-z\d._%+\-]+@sandiego\.edu\s+A - D/u);
  if (faculty) {
    const entry = reviewer(page, { name: faculty[1].replace(/^Dr\. /, ""), publishedName: faculty[1], role: "Academic unit IRB representative, Leadership and Education Sciences", membershipEvidence: faculty[0], focus: "scientific" });
    if (entry) output.push(entry);
  }
  return output;
}

function policy(page, title, pattern) {
  const summary = page.text.match(pattern)?.[0];
  return summary && evidence(page, summary) ? { title, summary, sourceUrl: page.source.url } : null;
}

export async function publicInstitutionPreview(value, { fetchSource = fetchOfficialPage, signal, now = Date.now() } = {}) {
  const university = institutionUniversity(value);
  const catalogueId = university.id === "other" && /^(?:University of San Diego|USD)$/i.test(university.name)
    ? "university-of-san-diego" : university.id;
  const entries = PUBLIC_INSTITUTION_SOURCES[catalogueId];
  if (!entries) return { ...compositeInstitution(university,
    "This university has no credential-free public-source adapter yet. Connect OpenAI or Anthropic for an official-domain lookup; the preview uses explicitly fictional composite reviewers.", now), lookupMode: "public-preview" };
  if (signal?.aborted) throw new HttpError(499, "request_cancelled", "Institution lookup was cancelled.");
  const pages = new Map();
  await Promise.all(entries.map(async (source) => {
    try {
      const page = await fetchSource(source.url, source.domains, { signal });
      if (officialUrl(page?.url, source.domains) && typeof page?.text === "string" && page.text.length <= 180_000)
        pages.set(source.kind, { ...page, text: text(page.text), source });
    } catch { /* Unavailable evidence never establishes a member or requirement. */ }
  }));
  if (signal?.aborted) throw new HttpError(499, "request_cancelled", "Institution lookup was cancelled.");
  const ucsf = pages.get("ucsf-roster");
  const stanford = pages.get("stanford-roster");
  const usd = pages.get("usd-roster");
  const named = ucsf ? extractUcsf(ucsf, now) : stanford ? extractStanford(stanford, pages.get("stanford-index"), now) : usd ? extractUsd(usd) : [];
  const policies = [];
  if (ucsf) policies.push(policy(ucsf, "UCSF submission deadlines", /Submission deadlines apply only to modifications and continuing review submissions that require full committee review\./));
  const index = pages.get("stanford-index");
  if (index) policies.push(policy(index, "Stanford IRB mission", /participants' rights and welfare are adequately protected, research is guided by the ethical principles of respect for persons, beneficence, and justice as set forth in the Belmont Report/));
  const ucsd = pages.get("ucsd-policy");
  if (ucsd) policies.push(policy(ucsd, "UC San Diego IRB committee composition", /Among those members must be at least one person with a scientific background, one person with a non-scientific background, and one person unaffiliated with the institution\./));
  const profile = compositeInstitution(university, undefined, now);
  profile.reviewers = named.map((entry, position) => ({ id: `public-${catalogueId}-${position + 1}`, ...entry }));
  for (const composite of COMPOSITE_REVIEWERS) {
    if (profile.reviewers.length === 3) break;
    profile.reviewers.push({ ...composite, sourceUrls: [] });
  }
  profile.policies = policies.filter(Boolean);
  profile.sources = [...pages.values()].map(({ source }) => ({ url: source.url, title: source.title }));
  profile.status = named.length === 3 ? "verified" : (named.length || profile.policies.length) ? "partial" : "composite";
  profile.lookupMode = "public-preview";
  profile.warnings = [SIMULATION_NOTICE, "Public pages may lag membership changes. Source verification was performed at the displayed retrieval time."];
  if (named.length && catalogueId === "uc-san-francisco") profile.warnings.push("This preview samples UCSF's public IRB leadership group. Your study's assigned IRB committee may differ.");
  if (named.length && catalogueId === "stanford") profile.warnings.push("This preview samples Stanford medical IRB 1. Stanford has multiple boards, including a separate non-medical IRB.");
  if (named.length < 3) profile.warnings.push(`${3 - named.length} fictional composite reviewer${named.length < 2 ? "s" : ""} included because sufficient public membership could not be verified.`);
  const availability = pages.get("ucsd-availability");
  const unavailable = availability?.text.match(/UCSD does not currently make member rosters available, but roster information is properly filed with DHHS\./)?.[0];
  if (unavailable) {
    const sourceDate = availability.text.match(/\b[A-Z][a-z]+ \d{1,2}, 20\d{2}\b/)?.[0] || "undated";
    profile.rosterAvailability = { status: "not-public-in-source", evidence: unavailable, sourceUrl: availability.source.url, sourceDate };
    profile.warnings.push(`UC San Diego's sponsor letter dated ${sourceDate} says its member rosters are not publicly available. No current member identities were assumed.`);
  }
  if (!pages.size) profile.warnings.push("Public university pages could not be retrieved. Retry to verify the institution's sources.");
  if (!profile.policies.length) profile.warnings.push("No institutional policy text was verified. Preview questions use general research ethics principles.");
  return profile;
}

export function createPublicInstitutionPreviewHandler({ fetchSource, now } = {}) {
  return async function handlePublicInstitutionPreview(request) {
    try {
      if (request.method !== "POST") return json({ error: "Use POST to look up a university.", code: "method_not_allowed" }, 405, { Allow: "POST" });
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
        throw new HttpError(403, "origin_rejected", "This request must come from this website.");
      const input = await readJson(request, 2048);
      const profile = await publicInstitutionPreview(input.university, { fetchSource, signal: request.signal, now: typeof now === "function" ? now() : now });
      return json({ profile });
    } catch (error) {
      return error instanceof HttpError ? json({ error: error.message, code: error.code }, error.status)
        : json({ error: "The public university lookup could not be completed.", code: "institution_lookup_failed" }, 500);
    }
  };
}
