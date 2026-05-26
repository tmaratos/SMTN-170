/**
 * Import Processor — server-side extraction, classification, and draft parsing.
 * Auth: user JWT. Storage/audit writes use service role server-side only.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { cors, json } from "../_shared/cors.ts";
import { extractTextFromBytes } from "../_shared/extract.ts";
import { IMPORT_TYPES, PARSER_VERSION } from "../_shared/import-meta.ts";
import { buildImportResponse } from "../_shared/parsers.ts";

const BUCKET = "squadron-files";

interface RequestBody {
  uploaded_file_id?: string;
  file_path?: string;
  file_name?: string;
  requested_target?: string;
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnon || !serviceKey) {
      return json({ ok: false, error: "Server configuration incomplete." }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, error: "Invalid session." }, 401);
    }
    const userId = userData.user.id;

    const { data: profile, error: profileErr } = await userClient
      .from("profiles")
      .select("id, account_status")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return json({ ok: false, error: "Profile not found." }, 403);
    }

    if (profile.account_status !== "approved") {
      return json({ ok: false, error: "Your account is awaiting approval." }, 403);
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const uploadedFileId = (body.uploaded_file_id || "").trim();
    let filePath = (body.file_path || "").trim();
    let fileName = (body.file_name || "").trim();
    const requestedTarget = (body.requested_target || "").trim() || undefined;

    if (!uploadedFileId && !filePath) {
      return json({ ok: false, error: "uploaded_file_id or file_path required." }, 400);
    }

    // Verify file access via user-scoped RLS when id provided
    if (uploadedFileId) {
      const { data: fileRow, error: fileErr } = await userClient
        .from("uploaded_files")
        .select("id, file_name, file_path, owner_id")
        .eq("id", uploadedFileId)
        .maybeSingle();

      if (fileErr || !fileRow) {
        return json({ ok: false, error: "File not found or access denied." }, 404);
      }

      filePath = filePath || fileRow.file_path;
      fileName = fileName || fileRow.file_name;
    }

    if (!filePath || !fileName) {
      return json({ ok: false, error: "file_path and file_name required." }, 400);
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: blob, error: dlErr } = await serviceClient.storage.from(BUCKET).download(filePath);
    if (dlErr || !blob) {
      console.error("[import-processor] download", dlErr);
      return json({ ok: false, error: "Could not download file from storage." }, 500);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const extraction = await extractTextFromBytes(bytes, fileName, blob.type);
    const result = buildImportResponse(extraction.text, fileName, {
      requestedTarget,
      sourceFileId: uploadedFileId || undefined,
      needsOcr: extraction.needsOcr,
      parseable: extraction.parseable,
    });

    const extractedPreview = (extraction.text || "").slice(0, 8000);
    const importMeta = IMPORT_TYPES[result.detectedType] || IMPORT_TYPES.needs_review;

    await persistAudit(serviceClient, {
      uploadedFileId,
      userId,
      extractedText: extraction.text,
      extractedPreview,
      result,
    });

    return json({
      ok: true,
      detected_type: result.detectedType,
      confidence: result.confidence,
      target: result.target,
      type: result.type,
      extracted_text_preview: extractedPreview,
      extracted_text: extractedPreview,
      drafts: result.drafts,
      needs_ocr: result.needsOcr,
      parsed: result.parsed,
      parseable: result.parseable,
      low_confidence: result.lowConfidence,
      message: result.message,
      import_meta: {
        label: importMeta.label,
        target: importMeta.target,
        table: importMeta.table,
        href: importMeta.href,
      },
      parser_version: PARSER_VERSION,
    });
  } catch (e) {
    console.error("[import-processor]", e);
    const msg = e instanceof Error ? e.message : "Import processor failed.";
    return json({ ok: false, error: msg }, 500);
  }
});

async function persistAudit(
  serviceClient: SupabaseClient,
  opts: {
    uploadedFileId: string;
    userId: string;
    extractedText: string | null;
    extractedPreview: string;
    result: ReturnType<typeof buildImportResponse>;
  },
): Promise<void> {
  if (!opts.uploadedFileId) return;

  try {
    const { error: pdErr } = await serviceClient.from("parsed_documents").insert({
      uploaded_file_id: opts.uploadedFileId,
      extracted_text: opts.extractedText,
      extracted_json: {
        detected_type: opts.result.detectedType,
        confidence: opts.result.confidence,
        draft_count: opts.result.drafts.length,
        needs_ocr: opts.result.needsOcr,
      },
      parser_version: PARSER_VERSION,
    });
    if (pdErr) console.warn("[import-processor] parsed_documents", pdErr.message);
  } catch (e) {
    console.warn("[import-processor] parsed_documents missing or failed", e);
  }

  try {
    const { error: ijErr } = await serviceClient.from("import_jobs").insert({
      uploaded_file_id: opts.uploadedFileId,
      detected_type: opts.result.detectedType,
      target_type: opts.result.type,
      confidence: opts.result.confidence,
      status: opts.result.drafts.length ? "pending_review" : "needs_review",
      record_count: opts.result.drafts.length,
      created_by: opts.userId,
    });
    if (ijErr) console.warn("[import-processor] import_jobs", ijErr.message);
  } catch (e) {
    console.warn("[import-processor] import_jobs missing or failed", e);
  }
}
