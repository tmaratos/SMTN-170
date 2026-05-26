/**
 * Steward action handlers — server-side only (Phase 3 rules engine).
 * Future: LLM tool-calling layer above executeAction().
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DISCLAIMER =
  "Official CAP publications and command guidance remain authoritative.";

const RISK = {
  READ: "read",
  SAFE_WRITE: "safe_write",
  SENSITIVE_WRITE: "sensitive_write",
  DESTRUCTIVE: "destructive",
};











const SOURCES = {
  workspace: "Source: Squadron workspace",
  flight: "Source: Flight Review records",
  inspection: "Source: Inspection prep records",
  org: "Source: Organization chart",
  files: "Source: Squadron workspace",
  tasks: "Source: Squadron workspace",
  profile: "Source: Squadron workspace",
};

function nowIso() {
  return new Date().toISOString();
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(d) {
  if (!d) return "";
  try {
    const iso = String(d).includes("T") ? d : `${d}T12:00:00`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(d);
  }
}
function quoteTitle(text, max = 60) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function normalizeStatus(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "_");
}

function displayName(p) {
  if (p.preferred_name?.trim()) return p.preferred_name.trim();
  const rank = (p.rank || "").replace(/\.\s*$/, "");
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
  if (rank && name) return `${rank} ${name}`;
  if (name) return name;
  return p.email || "Member";
}

function extractAfterCreateTask(text) {
  const m = text.match(/create\s+(?:a\s+)?task\s+(?:to\s+)?(.+?)(?:\.|$)/i);
  return m ? m[1].trim() : "";
}
function extractPositionTitle(text) {
  const m = text.match(/(?:vacant\s+)?(.+?)\s+position/i);
  if (m) return m[1].trim();
  const m2 = text.match(/add\s+(?:vacant\s+)?(.+?)(?:\s+to|\s+in|$)/i);
  return m2 ? m2[1].trim() : "";
}
function extractDepartment(text) {
  const depts = ["Command", "Operations", "Safety", "Emergency Services", "Cadet Programs", "Aerospace Education", "Communications", "Logistics", "Administration", "Finance", "IT"];
  const lower = text.toLowerCase();
  for (const d of depts) if (lower.includes(d.toLowerCase())) return d;
  return "General";
}

async function logAudit(ctx, action, targetTable, targetId, details) {
  await ctx.supabase.from("audit_log").insert({
    actor_id: ctx.userId,
    action,
    target_table: targetTable,
    target_id: targetId,
    details,
  });
}

async function touchRow(ctx, table, id, patch) {
  const row = {
    ...patch,
    updated_at: nowIso(),
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  };
  if (table !== "uploaded_files") row.updated_by = ctx.userId;
  const { data, error } = await ctx.supabase.from(table).update(row).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// Blocked server-side (never routed)
const BLOCKED_ACTIONS = new Set([
  "approve_user",
  "change_role",
  "delete_user",
  "overwrite_profile",
]);

const REGISTRY[] = [
  { action_id: "list_upcoming_meetings", label: "List upcoming meetings", category: "meetings", risk_level: RISK.READ, required_table: "meetings" },
  { action_id: "create_meeting_draft", label: "Create meeting draft", category: "meetings", risk_level: RISK.SAFE_WRITE, required_table: "meetings" },
  { action_id: "update_meeting_notes", label: "Update meeting notes", category: "meetings", risk_level: RISK.SENSITIVE_WRITE, required_table: "meetings" },
  { action_id: "draft_meeting_agenda", label: "Draft meeting agenda", category: "meetings", risk_level: RISK.SAFE_WRITE, required_table: "meetings" },
  { action_id: "list_open_tasks", label: "List open tasks", category: "tasks", risk_level: RISK.READ, required_table: "portal_tasks" },
  { action_id: "create_task", label: "Create task", category: "tasks", risk_level: RISK.SAFE_WRITE, required_table: "portal_tasks" },
  { action_id: "mark_task_complete", label: "Mark task complete", category: "tasks", risk_level: RISK.SENSITIVE_WRITE, required_table: "portal_tasks" },
  { action_id: "list_flight_reviews", label: "List flight reviews", category: "flight_reviews", risk_level: RISK.READ, required_table: "flight_reviews" },
  { action_id: "create_flight_review", label: "Create flight review record", category: "flight_reviews", risk_level: RISK.SAFE_WRITE, required_table: "flight_reviews" },
  { action_id: "update_flight_review_status", label: "Update flight review status", category: "flight_reviews", risk_level: RISK.SENSITIVE_WRITE, required_table: "flight_reviews" },
  { action_id: "list_inspection_items", label: "List inspection items", category: "inspection", risk_level: RISK.READ, required_table: "inspection_items" },
  { action_id: "create_inspection_item", label: "Create inspection item", category: "inspection", risk_level: RISK.SAFE_WRITE, required_table: "inspection_items" },
  { action_id: "mark_inspection_complete", label: "Mark inspection item complete", category: "inspection", risk_level: RISK.SENSITIVE_WRITE, required_table: "inspection_items" },
  { action_id: "list_org_positions", label: "List org positions", category: "org_chart", risk_level: RISK.READ, required_table: "org_positions" },
  { action_id: "create_vacant_position", label: "Create vacant position", category: "org_chart", risk_level: RISK.SAFE_WRITE, required_table: "org_positions" },
  { action_id: "assign_org_position", label: "Assign org position", category: "org_chart", risk_level: RISK.SENSITIVE_WRITE, required_table: "org_positions" },
  { action_id: "list_recent_files", label: "List recent files", category: "files", risk_level: RISK.READ, required_table: "uploaded_files" },
  { action_id: "categorize_file", label: "Categorize file", category: "files", risk_level: RISK.SENSITIVE_WRITE, required_table: "uploaded_files" },
  { action_id: "rename_file", label: "Rename file", category: "files", risk_level: RISK.SENSITIVE_WRITE, required_table: "uploaded_files" },
  { action_id: "delete_file", label: "Delete file", category: "files", risk_level: RISK.DESTRUCTIVE, required_table: "uploaded_files" },
  { action_id: "show_profile", label: "Show profile", category: "profile", risk_level: RISK.READ, required_table: "profiles" },
  { action_id: "help_capabilities", label: "What can you do", category: "help", risk_level: RISK.READ, required_table: null },
];

function getAction(id) {
  return REGISTRY.find((a) => a.action_id === id) ?? null;
}

function needsConfirmation(level) {
  return level === RISK.SENSITIVE_WRITE || level === RISK.DESTRUCTIVE;
}

async function executeAction(ctx, actionId, params, userText): Promise<any> {
  if (BLOCKED_ACTIONS.has(actionId)) {
    return { ok: false, text: "That action is not available through Steward.", source: SOURCES.workspace };
  }

  const handlers: Record<string, (p, t) => Promise<any>> = {
    list_upcoming_meetings: (_, __) => listMeetings(ctx, true),
    create_meeting_draft: (p, t) => createMeetingDraft(ctx, p, t),
    update_meeting_notes: (p) => updateMeetingNotes(ctx, p),
    draft_meeting_agenda: (p, t) => draftAgenda(ctx, p, t),
    list_open_tasks: () => listTasks(ctx),
    create_task: (p, t) => createTask(ctx, p, t),
    mark_task_complete: (p) => markTaskComplete(ctx, p),
    list_flight_reviews: () => listFlightReviews(ctx),
    create_flight_review: (p, t) => createFlightReview(ctx, p, t),
    update_flight_review_status: (p) => updateFlightStatus(ctx, p),
    list_inspection_items: () => listInspection(ctx),
    create_inspection_item: (p, t) => createInspection(ctx, p, t),
    mark_inspection_complete: (p) => markInspectionComplete(ctx, p),
    list_org_positions: () => listOrg(ctx),
    create_vacant_position: (p, t) => createVacant(ctx, p, t),
    assign_org_position: (p) => assignOrg(ctx, p),
    list_recent_files: () => listFiles(ctx),
    categorize_file: (p) => categorizeFile(ctx, p),
    rename_file: (p) => renameFile(ctx, p),
    delete_file: (p) => deleteFile(ctx, p),
    show_profile: () => showProfile(ctx),
    help_capabilities: () => helpCapabilities(),
  };

  const fn = handlers[actionId];
  if (!fn) return { ok: false, text: "I do not know how to do that yet." };
  try {
    const result = await fn(params, userText);
    return { ...result, action_id: actionId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return { ok: false, text: msg, source: SOURCES.workspace };
  }
}

async function listMeetings(ctx, upcoming): Promise<any> {
  let q = ctx.supabase.from("meetings").select("*").order("meeting_date").limit(20);
  if (upcoming) q = q.gte("meeting_date", todayStr());
  const { data, error } = await q;
  if (error?.code === "42P01") {
    const { data: sched } = await ctx.supabase.from("schedules").select("month_key, template_name").order("updated_at", { ascending: false }).limit(6);
    if (!sched?.length) {
      return { ok: true, text: "No meetings are saved yet. I can help you create a meeting draft.", source: SOURCES.workspace, dataConnected: true };
    }
    const lines = sched.map((s) => `• ${s.template_name || "Schedule"} (${s.month_key})`).join("\n");
    return { ok: true, text: `No individual meeting records yet. Saved schedules:\n${lines}`, source: SOURCES.workspace, dataConnected: true };
  }
  if (error) return { ok: false, text: "I could not load meetings right now.", source: SOURCES.workspace };
  if (!data?.length) {
    return { ok: true, text: "No upcoming meetings are saved yet. I can create a draft meeting for you.", source: SOURCES.workspace, dataConnected: true };
  }
  const lines = data.slice(0, 8).map((m) => `• ${m.title} — ${formatDate(m.meeting_date)}`).join("\n");
  return { ok: true, text: `I found ${data.length} upcoming meeting(s):\n${lines}`, source: SOURCES.workspace, dataConnected: true };
}

async function createMeetingDraft(ctx, params, userText): Promise<any> {
  const title = String(params.title || userText.slice(0, 80) || "Squadron meeting draft");
  const { data, error } = await ctx.supabase.from("meetings").insert({
    title: quoteTitle(title, 120),
    meeting_date: String(params.meeting_date || todayStr()),
    status: "draft",
    created_by: ctx.userId,
    updated_by: ctx.userId,
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  }).select().single();
  if (error) return { ok: false, text: "I could not save the meeting draft.", source: SOURCES.workspace };
  await logAudit(ctx, "steward_create_meeting_draft", "meetings", data.id, { title: data.title });
  return { ok: true, text: `Done. I created a draft meeting “${data.title}” for ${formatDate(data.meeting_date)}.`, source: SOURCES.workspace, dataConnected: true };
}

async function updateMeetingNotes(ctx, params): Promise<any> {
  const id = String(params.id || "");
  if (!id) return { ok: false, text: "Tell me which meeting to update." };
  await touchRow(ctx, "meetings", id, { notes: String(params.notes || "") });
  await logAudit(ctx, "steward_update_meeting_notes", "meetings", id, {});
  return { ok: true, text: "Done. I saved your note on that meeting.", source: SOURCES.workspace, dataConnected: true };
}

async function draftAgenda(ctx, params, userText): Promise<any> {
  const topic = String(params.topic || "training and safety");
  const agenda = `Draft agenda:\n• Opening and safety moment\n• Commander remarks\n• Main block: ${topic}\n• Announcements`;
  if (params.id) {
    await touchRow(ctx, "meetings", String(params.id), { agenda_draft: agenda });
    await logAudit(ctx, "steward_draft_agenda", "meetings", String(params.id), {});
    return { ok: true, text: `Done. I saved a draft agenda.\n\n${agenda}`, source: SOURCES.workspace, dataConnected: true };
  }
  return { ok: true, text: `${agenda}\n\nSay “create a meeting draft” to save this to a record.`, source: SOURCES.workspace, dataConnected: false };
}

async function listTasks(ctx): Promise<any> {
  const { data, error } = await ctx.supabase.from("portal_tasks").select("*").in("status", ["open", "due_soon"]).order("due_date").limit(30);
  if (error) return { ok: false, text: "I could not load tasks.", source: SOURCES.tasks };
  if (!data?.length) return { ok: true, text: "No open tasks are saved yet.", source: SOURCES.tasks, dataConnected: true };
  const lines = data.slice(0, 10).map((t) => `• ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ""}`).join("\n");
  return { ok: true, text: `I found ${data.length} open task(s):\n${lines}`, source: SOURCES.tasks, dataConnected: true };
}

async function createTask(ctx, params, userText): Promise<any> {
  const title = String(params.title || extractAfterCreateTask(userText) || "Squadron task");
  const { data, error } = await ctx.supabase.from("portal_tasks").insert({
    title: quoteTitle(title, 200),
    status: "open",
    category: "general",
    created_by: ctx.userId,
    updated_by: ctx.userId,
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  }).select().single();
  if (error) return { ok: false, text: "I could not create the task.", source: SOURCES.tasks };
  await logAudit(ctx, "steward_create_task", "portal_tasks", data.id, { title: data.title });
  return { ok: true, text: `Done. I created the task “${data.title}.”`, source: SOURCES.tasks, dataConnected: true };
}

async function markTaskComplete(ctx, params): Promise<any> {
  const id = String(params.id || "");
  if (!id) return { ok: false, text: "I need to know which task to mark complete." };
  await touchRow(ctx, "portal_tasks", id, { status: "completed" });
  await logAudit(ctx, "steward_complete_task", "portal_tasks", id, {});
  return { ok: true, text: "Done. I marked that task complete.", source: SOURCES.tasks, dataConnected: true };
}

async function listFlightReviews(ctx): Promise<any> {
  const { data, error } = await ctx.supabase.from("flight_reviews").select("*").order("department");
  if (error) return { ok: false, text: "I could not load flight review records.", source: SOURCES.flight };
  if (!data?.length) return { ok: true, text: "No flight review records are saved yet.", source: SOURCES.flight, dataConnected: true };
  const counts: Record<string, number> = {};
  for (const r of data) {
    const k = normalizeStatus(r.status) || "current";
    counts[k] = (counts[k] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ");
  return { ok: true, text: `Flight review summary: ${summary}.`, source: SOURCES.flight, dataConnected: true };
}

async function createFlightReview(ctx, params, userText): Promise<any> {
  const dept = String(params.department || extractDepartment(userText) || "Operations");
  const { data, error } = await ctx.supabase.from("flight_reviews").insert({
    department: dept,
    status: "current",
    created_by: ctx.userId,
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  }).select().single();
  if (error) return { ok: false, text: "I could not create the flight review record.", source: SOURCES.flight };
  await logAudit(ctx, "steward_create_flight_review", "flight_reviews", data.id, { department: dept });
  return { ok: true, text: `Done. I added a flight review record for ${dept}.`, source: SOURCES.flight, dataConnected: true };
}

async function updateFlightStatus(ctx, params): Promise<any> {
  const id = String(params.id || "");
  const status = String(params.status || "");
  if (!id || !status) return { ok: false, text: "I need the review record and new status." };
  await touchRow(ctx, "flight_reviews", id, { status: normalizeStatus(status) });
  await logAudit(ctx, "steward_update_flight_review", "flight_reviews", id, { status });
  return { ok: true, text: `Done. I updated the flight review status.`, source: SOURCES.flight, dataConnected: true };
}

async function listInspection(ctx): Promise<any> {
  const { data, error } = await ctx.supabase.from("inspection_items").select("*").in("status", ["open", "due_soon", "needs_review"]).order("due_date").limit(40);
  if (error) return { ok: false, text: "I could not load inspection items.", source: SOURCES.inspection };
  if (!data?.length) return { ok: true, text: "No inspection prep items are saved yet.", source: SOURCES.inspection, dataConnected: true };
  const lines = data.slice(0, 8).map((i) => `• ${i.title}${i.due_date ? ` — due ${formatDate(i.due_date)}` : ""}`).join("\n");
  const urgent = data[0];
  let lead = `I found ${data.length} open inspection item(s).`;
  if (urgent) lead += ` The most urgent is ${urgent.title}${urgent.due_date ? `, due ${formatDate(urgent.due_date)}` : ""}.`;
  return { ok: true, text: `${lead}\n${lines}`, source: SOURCES.inspection, dataConnected: true };
}

async function createInspection(ctx, params, userText): Promise<any> {
  const title = String(params.title || userText.slice(0, 100) || "Inspection prep item");
  const { data, error } = await ctx.supabase.from("inspection_items").insert({
    title: quoteTitle(title, 200),
    work_unit: String(params.work_unit || extractDepartment(userText)),
    status: "open",
    created_by: ctx.userId,
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  }).select().single();
  if (error) return { ok: false, text: "I could not create the inspection item.", source: SOURCES.inspection };
  await logAudit(ctx, "steward_create_inspection_item", "inspection_items", data.id, { title: data.title });
  return { ok: true, text: `Done. I added inspection item “${data.title}.”`, source: SOURCES.inspection, dataConnected: true };
}

async function markInspectionComplete(ctx, params): Promise<any> {
  const id = String(params.id || "");
  if (!id) return { ok: false, text: "I need to know which inspection item to complete." };
  await touchRow(ctx, "inspection_items", id, { status: "completed", completed_at: nowIso() });
  await logAudit(ctx, "steward_complete_inspection", "inspection_items", id, {});
  return { ok: true, text: "Done. I marked that inspection item complete.", source: SOURCES.inspection, dataConnected: true };
}

async function listOrg(ctx): Promise<any> {
  const { data, error } = await ctx.supabase.from("org_positions").select("*").order("department").order("sort_order");
  if (error) return { ok: false, text: "I could not load the organization chart.", source: SOURCES.org };
  if (!data?.length) return { ok: true, text: "No org chart positions are saved yet.", source: SOURCES.org, dataConnected: true };
  const vacant = data.filter((p) => p.status === "vacant").length;
  const sample = data.slice(0, 6).map((p) => `• ${p.title} (${p.department}) — ${p.status}`).join("\n");
  return { ok: true, text: `Organization chart: ${data.length} position(s), ${vacant} vacant.\n${sample}`, source: SOURCES.org, dataConnected: true };
}

async function createVacant(ctx, params, userText): Promise<any> {
  const title = String(params.title || extractPositionTitle(userText) || "Staff Officer");
  const department = String(params.department || extractDepartment(userText));
  const { data, error } = await ctx.supabase.from("org_positions").insert({
    title: quoteTitle(title, 120),
    department,
    status: "vacant",
    sort_order: 50,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    last_worked_by: ctx.userId,
    last_worked_at: nowIso(),
  }).select().single();
  if (error) return { ok: false, text: "I could not add the org chart position.", source: SOURCES.org };
  await logAudit(ctx, "steward_create_org_position", "org_positions", data.id, { title, department });
  return { ok: true, text: `Done. I added a vacant ${data.title} position in ${department}.`, source: SOURCES.org, dataConnected: true };
}

async function assignOrg(ctx, params): Promise<any> {
  const id = String(params.id || "");
  if (!id) return { ok: false, text: "Specify which position to update." };
  await touchRow(ctx, "org_positions", id, {
    assigned_member_name: String(params.member_name || params.name || ""),
    status: "filled",
  });
  await logAudit(ctx, "steward_assign_org", "org_positions", id, {});
  return { ok: true, text: "Done. I updated that org chart assignment.", source: SOURCES.org, dataConnected: true };
}

async function listFiles(ctx): Promise<any> {
  const { data, error } = await ctx.supabase.from("uploaded_files").select("*").order("updated_at", { ascending: false }).limit(12);
  if (error) return { ok: false, text: "I could not load file records.", source: SOURCES.files };
  if (!data?.length) return { ok: true, text: "No file records are saved yet.", source: SOURCES.files, dataConnected: true };
  const lines = data.slice(0, 8).map((f) => `• ${f.name} — ${f.folder || "General"}`).join("\n");
  return { ok: true, text: `Recent uploads:\n${lines}`, source: SOURCES.files, dataConnected: true };
}

async function categorizeFile(ctx, params): Promise<any> {
  const id = String(params.id || "");
  const folder = String(params.folder || "");
  if (!id || !folder) return { ok: false, text: "I need the file and target folder." };
  await touchRow(ctx, "uploaded_files", id, { folder });
  await logAudit(ctx, "steward_categorize_file", "uploaded_files", id, { folder });
  return { ok: true, text: `Done. I moved the file to ${folder}.`, source: SOURCES.files, dataConnected: true };
}

async function renameFile(ctx, params): Promise<any> {
  const id = String(params.id || "");
  const name = String(params.name || "");
  if (!id || !name) return { ok: false, text: "I need the file and new name." };
  await touchRow(ctx, "uploaded_files", id, { name });
  await logAudit(ctx, "steward_rename_file", "uploaded_files", id, { name });
  return { ok: true, text: `Done. I renamed the file to “${name}.”`, source: SOURCES.files, dataConnected: true };
}

async function deleteFile(ctx, params): Promise<any> {
  const id = String(params.id || "");
  if (!id) return { ok: false, text: "I need to know which file to delete." };
  const { error } = await ctx.supabase.from("uploaded_files").delete().eq("id", id);
  if (error) return { ok: false, text: "I could not delete that file. Deletion may require Command Staff.", source: SOURCES.files };
  await logAudit(ctx, "steward_delete_file", "uploaded_files", id, {});
  return { ok: true, text: "Done. I removed that file record.", source: SOURCES.files, dataConnected: true };
}

async function showProfile(ctx): Promise<any> {
  const name = displayName(ctx.profile);
  const incomplete = !ctx.profile.first_name?.trim() || !ctx.profile.last_name?.trim();
  let text = `You are signed in as ${name} (${ctx.profile.role || "member"}).`;
  if (incomplete) text += " Your profile is missing first or last name—open My Profile to complete it.";
  else text += " Your profile looks complete for squadron display.";
  return { ok: true, text, source: SOURCES.profile, dataConnected: true };
}

function helpCapabilities(): Promise<any> {
  return Promise.resolve({
    ok: true,
    text:
      "I can help on the TN-170 Senior Member operations portal with meetings, files, flight reviews, inspection prep, org charts, and tasks. For official CAP standards, I search gocivilairpatrol.com. I preserve squadron continuity through saved conversations and workspace data.",
    source: SOURCES.workspace,
    dataConnected: false,
  });
}

function formatActionReply(result) {
  const parts = [result.text];
  if (result.source) parts.push("\n\n" + result.source);
  parts.push("\n\n" + DISCLAIMER);
  return parts.join("");
}

async function enrichParams(ctx, actionId, params, userText) {
  if (actionId === "mark_task_complete" && !params.id) {
    const { data } = await ctx.supabase.from("portal_tasks").select("id, title").in("status", ["open", "due_soon"]).limit(5);
    if (data?.length === 1) params.id = data[0].id;
    else if (data?.length) {
      const match = data.find((t) => userText.toLowerCase().includes((t.title || "").toLowerCase().slice(0, 12)));
      if (match) params.id = match.id;
    }
  }
  if (actionId === "mark_inspection_complete" && !params.id) {
    const { data } = await ctx.supabase.from("inspection_items").select("id, title").in("status", ["open", "due_soon", "needs_review"]).limit(5);
    if (data?.length === 1) params.id = data[0].id;
    else if (data?.length) {
      const match = data.find((i) => userText.toLowerCase().includes((i.title || "").toLowerCase().slice(0, 12)));
      if (match) params.id = match.id;
    }
  }
  return params;
}

module.exports = {
  DISCLAIMER,
  RISK,
  BLOCKED_ACTIONS,
  REGISTRY,
  getAction,
  needsConfirmation,
  executeAction,
  formatActionReply,
  enrichParams,
  extractAfterCreateTask,
  extractPositionTitle,
  extractDepartment,
};
