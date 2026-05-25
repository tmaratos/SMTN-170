/**
 * Steward Core — Supabase Edge Function (Phase 3 private brain).
 * Auth: user JWT (RLS). No service role exposed to clients.
 *
 * Future AI integration point:
 * - After auth/profile checks, call LLM with tool schema mapped to executeAction()
 * - Stream tokens to client; persist final message here
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { processMessage, titleFromMessage, type PendingAction } from "./brain.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  message?: string;
  conversation_id?: string;
  active_mode?: string;
  confirm_pending?: boolean;
  cancel_pending?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Sign in required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, error: "Invalid session." }, 401);
    }
    const userId = userData.user.id;

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, preferred_name, rank, role, account_status")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return json({ ok: false, error: "Profile not found." }, 403);
    }

    if (profile.account_status !== "approved") {
      return json({ ok: false, error: "Your account is awaiting approval." }, 403);
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const activeMode = body.active_mode || "chat";
    const confirmPending = !!body.confirm_pending;
    const cancelPending = !!body.cancel_pending;
    const message = (body.message || "").trim();

    if (!message && !confirmPending && !cancelPending) {
      return json({ ok: false, error: "Message or action required." }, 400);
    }

    let conversationId = body.conversation_id;
    let pending: PendingAction | null = null;

    if (conversationId) {
      const { data: conv } = await supabase
        .from("steward_conversations")
        .select("id, title, pending_action")
        .eq("id", conversationId)
        .eq("profile_id", userId)
        .maybeSingle();
      if (conv) {
        pending = (conv.pending_action as PendingAction) || null;
      } else {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      const { data: created, error: createErr } = await supabase
        .from("steward_conversations")
        .insert({ profile_id: userId, title: "New conversation" })
        .select("id")
        .single();
      if (createErr || !created) {
        return json({ ok: false, error: "Could not start conversation." }, 500);
      }
      conversationId = created.id;
    }

    const ctx = { supabase, userId, profile };

    // Save user message when not confirm-only
    let userMessageId: string | null = null;
    if (message && !confirmPending && !cancelPending) {
      const { data: userMsg, error: umErr } = await supabase
        .from("steward_chat_messages")
        .insert({
          conversation_id: conversationId,
          profile_id: userId,
          role: "user",
          message,
        })
        .select("id")
        .single();
      if (umErr) return json({ ok: false, error: umErr.message }, 500);
      userMessageId = userMsg.id;
    }

    const brain = await processMessage(ctx, message || "confirm", activeMode, pending, {
      confirm: confirmPending,
      cancel: cancelPending,
    });

    let stewardText = brain.reply;
    if (brain.cap_search?.searchUrl) {
      stewardText += `\n\nCAP_SEARCH_URL:${brain.cap_search.searchUrl}`;
    }

    const { data: stewardMsg, error: smErr } = await supabase
      .from("steward_chat_messages")
      .insert({
        conversation_id: conversationId,
        profile_id: userId,
        role: "steward",
        message: stewardText,
      })
      .select("id, created_at")
      .single();

    if (smErr) return json({ ok: false, error: smErr.message }, 500);

    const userCount = message && !confirmPending ? 1 : 0;
    if (userCount === 1) {
      const { count } = await supabase
        .from("steward_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("role", "user");
      if (count === 1) {
        await supabase
          .from("steward_conversations")
          .update({ title: titleFromMessage(message), updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    }

    await supabase
      .from("steward_conversations")
      .update({
        updated_at: new Date().toISOString(),
        pending_action: brain.pending_confirmation,
      })
      .eq("id", conversationId)
      .eq("profile_id", userId);

    return json({
      ok: true,
      reply: brain.reply,
      data_connected: brain.data_connected,
      source: brain.source ?? null,
      cap_search: brain.cap_search ?? null,
      needs_confirmation: brain.needs_confirmation,
      pending_confirmation: brain.pending_confirmation,
      conversation_id: conversationId,
      user_message_id: userMessageId,
      steward_message_id: stewardMsg.id,
      steward_message_at: stewardMsg.created_at,
    });
  } catch (e) {
    console.error("[steward-core]", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return json({ ok: false, error: msg }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
