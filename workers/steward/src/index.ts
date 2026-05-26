import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Env {
  OPENAI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY?: string;
}

interface StewardRequest {
  message?: string;
  pagePath?: string;
  pageTitle?: string;
  conversationId?: string;
  pendingActionId?: string;
  confirmation?: boolean;
  actionPayload?: Record<string, unknown> | null;
  siteIndexSummary?: SiteIndexSummary;
}

interface SiteIndexSummary {
  currentPage?: { path?: string; title?: string; summary?: string };
  matchingPages?: Array<{ path: string; title?: string; score?: number }>;
  matchingActions?: Array<{ label: string; target: string }>;
  nav?: Array<{ label: string; target: string; section?: string }>;
  userRole?: string;
  canAccessAdmin?: boolean;
  navigationIntent?: boolean;
}

interface Profile {
  uid: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  rank?: string;
  role?: string;
  status?: string;
  accountStatus?: string;
}

interface LlmPayload {
  reply?: string;
  intent?: string;
  suggestions?: string[];
  capSearchQuery?: string | null;
  navigateTo?: { path?: string; label?: string } | null;
  writeRequest?: {
    summary?: string;
    actionId?: string;
  } | null;
  adminOnly?: boolean;
}

interface StewardResponse {
  ok: boolean;
  reply: string;
  intent?: string | null;
  suggestions?: string[];
  openUrl?: string | null;
  navigateTo?: { path: string; label: string } | null;
  navigateLabel?: string | null;
  pendingConfirmation?: {
    id: string;
    action_id: string;
    summary: string;
    user_text?: string;
    payload?: Record<string, unknown>;
  } | null;
  actionResult?: string | null;
  conversationId?: string | null;
  conversationSaveWarning?: boolean;
  error?: string;
}

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const ALLOWED_ORIGINS = new Set([
  "https://tmaratos.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

const DISCLAIMER =
  "Steward responses are assistance only. Official CAP publications and command guidance remain authoritative.";

const ADMIN_INTENT_PATTERNS = [
  /approve\s+(user|member|account)/i,
  /deny\s+(user|member|account)/i,
  /change\s+(role|permission)/i,
  /delete\s+user/i,
  /promote\s+to\s+(admin|commander)/i,
  /user\s+management/i,
  /pending\s+approval/i,
];

const CAP_PATTERNS = [
  /capr\s*\d/i,
  /capm\s*\d/i,
  /pam\s*\d/i,
  /cap\s*regulation/i,
  /cap\s*standard/i,
  /cap\s*form/i,
  /uniform\s*standard/i,
  /inspection\s*guidance/i,
  /aerospace\s*education/i,
  /emergency\s*services/i,
  /cadet\s*program/i,
  /official\s*cap/i,
  /gocivilairpatrol/i,
  /find\s+capr/i,
  /search\s+.*cap/i,
  /publications?\s*library/i,
];

const WRITE_PATTERNS = [
  /\b(create|add|new|make|build|draft|generate|update|change|move|rename|assign|complete|mark.*done|delete|remove)\b/i,
];

const BLOCKED_WRITE_ACTIONS = new Set([
  "approve_user",
  "change_role",
  "delete_user",
  "overwrite_profile",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost(?::\d+)?$/.test(origin));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function jsonResponse(body: StewardResponse | { error: string }, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function firestoreString(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.stringValue === "string") return v.stringValue;
  return undefined;
}

function parseFirestoreProfile(fields: Record<string, unknown> | undefined, uid: string): Profile {
  if (!fields) return { uid };
  return {
    uid,
    email: firestoreString(fields.email),
    firstName: firestoreString(fields.firstName),
    lastName: firestoreString(fields.lastName),
    preferredName: firestoreString(fields.preferredName),
    rank: firestoreString(fields.rank),
    role: firestoreString(fields.role),
    status: firestoreString(fields.status),
    accountStatus: firestoreString(fields.accountStatus),
  };
}

async function verifyFirebaseToken(token: string, projectId: string): Promise<{ uid: string; email?: string }> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error("Invalid token subject");
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}

async function fetchProfile(projectId: string, uid: string, idToken: string): Promise<Profile | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/profiles/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Profile lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const doc = (await res.json()) as { fields?: Record<string, unknown> };
  return parseFirestoreProfile(doc.fields, uid);
}

function firestoreBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseFirestoreValue(value: any): unknown {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return !!value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const vals = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return vals.map(parseFirestoreValue);
  }
  if ("mapValue" in value) {
    const out: Record<string, unknown> = {};
    const fields = value.mapValue?.fields || {};
    Object.keys(fields).forEach((k) => {
      out[k] = parseFirestoreValue(fields[k]);
    });
    return out;
  }
  return undefined;
}

function parseFirestoreDoc(doc: any): { id: string; data: Record<string, unknown> } {
  const name = String(doc?.name || "");
  const id = name.split("/").pop() || "";
  const fields = doc?.fields || {};
  const data: Record<string, unknown> = {};
  Object.keys(fields).forEach((k) => {
    data[k] = parseFirestoreValue(fields[k]);
  });
  return { id, data };
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  if (typeof value === "object") {
    const fields: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      fields[k] = toFirestoreValue(v);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined) return;
    out[k] = toFirestoreValue(v);
  });
  return out;
}

async function listCollection(
  projectId: string,
  idToken: string,
  collection: string,
  pageSize = 50
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const res = await fetch(`${firestoreBase(projectId)}/${collection}?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Could not read ${collection}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { documents?: any[] };
  return (data.documents || []).map(parseFirestoreDoc);
}

async function createDocument(
  projectId: string,
  idToken: string,
  collection: string,
  payload: Record<string, unknown>,
  docId?: string
): Promise<{ id: string; data: Record<string, unknown> }> {
  const suffix = docId ? `?documentId=${encodeURIComponent(docId)}` : "";
  const res = await fetch(`${firestoreBase(projectId)}/${collection}${suffix}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(payload) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Could not create ${collection} record: ${txt.slice(0, 220)}`);
  }
  return parseFirestoreDoc(await res.json());
}

async function patchDocument(
  projectId: string,
  idToken: string,
  collection: string,
  docId: string,
  payload: Record<string, unknown>
): Promise<{ id: string; data: Record<string, unknown> }> {
  const mask = Object.keys(payload)
    .filter((k) => payload[k] !== undefined)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const q = mask ? `?${mask}` : "";
  const res = await fetch(`${firestoreBase(projectId)}/${collection}/${encodeURIComponent(docId)}${q}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(payload) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Could not update ${collection}/${docId}: ${txt.slice(0, 220)}`);
  }
  return parseFirestoreDoc(await res.json());
}

function profileStatus(profile: Profile): string {
  return (profile.status || profile.accountStatus || "").toLowerCase();
}

function isApprovedProfile(profile: Profile): boolean {
  const s = profileStatus(profile);
  return s === "approved" || s === "active";
}

function isAdminProfile(profile: Profile): boolean {
  const role = (profile.role || "").toLowerCase();
  return role === "commander" || role === "admin";
}

function displayName(profile: Profile): string {
  if (profile.preferredName?.trim()) return profile.preferredName.trim();
  const rank = (profile.rank || "").replace(/\.\s*$/, "");
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (rank && name) return `${rank} ${name}`;
  if (name) return name;
  return profile.email || "Member";
}

function buildCapSearchUrl(query: string): string {
  const q = `site:gocivilairpatrol.com ${(query || "").trim()}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function extractCapr(text: string): string {
  const m = text.match(/capr\s*-?\s*(\d+)\s*-?\s*(\d+)?/i);
  if (!m) return "";
  return m[2] ? `CAPR ${m[1]}-${m[2]}` : `CAPR ${m[1]}`;
}

function isCapQuery(text: string): boolean {
  return CAP_PATTERNS.some((p) => p.test(text));
}

function isAdminQuery(text: string): boolean {
  return ADMIN_INTENT_PATTERNS.some((p) => p.test(text));
}

function looksLikeWrite(text: string): boolean {
  return WRITE_PATTERNS.some((p) => p.test(text));
}

function buildSystemPrompt(profile: Profile): string {
  const name = displayName(profile);
  const role = profile.role || "member";
  return [
    "You are Steward, the TN-170 Senior Member operations portal assistant.",
    "Do not describe yourself as AI, a chatbot, or a language model.",
    "You do not speak with official CAP authority; official publications and command guidance remain authoritative.",
    "Help with meetings, schedules, tasks, organization chart, inspection readiness, BFR/flight review tracking, resource links, admin references, and locating official CAP regulations/forms/publications on gocivilairpatrol.com.",
    "Use the provided siteIndexSummary to answer portal navigation questions — suggest the correct portal page (calendar, meetings/schedule, tasks, flight reviews, inspection prep, files & resources, org chart, profile, admin).",
    "Never offer or perform file upload, import, OCR, or document parsing. Files & Resources is link-only in V1.",
    "Never claim you changed portal records. For create/update/delete requests, explain what would be done and that the member must confirm before any change is recorded.",
    "For admin-only topics (approving users, changing roles, deleting accounts), only assist command staff; otherwise direct members to their commander.",
    `Signed-in member: ${name} (role: ${role}).`,
    `Always end your reply with this disclaimer on its own line: ${DISCLAIMER}`,
    "",
    "Respond with JSON only (no markdown fences) using this schema:",
    '{"reply":"string","intent":"general|cap|meetings|tasks|flight_reviews|inspection|org_chart|files|profile|help|admin|navigate","suggestions":["short follow-up prompts, max 3"],"capSearchQuery":null,"writeRequest":null,"adminOnly":false,"navigateTo":null}',
    "Set navigateTo to {\"path\":\"page.html\",\"label\":\"Human label\"} when the user asks to open/go to a portal page and siteIndexSummary indicates a clear destination.",
    "Navigation mappings: approve users → admin.html; BFR/flight reviews → flight-review.html; create meeting → schedule.html or calendar.html; resource links → documents.html.",
    "Set capSearchQuery to a concise Google site search phrase when the user asks about CAP regulations, CAPR/CAPM, forms, uniforms, inspection guidance, aerospace, ES, cadet program, safety, or official CAP publications.",
    "Set writeRequest to {\"summary\":\"...\",\"actionId\":\"snake_case_id\"} when the user asks to create, update, assign, complete, rename, categorize, or delete portal records. Never set writeRequest for read-only questions.",
    "Set adminOnly true when the request requires commander/admin privileges.",
  ].join("\n");
}

function formatSiteIndexContext(summary?: SiteIndexSummary): string {
  if (!summary) return "";
  const parts = ["Portal site index summary:"];
  if (summary.currentPage) {
    parts.push(
      `Current page: ${summary.currentPage.title || ""} (${summary.currentPage.path || ""}) — ${summary.currentPage.summary || ""}`.trim()
    );
  }
  if (summary.matchingPages?.length) {
    parts.push(
      "Matching pages: " +
        summary.matchingPages.map((p) => `${p.title || p.path} (${p.path})`).join("; ")
    );
  }
  if (summary.matchingActions?.length) {
    parts.push(
      "Matching actions: " + summary.matchingActions.map((a) => `${a.label} → ${a.target}`).join("; ")
    );
  }
  if (summary.nav?.length) {
    parts.push("Nav: " + summary.nav.map((n) => `${n.label} (${n.target})`).join("; "));
  }
  parts.push(`User role: ${summary.userRole || "member"}. Admin access: ${summary.canAccessAdmin ? "yes" : "no"}.`);
  if (summary.navigationIntent) parts.push("User message appears to be a portal navigation request.");
  return parts.join("\n");
}

function deriveNavigateTo(
  message: string,
  summary: SiteIndexSummary | undefined,
  profile: Profile
): { path: string; label: string } | null {
  const q = message.trim().toLowerCase();
  const adminOk = isAdminProfile(profile) && summary?.canAccessAdmin !== false;

  const routes: Array<{ patterns: RegExp[]; path: string; label: string; adminOnly?: boolean }> = [
    { patterns: [/approve\s+users?/, /user\s+management/, /pending\s+members?/], path: "admin.html", label: "Admin", adminOnly: true },
    { patterns: [/\bbfr\b/, /flight\s+review/], path: "flight-review.html", label: "Flight Reviews" },
    { patterns: [/create\s+(a\s+)?meeting/, /meeting\s+schedule/, /build\s+(the\s+)?schedule/, /meeting\s+planner/], path: "schedule.html", label: "Meetings" },
    { patterns: [/take\s+me\s+to\s+(the\s+)?calendar/, /open\s+calendar/, /go\s+to\s+calendar/, /^calendar$/], path: "calendar.html", label: "Calendar" },
    { patterns: [/inspection/, /\bsui\b/, /readiness\s+checklist/], path: "sui-readiness.html", label: "Inspection Prep" },
    { patterns: [/org\s*chart/, /organization\s+chart/], path: "orgchart.html", label: "Organization Chart" },
    { patterns: [/resource\s+links?/, /files?\s+(&|and)\s+resources?/], path: "documents.html", label: "Files & Resources" },
    { patterns: [/\btasks?\b/, /open\s+tasks?/], path: "tasks.html", label: "Tasks" },
    { patterns: [/my\s+profile/], path: "profile.html", label: "My Profile" },
    { patterns: [/dashboard/, /\bhome\b/], path: "dashboard.html", label: "Home" },
  ];

  for (const route of routes) {
    if (route.adminOnly && !adminOk) continue;
    if (route.patterns.some((p) => p.test(q))) {
      return { path: route.path, label: route.label };
    }
  }

  const top = summary?.matchingActions?.[0] || null;
  if (top?.target) {
    if (top.target === "admin.html" && !adminOk) return null;
    return { path: top.target, label: top.label || top.target };
  }

  const page = summary?.matchingPages?.[0];
  if (page?.path && summary?.navigationIntent) {
    if (page.path === "admin.html" && !adminOk) return null;
    return { path: page.path, label: page.title || page.path };
  }

  return null;
}

type StewardIntent =
  | "what_can_you_do"
  | "how_to_use_portal"
  | "explain_current_page"
  | "portal_navigation"
  | "list_meetings"
  | "create_meeting"
  | "list_tasks"
  | "create_task"
  | "show_vacancies"
  | "create_org_position"
  | "list_inspection_items"
  | "create_inspection_item"
  | "due_soon_flight_reviews"
  | "create_flight_review"
  | "list_resource_links"
  | "create_resource_link"
  | "cap_reference_search"
  | "admin_help"
  | "unknown";

function detectIntent(message: string): StewardIntent {
  const q = message.toLowerCase();
  if (/what can you do|capabilities|help me understand/.test(q)) return "what_can_you_do";
  if (/explain this portal|how do i use (the )?portal/.test(q)) return "how_to_use_portal";
  if (/how do i use this page|what can i do on this page/.test(q)) return "explain_current_page";
  if (/where do i|take me to|open /.test(q)) return "portal_navigation";
  if (isCapQuery(message)) return "cap_reference_search";
  if (/where do i approve users|approval process|invite links/.test(q)) return "admin_help";
  if (/what tasks are open|list tasks|open tasks|needs attention/.test(q)) return "list_tasks";
  if (/create (a )?task|add (a )?task/.test(q)) return "create_task";
  if (/where do i add a meeting|list meetings|upcoming meetings/.test(q)) return "list_meetings";
  if (/create (a )?meeting|add (a )?meeting/.test(q)) return "create_meeting";
  if (/org chart vacancies|show vacancies|vacant positions/.test(q)) return "show_vacancies";
  if (/create org position|add position/.test(q)) return "create_org_position";
  if (/inspection items|inspection prep|sui checklist/.test(q)) return "list_inspection_items";
  if (/create inspection item|add inspection item/.test(q)) return "create_inspection_item";
  if (/flight reviews due soon|biannual flight reviews due soon|due soon.*flight review/.test(q)) return "due_soon_flight_reviews";
  if (/create flight review|add flight review/.test(q)) return "create_flight_review";
  if (/resource links|cap references|files and resources/.test(q)) {
    if (/add|create/.test(q)) return "create_resource_link";
    return "list_resource_links";
  }
  return "unknown";
}

function buildPendingAction(
  actionId: string,
  summary: string,
  payload: Record<string, unknown>,
  message: string
): StewardResponse["pendingConfirmation"] {
  return {
    id: `pending-${Date.now()}`,
    action_id: actionId,
    summary,
    user_text: message,
    payload,
  };
}

function parseTaskPayload(message: string): Record<string, unknown> {
  const cleaned = message.replace(/^create\s+(a\s+)?task\s*(to)?\s*/i, "").trim();
  const title = cleaned || "New squadron task";
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: "",
    status: "open",
    priority: "normal",
  };
}

function parseInspectionPayload(message: string): Record<string, unknown> {
  const cleaned = message.replace(/^create\s+(an?\s+)?inspection item\s*(for)?\s*/i, "").trim();
  const title = cleaned || "Inspection follow-up item";
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    category: "general",
    status: "open",
    notes: "",
  };
}

function parseResourcePayload(message: string): Record<string, unknown> {
  const urlMatch = message.match(/https?:\/\/\S+/i);
  const url = urlMatch ? urlMatch[0] : "";
  const titleGuess = message
    .replace(/^add\s+(a\s+)?resource link\s*(for|to)?\s*/i, "")
    .replace(url, "")
    .trim();
  return {
    title: titleGuess ? titleGuess.charAt(0).toUpperCase() + titleGuess.slice(1) : "New Resource Link",
    category: "general",
    url,
    notes: "",
    visibility: "senior_members",
  };
}

async function callOpenAI(env: Env, profile: Profile, body: StewardRequest): Promise<LlmPayload> {
  const siteContext = formatSiteIndexContext(body.siteIndexSummary);
  const userContent = [
    body.message ? `User message: ${body.message}` : "",
    body.pagePath ? `Page path: ${body.pagePath}` : "",
    body.pageTitle ? `Page title: ${body.pageTitle}` : "",
    siteContext,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(profile) },
        { role: "user", content: userContent || "Hello" },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty model response");

  try {
    return JSON.parse(raw) as LlmPayload;
  } catch {
    return { reply: raw, intent: "general" };
  }
}

function deriveCapQuery(message: string, llm: LlmPayload): string | null {
  if (llm.capSearchQuery?.trim()) return llm.capSearchQuery.trim();
  const capr = extractCapr(message);
  if (capr) return capr;
  if (isCapQuery(message) || llm.intent === "cap") {
    return message.replace(/^(please|find|search|where|show)\s+/gi, "").trim().slice(0, 120) || "CAP senior member resources";
  }
  return null;
}

interface WorkerContext {
  projectId: string;
  idToken: string;
  uid: string;
  email?: string;
  profile: Profile;
}

async function writeAuditLog(ctx: WorkerContext, action: string, targetCollection: string, targetId: string, details: string) {
  await createDocument(ctx.projectId, ctx.idToken, "auditLog", {
    action,
    actorUid: ctx.uid,
    actorEmail: ctx.email || ctx.profile.email || "",
    targetCollection,
    targetId,
    details,
    createdAt: nowIso(),
  });
}

function normalizeStatus(value: unknown): string {
  return String(value || "").toLowerCase().trim();
}

async function executeConfirmedWrite(
  ctx: WorkerContext,
  actionId: string,
  payload: Record<string, unknown>
): Promise<{ message: string; targetCollection: string; targetId: string }> {
  const now = nowIso();
  const actor = ctx.uid;
  if (actionId === "create_task") {
    const created = await createDocument(ctx.projectId, ctx.idToken, "tasks", {
      title: String(payload.title || "New squadron task"),
      description: String(payload.description || ""),
      status: "open",
      priority: String(payload.priority || "normal"),
      dueDate: payload.dueDate || null,
      assignedTo: payload.assignedTo || null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created the task "${created.data.title || "New squadron task"}".`, targetCollection: "tasks", targetId: created.id };
  }
  if (actionId === "create_meeting") {
    const created = await createDocument(ctx.projectId, ctx.idToken, "meetings", {
      title: String(payload.title || "Weekly Squadron Meeting"),
      date: String(payload.date || "").trim() || null,
      startTime: String(payload.startTime || "19:00"),
      endTime: String(payload.endTime || "21:00"),
      location: String(payload.location || ""),
      uniform: String(payload.uniform || ""),
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created the meeting "${created.data.title || "Weekly Squadron Meeting"}".`, targetCollection: "meetings", targetId: created.id };
  }
  if (actionId === "create_org_position") {
    const created = await createDocument(ctx.projectId, ctx.idToken, "orgPositions", {
      title: String(payload.title || "New Position"),
      department: String(payload.department || "General"),
      assignedMemberName: String(payload.assignedMemberName || ""),
      assignedMemberUid: payload.assignedMemberUid || null,
      status: String(payload.status || "vacant"),
      responsibilities: String(payload.responsibilities || ""),
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created org position "${created.data.title || "New Position"}".`, targetCollection: "orgPositions", targetId: created.id };
  }
  if (actionId === "create_inspection_item") {
    const created = await createDocument(ctx.projectId, ctx.idToken, "inspectionItems", {
      title: String(payload.title || "Inspection Item"),
      category: String(payload.category || "general"),
      status: String(payload.status || "open"),
      owner: String(payload.owner || ""),
      dueDate: payload.dueDate || null,
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created inspection item "${created.data.title || "Inspection Item"}".`, targetCollection: "inspectionItems", targetId: created.id };
  }
  if (actionId === "create_flight_review") {
    const created = await createDocument(ctx.projectId, ctx.idToken, "flightReviews", {
      memberName: String(payload.memberName || "Member"),
      memberUid: payload.memberUid || null,
      dueDate: payload.dueDate || null,
      status: String(payload.status || "on_track"),
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created a Biannual Flight Review record for "${created.data.memberName || "Member"}".`, targetCollection: "flightReviews", targetId: created.id };
  }
  if (actionId === "create_resource_link") {
    const url = String(payload.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Please provide a valid URL before confirming this resource link.");
    }
    const created = await createDocument(ctx.projectId, ctx.idToken, "resourceLinks", {
      title: String(payload.title || "Resource Link"),
      category: String(payload.category || "general"),
      url,
      notes: String(payload.notes || ""),
      lastReviewedDate: payload.lastReviewedDate || null,
      visibility: "senior_members",
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    return { message: `Done. I created the resource link "${created.data.title || "Resource Link"}".`, targetCollection: "resourceLinks", targetId: created.id };
  }
  if (actionId === "update_task_status") {
    const id = String(payload.id || "");
    if (!id) throw new Error("Task ID is required to update task status.");
    const status = String(payload.status || "open");
    await patchDocument(ctx.projectId, ctx.idToken, "tasks", id, {
      status,
      updatedAt: now,
      updatedBy: actor,
    });
    return { message: `Done. I updated task status to ${status}.`, targetCollection: "tasks", targetId: id };
  }
  if (actionId === "update_inspection_status") {
    const id = String(payload.id || "");
    if (!id) throw new Error("Inspection item ID is required.");
    const status = String(payload.status || "needs_review");
    await patchDocument(ctx.projectId, ctx.idToken, "inspectionItems", id, {
      status,
      updatedAt: now,
      updatedBy: actor,
    });
    return { message: `Done. I updated inspection status to ${status}.`, targetCollection: "inspectionItems", targetId: id };
  }
  if (actionId === "update_flight_review_status") {
    const id = String(payload.id || "");
    if (!id) throw new Error("Flight review record ID is required.");
    const status = String(payload.status || "on_track");
    await patchDocument(ctx.projectId, ctx.idToken, "flightReviews", id, {
      status,
      updatedAt: now,
      updatedBy: actor,
    });
    return { message: `Done. I updated flight review status to ${status}.`, targetCollection: "flightReviews", targetId: id };
  }
  if (actionId === "update_org_position") {
    const id = String(payload.id || "");
    if (!id) throw new Error("Org position ID is required.");
    await patchDocument(ctx.projectId, ctx.idToken, "orgPositions", id, {
      assignedMemberName: payload.assignedMemberName || "",
      assignedMemberUid: payload.assignedMemberUid || null,
      status: payload.status || "filled",
      updatedAt: now,
      updatedBy: actor,
    });
    return { message: "Done. I updated the organization chart position assignment.", targetCollection: "orgPositions", targetId: id };
  }
  throw new Error("That action is not available in Steward V1.");
}

async function appendConversationHistory(
  ctx: WorkerContext,
  body: StewardRequest,
  userMessage: string,
  response: StewardResponse
): Promise<StewardResponse> {
  try {
    const now = nowIso();
    let conversationId = String(body.conversationId || "").trim();
    if (conversationId) {
      await patchDocument(ctx.projectId, ctx.idToken, "stewardConversations", conversationId, {
        updatedAt: now,
        pagePath: body.pagePath || "",
      });
    } else {
      const created = await createDocument(ctx.projectId, ctx.idToken, "stewardConversations", {
        userId: ctx.uid,
        userEmail: ctx.email || ctx.profile.email || "",
        title: userMessage.slice(0, 80) || "Steward conversation",
        pagePath: body.pagePath || "",
        createdAt: now,
        updatedAt: now,
      });
      conversationId = created.id;
    }

    await createDocument(ctx.projectId, ctx.idToken, "stewardMessages", {
      conversationId,
      userId: ctx.uid,
      role: "user",
      content: userMessage,
      intent: "user",
      pagePath: body.pagePath || "",
      createdAt: now,
    });
    await createDocument(ctx.projectId, ctx.idToken, "stewardMessages", {
      conversationId,
      userId: ctx.uid,
      role: "steward",
      content: response.reply || "",
      intent: response.intent || "general",
      pagePath: body.pagePath || "",
      createdAt: now,
    });

    response.conversationId = conversationId;
    return response;
  } catch {
    response.conversationSaveWarning = true;
    return response;
  }
}

async function handleConfirmation(ctx: WorkerContext, body: StewardRequest): Promise<StewardResponse> {
  if (body.confirmation === false) {
    return {
      ok: true,
      reply: `Canceled. No changes were made.\n\n${DISCLAIMER}`,
      intent: "cancel",
      suggestions: ["What tasks are open?", "Where do I add a meeting?", "Find CAPR 60-1"],
      pendingConfirmation: null,
      actionResult: "canceled",
    };
  }

  const actionId = String(body.pendingActionId || "");
  const payload = (body.actionPayload || {}) as Record<string, unknown>;
  if (!actionId) {
    return {
      ok: false,
      reply: "",
      error: "Missing pending action.",
    };
  }
  const result = await executeConfirmedWrite(ctx, actionId, payload);
  await writeAuditLog(ctx, actionId, result.targetCollection, result.targetId, "Steward confirmed write");
  return {
    ok: true,
    reply: `${result.message}\n\n${DISCLAIMER}`,
    intent: "confirm",
    suggestions: ["Show open tasks", "Show org chart vacancies", "Where do I add a meeting?"],
    pendingConfirmation: null,
    actionResult: result.message,
  };
}

function helpReplyForIntent(intent: StewardIntent, summary?: SiteIndexSummary): string {
  const currentSummary = summary?.currentPage?.summary || "This page provides squadron operations tools.";
  switch (intent) {
    case "what_can_you_do":
      return [
        "I can help with portal navigation, meetings/calendar planning, open tasks, organization chart positions, inspection prep items, Biannual Flight Reviews, resource links, CAP reference searches, and admin workflow guidance.",
        "I can also prepare create/update actions and ask for confirmation before recording anything.",
        DISCLAIMER,
      ].join("\n\n");
    case "how_to_use_portal":
      return [
        "Use Home for overall status, Meetings/Calendar to plan events, Tasks for follow-ups, Organization Chart for staffing, Inspection Prep for checklist items, Flight Reviews for BFR tracking, and Files & Resources for link references.",
        "Ask me where to go and I can open the right page button.",
        DISCLAIMER,
      ].join("\n\n");
    case "explain_current_page":
      return `${currentSummary}\n\n${DISCLAIMER}`;
    default:
      return "";
  }
}

async function handleSteward(env: Env, ctx: WorkerContext, body: StewardRequest): Promise<StewardResponse> {
  const message = (body.message || "").trim();

  if (body.confirmation === true || body.confirmation === false) {
    return handleConfirmation(ctx, body);
  }

  if (!message) return { ok: false, reply: "", error: "Message required" };

  const intent = detectIntent(message);
  const navigateTo = deriveNavigateTo(message, body.siteIndexSummary, ctx.profile);

  if (intent === "admin_help") {
    if (!isAdminProfile(ctx.profile)) {
      return {
        ok: true,
        reply: `User approvals are handled by squadron command staff in the Admin page.\n\n${DISCLAIMER}`,
        intent: "admin",
        suggestions: ["Where do I add a meeting?", "What tasks are open?"],
      };
    }
    return {
      ok: true,
      reply:
        "Open Admin to create invite links and approve or deny pending profiles. Invite links create pending accounts only — approval happens inside Admin.\n\n" +
        DISCLAIMER,
      intent: "admin",
      navigateTo: { path: "admin.html", label: "Open Admin" },
      navigateLabel: "Open Admin",
      suggestions: ["Show pending users", "Explain invite links"],
    };
  }

  if (intent === "cap_reference_search") {
    const capQuery = deriveCapQuery(message, { intent: "cap" });
    const openUrl = buildCapSearchUrl(capQuery || "CAP regulations");
    return {
      ok: true,
      reply: "I opened an official CAP reference search. Use official CAP publications as authoritative.\n\n" + DISCLAIMER,
      intent: "cap_reference_search",
      openUrl,
      suggestions: ["Find CAP forms", "Search CAP uniform guidance"],
      navigateTo: null,
    };
  }

  if (intent === "list_tasks") {
    const tasks = await listCollection(ctx.projectId, ctx.idToken, "tasks", 80);
    const open = tasks
      .map((t) => ({ id: t.id, ...t.data }))
      .filter((t) => !["done", "complete", "completed", "closed"].includes(normalizeStatus(t.status)))
      .slice(0, 8);
    const lines = open.length
      ? open.map((t) => `- ${String(t.title || "Task")} (${String(t.status || "open")})`).join("\n")
      : "No open tasks found.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "list_tasks",
      suggestions: ["Create a task", "Where do I add a meeting?"],
      navigateTo: { path: "tasks.html", label: "Open Tasks" },
      navigateLabel: "Open Tasks",
    };
  }

  if (intent === "list_meetings") {
    const meetings = await listCollection(ctx.projectId, ctx.idToken, "meetings", 60);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = meetings
      .map((m) => ({ id: m.id, ...m.data }))
      .filter((m) => String(m.date || "").slice(0, 10) >= today)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .slice(0, 8);
    const lines = upcoming.length
      ? upcoming.map((m) => `- ${String(m.date || "TBD")} · ${String(m.title || "Meeting")}`).join("\n")
      : "No upcoming meetings were found.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "list_meetings",
      suggestions: ["Create a meeting", "Open calendar"],
      navigateTo: { path: "schedule.html", label: "Open Meeting Planner" },
      navigateLabel: "Open Meeting Planner",
    };
  }

  if (intent === "show_vacancies") {
    const rows = await listCollection(ctx.projectId, ctx.idToken, "orgPositions", 80);
    const vacancies = rows
      .map((r) => ({ id: r.id, ...r.data }))
      .filter((r) => normalizeStatus(r.status) === "vacant")
      .slice(0, 10);
    const lines = vacancies.length
      ? vacancies.map((v) => `- ${String(v.title || "Position")} (${String(v.department || "General")})`).join("\n")
      : "No vacancies are currently listed.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "show_vacancies",
      suggestions: ["Create org position", "Open organization chart"],
      navigateTo: { path: "orgchart.html", label: "Open Organization Chart" },
      navigateLabel: "Open Organization Chart",
    };
  }

  if (intent === "list_inspection_items") {
    const rows = await listCollection(ctx.projectId, ctx.idToken, "inspectionItems", 80);
    const openItems = rows
      .map((r) => ({ id: r.id, ...r.data }))
      .filter((r) => normalizeStatus(r.status) !== "complete")
      .slice(0, 10);
    const lines = openItems.length
      ? openItems.map((i) => `- ${String(i.title || "Item")} (${String(i.status || "open")})`).join("\n")
      : "No open inspection prep items were found.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "list_inspection_items",
      suggestions: ["Create an inspection item", "Open inspection prep"],
      navigateTo: { path: "sui-readiness.html", label: "Open Inspection Prep" },
      navigateLabel: "Open Inspection Prep",
    };
  }

  if (intent === "due_soon_flight_reviews") {
    const rows = await listCollection(ctx.projectId, ctx.idToken, "flightReviews", 80);
    const due = rows
      .map((r) => ({ id: r.id, ...r.data }))
      .filter((r) => ["due_soon", "overdue"].includes(normalizeStatus(r.status)))
      .slice(0, 10);
    const lines = due.length
      ? due.map((d) => `- ${String(d.memberName || "Member")} (${String(d.status || "due_soon")})`).join("\n")
      : "No due-soon or overdue Biannual Flight Reviews were found.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "due_soon_flight_reviews",
      suggestions: ["Open flight reviews", "Create a flight review record"],
      navigateTo: { path: "flight-review.html", label: "Open Flight Reviews" },
      navigateLabel: "Open Flight Reviews",
    };
  }

  if (intent === "list_resource_links") {
    const rows = await listCollection(ctx.projectId, ctx.idToken, "resourceLinks", 80);
    const links = rows
      .map((r) => ({ id: r.id, ...r.data }))
      .slice(0, 10);
    const lines = links.length
      ? links.map((l) => `- ${String(l.title || "Resource")} (${String(l.category || "general")})`).join("\n")
      : "No resource links have been added yet.";
    return {
      ok: true,
      reply: `${lines}\n\n${DISCLAIMER}`,
      intent: "list_resource_links",
      suggestions: ["Add a resource link", "Open Files & Resources"],
      navigateTo: { path: "documents.html", label: "Open Files & Resources" },
      navigateLabel: "Open Files & Resources",
    };
  }

  if (intent === "create_task") {
    const payload = parseTaskPayload(message);
    return {
      ok: true,
      reply: `I can create this task: "${payload.title}". Confirm to continue.`,
      intent: "create_task",
      suggestions: ["Confirm", "Cancel"],
      pendingConfirmation: buildPendingAction("create_task", `Create task "${String(payload.title)}"`, payload, message),
    };
  }

  if (intent === "create_inspection_item") {
    const payload = parseInspectionPayload(message);
    return {
      ok: true,
      reply: `I can create this inspection item: "${payload.title}". Confirm to continue.`,
      intent: "create_inspection_item",
      suggestions: ["Confirm", "Cancel"],
      pendingConfirmation: buildPendingAction("create_inspection_item", `Create inspection item "${String(payload.title)}"`, payload, message),
    };
  }

  if (intent === "create_resource_link") {
    const payload = parseResourcePayload(message);
    if (!String(payload.url || "").trim()) {
      return {
        ok: true,
        reply:
          "I can add that resource link. Please include the full URL (https://...) and I will prepare it for confirmation.\n\n" +
          DISCLAIMER,
        intent: "create_resource_link",
        suggestions: ["Add a resource link for CAP uniforms https://www.gocivilairpatrol.com"],
      };
    }
    return {
      ok: true,
      reply: `I can add this resource link: "${payload.title}". Confirm to continue.`,
      intent: "create_resource_link",
      suggestions: ["Confirm", "Cancel"],
      pendingConfirmation: buildPendingAction("create_resource_link", `Create resource link "${String(payload.title)}"`, payload, message),
    };
  }

  if (intent === "create_meeting") {
    const payload = {
      title: "Weekly Squadron Meeting",
      date: "",
      startTime: "19:00",
      endTime: "21:00",
      location: "",
      uniform: "",
      notes: "",
    };
    return {
      ok: true,
      reply:
        "I can create a meeting record. Confirm to continue, or provide date/time/location details for a better draft.",
      intent: "create_meeting",
      pendingConfirmation: buildPendingAction("create_meeting", "Create a new meeting record", payload, message),
      suggestions: ["Open Meeting Planner", "Add meeting details then confirm"],
      navigateTo: { path: "schedule.html", label: "Open Meeting Planner" },
      navigateLabel: "Open Meeting Planner",
    };
  }

  if (intent === "create_org_position") {
    const payload = {
      title: "New Position",
      department: "General",
      assignedMemberName: "",
      status: "vacant",
      responsibilities: "",
      notes: "",
    };
    return {
      ok: true,
      reply: "I can create an org chart position. Confirm to continue.",
      intent: "create_org_position",
      pendingConfirmation: buildPendingAction("create_org_position", "Create organization chart position", payload, message),
      suggestions: ["Open Organization Chart"],
      navigateTo: { path: "orgchart.html", label: "Open Organization Chart" },
      navigateLabel: "Open Organization Chart",
    };
  }

  if (intent === "create_flight_review") {
    const payload = { memberName: "Member", dueDate: "", status: "on_track", notes: "" };
    return {
      ok: true,
      reply: "I can create a Biannual Flight Review record. Confirm to continue.",
      intent: "create_flight_review",
      pendingConfirmation: buildPendingAction("create_flight_review", "Create flight review record", payload, message),
      suggestions: ["Open Flight Reviews"],
      navigateTo: { path: "flight-review.html", label: "Open Flight Reviews" },
      navigateLabel: "Open Flight Reviews",
    };
  }

  if (intent === "what_can_you_do" || intent === "how_to_use_portal" || intent === "explain_current_page") {
    return {
      ok: true,
      reply: helpReplyForIntent(intent, body.siteIndexSummary),
      intent,
      suggestions: ["Where do I add a meeting?", "What tasks are open?", "Show org chart vacancies"],
      navigateTo: intent === "how_to_use_portal" ? { path: "dashboard.html", label: "Open Home Dashboard" } : null,
      navigateLabel: intent === "how_to_use_portal" ? "Open Home Dashboard" : null,
    };
  }

  if (intent === "portal_navigation" && navigateTo) {
    return {
      ok: true,
      reply: `You can use ${navigateTo.label} for that request.\n\n${DISCLAIMER}`,
      intent: "portal_navigation",
      navigateTo,
      navigateLabel: navigateTo.label,
      suggestions: ["Open page", "Explain this page"],
    };
  }

  if (looksLikeWrite(message) && /delete|remove/i.test(message)) {
    return {
      ok: true,
      reply: `Deletion is not enabled in Steward V1. Use page controls or an admin workflow.\n\n${DISCLAIMER}`,
      intent: "unknown",
      suggestions: ["Where do I approve users?", "What tasks are open?"],
    };
  }

  const llm = await callOpenAI(env, ctx.profile, body);
  let reply = String(llm.reply || "").trim();
  if (!reply) reply = `I can help with meetings, tasks, org chart, inspection prep, Biannual Flight Reviews, resource links, and CAP references.\n\n${DISCLAIMER}`;
  if (!reply.includes(DISCLAIMER)) reply += `\n\n${DISCLAIMER}`;
  const capQuery = deriveCapQuery(message, llm);
  const openUrl = capQuery ? buildCapSearchUrl(capQuery) : null;
  const navFromLlm =
    llm.navigateTo?.path && llm.navigateTo?.label
      ? { path: llm.navigateTo.path, label: llm.navigateTo.label }
      : navigateTo;
  return {
    ok: true,
    reply,
    intent: llm.intent || intent || "unknown",
    suggestions: (llm.suggestions || []).slice(0, 3),
    openUrl,
    navigateTo: navFromLlm || null,
    navigateLabel: navFromLlm?.label || null,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/steward" || request.method !== "POST") {
      return jsonResponse({ ok: false, reply: "", error: "Not found" }, 404, origin);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ ok: false, reply: "", error: "Steward is not configured" }, 503, origin);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return jsonResponse({ ok: false, reply: "", error: "Sign in required" }, 401, origin);
    }

    const projectId = env.FIREBASE_PROJECT_ID || "tn-170-portal";
    let uid: string;
    let email: string | undefined;
    try {
      ({ uid, email } = await verifyFirebaseToken(match[1], projectId));
    } catch {
      return jsonResponse({ ok: false, reply: "", error: "Invalid or expired session" }, 401, origin);
    }

    let profile: Profile | null;
    try {
      profile = await fetchProfile(projectId, uid, match[1]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Profile lookup failed";
      return jsonResponse({ ok: false, reply: "", error: msg }, 502, origin);
    }

    if (!profile) {
      return jsonResponse({ ok: false, reply: "", error: "Profile not found" }, 403, origin);
    }

    if (!isApprovedProfile(profile)) {
      return jsonResponse({ ok: false, reply: "", error: "Your account is awaiting approval" }, 403, origin);
    }

    let body: StewardRequest;
    try {
      body = (await request.json()) as StewardRequest;
    } catch {
      return jsonResponse({ ok: false, reply: "", error: "Invalid JSON body" }, 400, origin);
    }

    try {
      const ctx: WorkerContext = {
        projectId,
        idToken: match[1],
        uid,
        email,
        profile,
      };
      const result = await handleSteward(env, ctx, body);
      const withHistory = await appendConversationHistory(ctx, body, body.message || "", result);
      return jsonResponse(withHistory, withHistory.ok ? 200 : 400, origin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Steward request failed";
      return jsonResponse({ ok: false, reply: "", error: msg }, 502, origin);
    }
  },
};
