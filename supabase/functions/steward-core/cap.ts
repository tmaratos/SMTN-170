/**
 * Official CAP website search (gocivilairpatrol.com) — no scraping.
 * Future: private index via Edge Function + Supabase storage for approved CAP pages.
 */

export const CAP_SOURCE = "Source: Official CAP Website";
export const CAP_EXTRA_DISCLAIMER =
  "Steward can help locate official CAP resources, but the official CAP publication or command guidance controls.";

const TOPICS = [
  { patterns: [/uniform\s*standard|uniform\s*guidance|wear\s*of\s*uniform|cap\s*uniform/i], query: "uniform standards", section: "uniform standards and wear" },
  { patterns: [/inspection\s*guidance|sui\b|subordinate\s*unit\s*inspection/i], query: "inspection SUI guidance", section: "inspection and SUI guidance" },
  { patterns: [/aerospace\s*education|aex\b/i], query: "aerospace education resources", section: "aerospace education resources" },
  { patterns: [/emergency\s*services|es\s*guidance/i], query: "emergency services guidance", section: "emergency services" },
  { patterns: [/cap\s*safety|safety\s*resources|orms/i], query: "safety resources ORMS", section: "safety and risk management" },
  { patterns: [/cadet\s*program|cadet\s*protection/i], query: "cadet programs guidance", section: "cadet programs" },
  { patterns: [/cap\s*finance|squadron\s*finance/i], query: "finance squadron guidance", section: "finance and squadron funds" },
  { patterns: [/senior\s*member\s*training|cap\s*training/i], query: "senior member training", section: "training and professional development" },
  { patterns: [/cap\s*form|download\s*form/i], query: "forms publications", section: "official forms and publications" },
  { patterns: [/cap\s*regulation|publications\s*library/i], query: "regulations publications", section: "CAP regulations and publications" },
];

const GENERAL = [
  /capr\s*\d/i, /capm\s*\d/i, /pam\s*\d/i, /cap\s*regulation/i, /cap\s*standard/i,
  /cap\s*reference/i, /cap\s*form/i, /official\s*cap/i, /gocivilairpatrol/i, /wing\s*manual/i,
  /find\s+capr/i, /search\s+.*cap/i,
];

export function buildCapSearchUrl(query: string): string {
  const q = `site:gocivilairpatrol.com ${(query || "").trim()}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function extractCapr(text: string): string {
  const m = text.match(/capr\s*-?\s*(\d+)\s*-?\s*(\d+)?/i);
  if (!m) return "";
  return m[2] ? `CAPR ${m[1]}-${m[2]}` : `CAPR ${m[1]}`;
}

function matchTopic(text: string) {
  for (const t of TOPICS) {
    if (t.patterns.some((p) => p.test(text))) return t;
  }
  return null;
}

export function isCapGuidanceRequest(text: string, activeMode?: string): boolean {
  if (activeMode === "cap") return true;
  if (/uniform/i.test(text) && /meeting|agenda|schedule/i.test(text)) return false;
  if (GENERAL.some((p) => p.test(text))) return true;
  if (matchTopic(text)) return true;
  return /\bcapr\b|\bcapm\b/i.test(text);
}

export function buildCapGuidance(userText: string) {
  const topic = matchTopic(userText);
  const capr = extractCapr(userText);
  let searchQuery = "";
  let sectionHint = "the topic you asked about";

  if (capr) {
    searchQuery = capr;
    sectionHint = capr;
  } else if (topic) {
    searchQuery = topic.query;
    sectionHint = topic.section;
  } else {
    searchQuery = userText.replace(/^(please|find|search|where)\s+/gi, "").trim().slice(0, 120) || "CAP senior member resources";
    sectionHint = searchQuery;
  }

  const searchUrl = buildCapSearchUrl(searchQuery);
  const intro = capr
    ? `I found the official CAP website search path for ${capr}.`
    : topic
      ? `I found the official CAP website search path for ${topic.section}.`
      : "I found the official CAP website search path for that topic.";

  const text = [
    intro,
    "",
    `Look for the section about ${sectionHint} on gocivilairpatrol.com. Results are from a site-limited search and may not be the exact publication—verify against official CAP material and wing guidance.`,
    "",
    CAP_EXTRA_DISCLAIMER,
  ].join("\n");

  return {
    text,
    source: CAP_SOURCE,
    dataConnected: false,
    capSearch: { searchQuery, searchUrl, sectionHint, openInNewTab: true },
  };
}
