/**
 * Steward brain — intent detection and action routing (Phase 3 rules engine).
 * Future: replace processMessage() body with LLM + tool calls to executeAction().
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type Ctx,
  type ProfileRow,
  type ActionResult,
  DISCLAIMER,
  RISK,
  getAction,
  needsConfirmation,
  executeAction,
  enrichParams,
  formatActionReply,
  extractAfterCreateTask,
  extractPositionTitle,
  extractDepartment,
} from "./actions.ts";
import { buildCapGuidance, isCapGuidanceRequest, CAP_SOURCE } from "./cap.ts";

export interface PendingAction {
  action_id: string;
  params: Record<string, unknown>;
  user_text: string;
  summary: string;
}

export interface BrainResult {
  reply: string;
  data_connected: boolean;
  source?: string;
  cap_search?: { searchQuery: string; searchUrl: string; sectionHint: string; openInNewTab: boolean };
  needs_confirmation: boolean;
  pending_confirmation: PendingAction | null;
}

const INTENTS: { id: string; patterns: RegExp[] }[] = [
  { id: "help", patterns: [/what can you do|capabilities|help me understand steward/i] },
  {
    id: "cap",
    patterns: [/capr\s*\d|cap\s*regulation|cap\s*standard|cap\s*form|uniform\s*standard|inspection\s*guidance|aerospace|emergency\s*services|cadet\s*program|official\s*cap|find\s+capr/i],
  },
  { id: "meetings", patterns: [/meeting|agenda|schedule|monthly plan/i] },
  { id: "tasks", patterns: [/task|to-?do|due item/i] },
  { id: "flight_reviews", patterns: [/flight review|bfr|biannual/i] },
  { id: "inspection", patterns: [/inspection|sui|checklist item/i] },
  { id: "org_chart", patterns: [/org chart|organization chart|billet|vacant position/i] },
  { id: "files", patterns: [/file|upload|document|folder/i] },
  { id: "profile", patterns: [/my profile|who am i|signed in as/i] },
];

function detectIntent(text: string): string {
  const t = text.toLowerCase();
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(t))) return intent.id;
  }
  return "general";
}

function wantsCreate(t: string) {
  return /\b(create|add|new|make|build|draft|generate)\b/i.test(t);
}
function wantsDelete(t: string) {
  return /\b(delete|remove)\b/i.test(t);
}
function wantsComplete(t: string) {
  return /\b(complete|mark.*done|finish)\b/i.test(t);
}
function wantsList(t: string) {
  return /\b(show|list|what|find|open|upcoming|recent|overdue)\b/i.test(t) || !wantsCreate(t);
}
function wantsAssign(t: string) {
  return /\bassign\b/i.test(t) && /\bto\b/i.test(t);
}
function wantsUpdate(t: string) {
  return /\b(update|change|move|rename|categorize)\b/i.test(t);
}

function resolveActionId(intent: string, text: string): string | null {
  if (intent === "help") return "help_capabilities";
  if (intent === "cap") return "cap_website_search";
  if (intent === "meetings") {
    if (wantsCreate(text) && /agenda/i.test(text)) return "draft_meeting_agenda";
    if (wantsCreate(text)) return "create_meeting_draft";
    if (wantsUpdate(text)) return "update_meeting_notes";
    return "list_upcoming_meetings";
  }
  if (intent === "tasks") {
    if (wantsCreate(text)) return "create_task";
    if (wantsComplete(text)) return "mark_task_complete";
    return "list_open_tasks";
  }
  if (intent === "flight_reviews") {
    if (wantsCreate(text)) return "create_flight_review";
    if (wantsUpdate(text) || wantsComplete(text)) return "update_flight_review_status";
    return "list_flight_reviews";
  }
  if (intent === "inspection") {
    if (wantsCreate(text)) return "create_inspection_item";
    if (wantsComplete(text)) return "mark_inspection_complete";
    return "list_inspection_items";
  }
  if (intent === "org_chart") {
    if (wantsCreate(text) || /vacant/i.test(text)) return "create_vacant_position";
    if (wantsAssign(text)) return "assign_org_position";
    return "list_org_positions";
  }
  if (intent === "files") {
    if (wantsDelete(text)) return "delete_file";
    if (wantsUpdate(text) && /rename/i.test(text)) return "rename_file";
    if (wantsUpdate(text)) return "categorize_file";
    return "list_recent_files";
  }
  if (intent === "profile") return "show_profile";
  return null;
}

function buildParams(actionId: string, text: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (actionId === "create_task") params.title = extractAfterCreateTask(text);
  if (actionId === "create_vacant_position") {
    params.title = extractPositionTitle(text);
    params.department = extractDepartment(text);
  }
  if (actionId === "create_inspection_item") params.work_unit = extractDepartment(text);
  if (actionId === "draft_meeting_agenda") {
    const m = text.match(/agenda\s+(?:for|about)\s+(.+?)(?:\.|$)/i);
    if (m) params.topic = m[1].trim();
  }
  return params;
}

function fallbackReply(text: string): string {
  return (
    "I can help on the TN-170 Senior Member operations portal with meetings, files, flight reviews, inspection prep, org chart, tasks, and official CAP references. What would you like to work on?\n\n" +
    DISCLAIMER
  );
}

function formatCapReply(cap: ReturnType<typeof buildCapGuidance>): BrainResult {
  return {
    reply: cap.text + "\n\n" + cap.source + "\n\n" + DISCLAIMER,
    data_connected: false,
    source: CAP_SOURCE,
    cap_search: cap.capSearch,
    needs_confirmation: false,
    pending_confirmation: null,
  };
}

export async function processMessage(
  ctx: Ctx,
  userText: string,
  activeMode: string,
  pending: PendingAction | null,
  opts: { confirm?: boolean; cancel?: boolean }
): Promise<BrainResult> {
  const text = (userText || "").trim();

  if (pending) {
    if (opts.cancel) {
      return {
        reply: "Cancelled. No changes were made to the squadron workspace.\n\n" + DISCLAIMER,
        data_connected: false,
        needs_confirmation: false,
        pending_confirmation: null,
      };
    }
    if (opts.confirm || /^(yes|confirm|ok|okay|do it)\b/i.test(text)) {
      const action = getAction(pending.action_id);
      if (!action) {
        return { reply: "That action is no longer available.", data_connected: false, needs_confirmation: false, pending_confirmation: null };
      }
      const result = await executeAction(ctx, pending.action_id, pending.params, pending.user_text);
      return {
        reply: formatActionReply(result),
        data_connected: !!result.dataConnected,
        needs_confirmation: false,
        pending_confirmation: null,
      };
    }
    return {
      reply: "Tap Confirm to proceed or Cancel to leave records unchanged.\n\n" + DISCLAIMER,
      data_connected: false,
      needs_confirmation: true,
      pending_confirmation: pending,
    };
  }

  if (isCapGuidanceRequest(text, activeMode)) {
    return formatCapReply(buildCapGuidance(text));
  }

  const intent = detectIntent(text);
  const actionId = resolveActionId(intent, text);

  if (actionId === "cap_website_search") {
    return formatCapReply(buildCapGuidance(text));
  }

  if (!actionId) {
    if (activeMode === "cap") return formatCapReply(buildCapGuidance(text || "CAP regulations"));
    const modeMap: Record<string, string> = {
      files: "list_recent_files",
      meetings: "list_upcoming_meetings",
      readiness: "list_inspection_items",
      org: "list_org_positions",
    };
    const modeAction = modeMap[activeMode];
    if (modeAction) {
      const result = await executeAction(ctx, modeAction, {}, text);
      return {
        reply: formatActionReply(result),
        data_connected: !!result.dataConnected,
        needs_confirmation: false,
        pending_confirmation: null,
      };
    }
    return { reply: fallbackReply(text), data_connected: false, needs_confirmation: false, pending_confirmation: null };
  }

  const action = getAction(actionId);
  if (!action) {
    return { reply: fallbackReply(text), data_connected: false, needs_confirmation: false, pending_confirmation: null };
  }

  let params = buildParams(actionId, text);
  params = await enrichParams(ctx, actionId, params, text);

  if (needsConfirmation(action.risk_level)) {
    const summary = `I can ${action.label.toLowerCase()}. Please confirm before I update the record.`;
    return {
      reply: `I can do that. Please confirm before I update the record.\n\nAction: ${action.label}\n\n` + DISCLAIMER,
      data_connected: true,
      needs_confirmation: true,
      pending_confirmation: {
        action_id: actionId,
        params,
        user_text: text,
        summary,
      },
    };
  }

  const result = await executeAction(ctx, actionId, params, text);
  return {
    reply: formatActionReply(result),
    data_connected: !!result.dataConnected,
    needs_confirmation: false,
    pending_confirmation: null,
  };
}

export function titleFromMessage(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "New conversation";
  return clean.length > 48 ? clean.slice(0, 45) + "…" : clean;
}
