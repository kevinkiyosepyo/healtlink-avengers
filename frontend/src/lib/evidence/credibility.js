// Transparent, rule-based credibility scoring. Every point has a stated reason
// so researchers can audit (and disagree with) why a source ranked where it did.

const DESIGN_RULES = [
  { test: /meta-analysis|systematic review/, points: 35, reason: "systematic review / meta-analysis" },
  { test: /randomi[sz]ed controlled trial|\brct\b/, points: 28, reason: "randomized controlled trial" },
  { test: /practice guideline|guideline|consensus statement/, points: 26, reason: "guideline / consensus statement" },
  { test: /clinical trial|phase[ _]?[234]|interventional/, points: 20, reason: "clinical trial" },
  { test: /cohort|observational|case-control|cross-sectional/, points: 15, reason: "observational study" },
  { test: /review/, points: 12, reason: "narrative review" },
];
const PENALTIES = [
  { test: /preprint|posted-content/, points: -15, reason: "preprint (not peer reviewed)" },
  { test: /editorial|comment|letter|news/, points: -10, reason: "editorial / commentary" },
  { test: /meeting|conference|abstract/, points: -6, reason: "conference abstract" },
];

/** Score a scholarly source 0–100 with reasons. `now` is injectable for tests. */
export function scoreSource(source, now = new Date()) {
  const reasons = [];
  let score = 20;
  const text = `${source.studyTypes.join(" ")} ${source.title}`.toLowerCase();

  const design = DESIGN_RULES.find((rule) => rule.test.test(text));
  if (design) {
    score += design.points;
    reasons.push(`+${design.points} ${design.reason}`);
  }
  for (const penalty of PENALTIES) {
    if (penalty.test.test(text) || penalty.test.test(String(source.venueType ?? ""))) {
      score += penalty.points;
      reasons.push(`${penalty.points} ${penalty.reason}`);
    }
  }
  if (source.kind === "paper" && source.venue && source.venueType !== "preprint") {
    score += 10;
    reasons.push(`+10 published in ${source.venue}`);
  }
  if (source.kind === "trial") {
    score += 10;
    reasons.push("+10 registered trial (prospective registry)");
    if (source.hasResults) {
      score += 8;
      reasons.push("+8 results posted");
    }
  }
  // Citations relative to age, log-scaled so classics don't drown recent work.
  const age = source.year ? Math.max(1, now.getFullYear() - source.year + 1) : null;
  if (source.citations > 0 && age) {
    const perYear = source.citations / age;
    const points = Math.min(15, Math.round(Math.log10(1 + perYear) * 10));
    if (points) {
      score += points;
      reasons.push(`+${points} ${source.citations} citations (~${perYear.toFixed(1)}/yr)`);
    }
  }
  if (age !== null && age <= 6) {
    score += 5;
    reasons.push("+5 published in the last 5 years");
  } else if (age !== null && age > 15) {
    score -= 5;
    reasons.push("-5 older than 15 years");
  }
  if ((source.alsoIn ?? []).length) {
    score += 3;
    reasons.push(`+3 indexed in ${source.alsoIn.length + 1} databases`);
  }
  if (!source.abstract) {
    score -= 10;
    reasons.push("-10 no abstract available to verify claims");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, tier: score >= 65 ? "high" : score >= 45 ? "moderate" : "low", reasons };
}

const STOPWORDS = new Set("a an and are as at be by for from how in into is it of on or that the this to with what when which would could might will does do clinical trial trials study studies".split(" "));
const tokens = (text) => String(text).toLowerCase().replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));

/**
 * Relevance 0–1: share of the distinct query terms (across all queries) that
 * appear in the source's title or abstract. Simple and inspectable on purpose.
 */
export function relevance(source, queries) {
  const terms = [...new Set(queries.flatMap(tokens))];
  if (!terms.length) return 1;
  const haystack = ` ${tokens(`${source.title} ${source.abstract}`).join(" ")} `;
  const hits = terms.filter((term) => haystack.includes(` ${term}`));
  return Math.round((hits.length / terms.length) * 100) / 100;
}

// Web domains, checked only after scholarly sources. Unknown domains are low.
const DOMAIN_TIERS = [
  { test: /(^|\.)(nih|cdc|fda|hhs|ahrq|clinicaltrials)\.gov$|(^|\.)who\.int$|(^|\.)ema\.europa\.eu$|(^|\.)nice\.org\.uk$/, score: 90, reason: "government or public-health agency" },
  { test: /(^|\.)(nejm\.org|thelancet\.com|jamanetwork\.com|bmj\.com|nature\.com|science\.org|cochranelibrary\.com|annals\.org|plos\.org|biomedcentral\.com|springer\.com|wiley\.com|sciencedirect\.com|ncbi\.nlm\.nih\.gov|europepmc\.org)$/, score: 85, reason: "peer-reviewed publisher or index" },
  { test: /\.gov$|\.edu$|\.ac\.uk$/, score: 75, reason: "government or academic institution" },
  { test: /(^|\.)(ich\.org|acrpnet\.org|socra\.org|transceleratebiopharmainc\.com|ctti-clinicaltrials\.org)$/, score: 70, reason: "clinical-research professional body" },
  { test: /(^|\.)(statnews\.com|reuters\.com|apnews\.com|fiercebiotech\.com|endpts\.com)$/, score: 50, reason: "established health/news outlet" },
];
export const WEB_CREDIBILITY_THRESHOLD = 65;

export function scoreWebSource(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { score: 0, tier: "low", reasons: ["invalid url"], host: null };
  }
  const tier = DOMAIN_TIERS.find((t) => t.test.test(host));
  const score = tier ? tier.score : 30;
  return { score, tier: score >= WEB_CREDIBILITY_THRESHOLD ? "high" : score >= 45 ? "moderate" : "low", reasons: [tier ? tier.reason : "unrecognized domain"], host };
}
