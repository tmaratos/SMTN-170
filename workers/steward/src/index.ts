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
  pendingActionId?: string;
  confirmation?: boolean;
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
  pendingConfirmation?: {
    id: string;
    action_id: string;
    summary: string;
    user_text?: string;
  } | null;
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
    "Never offer or perform file upload, import, OCR, or document parsing.",
    "Never claim you changed portal records. For create/update/delete requests, explain what would be done and that the member must confirm before any change is recorded.",
    "For admin-only topics (approving users, changing roles, deleting accounts), only assist command staff; otherwise direct members to their commander.",
    `Signed-in member: ${name} (role: ${role}).`,
    `Always end your reply with this disclaimer on its own line: ${DISCLAIMER}`,
    "",
    "Respond with JSON only (no markdown fences) using this schema:",
    '{"reply":"string","intent":"general|cap|meetings|tasks|flight_reviews|inspection|org_chart|files|profile|help|admin","suggestions":["short follow-up prompts, max 3"],"capSearchQuery":null,"writeRequest":null,"adminOnly":false}',
    "Set capSearchQuery to a concise Google site search phrase when the user asks about CAP regulations, CAPR/CAPM, forms, uniforms, inspection guidance, aerospace, ES, cadet program, safety, or official CAP publications.",
    "Set writeRequest to {\"summary\":\"...\",\"actionId\":\"snake_case_id\"} when the user asks to create, update, assign, complete, rename, categorize, or delete portal records. Never set writeRequest for read-only questions.",
    "Set adminOnly true when the request requires commander/admin privileges.",
  ].join("\n");
}

async function callOpenAI(env: Env, profile: Profile, body: StewardRequest): Promise<LlmPayload> {
  const userContent = [
    body.message ? `User message: ${body.message}` : "",
    body.pagePath ? `Page path: ${body.pagePath}` : "",
    body.pageTitle ? `Page title: ${body.pageTitle}` : "",
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

function handleConfirmation(body: StewardRequest): StewardResponse {
  if (body.confirmation === false) {
    return {
      ok: true,
      reply: `Cancelled. No changes were made to the squadron workspace.\n\n${DISCLAIMER}`,
      intent: "cancel",
      suggestions: ["Show open tasks", "List upcoming meetings", "Find CAP regulations"],
      pendingConfirmation: null,
    };
  }

  return {
    ok: true,
    reply:
      "Confirmed. Steward does not apply portal writes automatically — please complete this change on the appropriate portal page (Tasks, Schedule, Org Chart, or Inspection).\n\n" +
      DISCLAIMER,
    intent: "confirm",
    suggestions: ["Open tasks page", "Open schedule builder", "Find resource links"],
    pendingConfirmation: null,
  };
}

async function handleSteward(env: Env, profile: Profile, body: StewardRequest): Promise<StewardResponse> {
  const message = (body.message || "").trim();

  if (body.confirmation === true || body.confirmation === false) {
    return handleConfirmation(body);
  }

  if (!message) {
    return { ok: false, reply: "", error: "Message required" };
  }

  if (isAdminQuery(message) && !isAdminProfile(profile)) {
    return {
      ok: true,
      reply:
        "That request needs Command Staff access. Please contact your commander or an administrator for account approvals and role changes.\n\n" +
        DISCLAIMER,
      intent: "admin",
      suggestions: ["Show my profile", "Find CAP regulations", "List open tasks"],
      pendingConfirmation: null,
    };
  }

  const llm = await callOpenAI(env, profile, body);
  let reply = (llm.reply || "").trim();
  if (!reply) reply = "How can I help with squadron operations today?\n\n" + DISCLAIMER;

  if (llm.adminOnly && !isAdminProfile(profile)) {
    return {
      ok: true,
      reply:
        "That request needs Command Staff access. Please contact your commander or an administrator.\n\n" +
        DISCLAIMER,
      intent: "admin",
      suggestions: ["Show my profile", "Find resource links"],
      pendingConfirmation: null,
    };
  }

  const capQuery = deriveCapQuery(message, llm);
  const openUrl = capQuery ? buildCapSearchUrl(capQuery) : null;

  const write = llm.writeRequest;
  const wantsWrite = !!(write?.summary || (looksLikeWrite(message) && llm.intent !== "cap" && llm.intent !== "help"));
  const actionId = (write?.actionId || "portal_write").toLowerCase();

  if (BLOCKED_WRITE_ACTIONS.has(actionId)) {
    return {
      ok: true,
      reply:
        "That action is not available through Steward. Command Staff can manage accounts from the Admin page.\n\n" +
        DISCLAIMER,
      intent: "admin",
      suggestions: ["Show my profile", "List open tasks"],
      pendingConfirmation: null,
      openUrl,
    };
  }

  if (wantsWrite) {
    const summary = write?.summary?.trim() || `Apply the requested portal change: ${message.slice(0, 160)}`;
    const pendingId = `pending-${Date.now()}`;
    return {
      ok: true,
      reply: `${reply}\n\nI can prepare that change. Please confirm before anything is recorded in the portal.`,
      intent: llm.intent || "write",
      suggestions: llm.suggestions?.slice(0, 3) || [],
      openUrl,
      pendingConfirmation: {
        id: pendingId,
        action_id: actionId,
        summary,
        user_text: message,
      },
    };
  }

  return {
    ok: true,
    reply,
    intent: capQuery ? "cap" : llm.intent || "general",
    suggestions: llm.suggestions?.slice(0, 3) || [],
    openUrl,
    pendingConfirmation: null,
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
    try {
      ({ uid } = await verifyFirebaseToken(match[1], projectId));
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
      const result = await handleSteward(env, profile, body);
      return jsonResponse(result, result.ok ? 200 : 400, origin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Steward request failed";
      return jsonResponse({ ok: false, reply: "", error: msg }, 502, origin);
    }
  },
};
