const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { extractTextFromBytes } = require("./shared/extract");
const { buildImportResponse } = require("./shared/parsers");
const { IMPORT_TYPES, PARSER_VERSION } = require("./shared/import-meta");
const { createDbAdapter, fromFirestore } = require("./shared/db");
const { processMessage, titleFromMessage } = require("./steward/brain");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

function approvedStatus(profile) {
  const s = (profile?.status || profile?.account_status || "").toLowerCase();
  return s === "approved" || s === "active";
}

async function requireApprovedUser(uid) {
  const snap = await db.collection("profiles").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Profile not found.");
  }
  const profile = fromFirestore(snap.data(), snap.id);
  if (!approvedStatus(profile)) {
    throw new HttpsError("permission-denied", "Your account is awaiting approval.");
  }
  return profile;
}

exports.importProcessor = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const userId = request.auth.uid;
  await requireApprovedUser(userId);

  const body = request.data || {};
  const uploadedFileId = String(body.uploadedFileId || body.uploaded_file_id || "").trim();
  let filePath = String(body.filePath || body.file_path || "").trim();
  let fileName = String(body.fileName || body.file_name || "").trim();
  const requestedTarget = String(body.requestedTarget || body.requested_target || "").trim() || undefined;

  if (!uploadedFileId && !filePath) {
    throw new HttpsError("invalid-argument", "uploadedFileId or filePath required.");
  }

  if (uploadedFileId) {
    const fileSnap = await db.collection("uploadedFiles").doc(uploadedFileId).get();
    if (!fileSnap.exists) {
      throw new HttpsError("not-found", "File not found or access denied.");
    }
    const fileRow = fromFirestore(fileSnap.data(), fileSnap.id);
    filePath = filePath || fileRow.file_path || fileRow.storage_path;
    fileName = fileName || fileRow.file_name;
  }

  if (!filePath || !fileName) {
    throw new HttpsError("invalid-argument", "filePath and fileName required.");
  }

  const [buffer] = await bucket.file(filePath).download();
  const bytes = Uint8Array.from(buffer);
  const extraction = await extractTextFromBytes(bytes, fileName, null);
  const result = buildImportResponse(extraction.text, fileName, {
    requestedTarget,
    sourceFileId: uploadedFileId || undefined,
    needsOcr: extraction.needsOcr,
    parseable: extraction.parseable,
  });

  const extractedPreview = (extraction.text || "").slice(0, 8000);
  const importMeta = IMPORT_TYPES[result.detectedType] || IMPORT_TYPES.needs_review;

  if (uploadedFileId) {
    try {
      await db.collection("parsedDocuments").add({
        uploadedFileId,
        extractedText: extraction.text || null,
        extractedJson: {
          detected_type: result.detectedType,
          confidence: result.confidence,
          draft_count: result.drafts.length,
          needs_ocr: result.needsOcr,
        },
        parserVersion: PARSER_VERSION,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[importProcessor] parsedDocuments", e.message);
    }

    try {
      await db.collection("importJobs").add({
        uploadedFileId,
        detectedType: result.detectedType,
        targetType: result.type,
        confidence: result.confidence,
        status: result.drafts.length ? "pending_review" : "needs_review",
        recordCount: result.drafts.length,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[importProcessor] importJobs", e.message);
    }
  }

  return {
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
  };
});

exports.stewardCore = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const userId = request.auth.uid;
  const profile = await requireApprovedUser(userId);
  const supabase = createDbAdapter(db);
  const body = request.data || {};

  const activeMode = body.activeMode || body.active_mode || "chat";
  const pagePath = String(body.pagePath || body.page_path || "").trim();
  const pageTitle = String(body.pageTitle || body.page_title || "").trim();
  const pendingActionId = body.pendingActionId || body.pending_action_id || null;

  let confirmPending = !!(body.confirm_pending || body.confirmPending);
  let cancelPending = !!(body.cancel_pending || body.cancelPending);
  if (body.confirmation === true) {
    confirmPending = true;
    cancelPending = false;
  } else if (body.confirmation === false) {
    cancelPending = true;
    confirmPending = false;
  }

  const message = String(body.message || "").trim();

  if (!message && !confirmPending && !cancelPending) {
    throw new HttpsError("invalid-argument", "Message or action required.");
  }

  let conversationId = body.conversationId || body.conversation_id;
  let pending = null;

  if (conversationId) {
    const convSnap = await db.collection("stewardConversations").doc(conversationId).get();
    if (convSnap.exists && convSnap.data().profileId === userId) {
      pending = convSnap.data().pendingAction || null;
    } else {
      conversationId = undefined;
    }
  }

  if (pendingActionId && pending && pending.action_id !== pendingActionId) {
    pending = null;
  }

  if (!conversationId) {
    const created = await db.collection("stewardConversations").add({
      profileId: userId,
      title: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    conversationId = created.id;
  }

  const ctx = { supabase, userId, profile, pagePath, pageTitle };

  let userMessageId = null;
  if (message && !confirmPending && !cancelPending) {
    const userMsg = await db.collection("stewardMessages").add({
      conversationId,
      profileId: userId,
      role: "user",
      message,
      pagePath: pagePath || null,
      pageTitle: pageTitle || null,
      createdAt: new Date().toISOString(),
    });
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

  const stewardMsg = await db.collection("stewardMessages").add({
    conversationId,
    profileId: userId,
    role: "steward",
    message: stewardText,
    createdAt: new Date().toISOString(),
  });

  if (message && !confirmPending) {
    const userMsgs = await db
      .collection("stewardMessages")
      .where("conversationId", "==", conversationId)
      .where("role", "==", "user")
      .get();
    if (userMsgs.size === 1) {
      await db.collection("stewardConversations").doc(conversationId).set(
        { title: titleFromMessage(message), updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  }

  await db.collection("stewardConversations").doc(conversationId).set(
    {
      updatedAt: new Date().toISOString(),
      pendingAction: brain.pending_confirmation || null,
    },
    { merge: true }
  );

  const openUrl = brain.openUrl || brain.open_url || brain.cap_search?.searchUrl || null;

  return {
    ok: true,
    reply: brain.reply,
    intent: brain.intent ?? null,
    suggestions: brain.suggestions ?? [],
    actions: brain.actions ?? [],
    openUrl,
    data_connected: brain.data_connected,
    dataConnected: brain.data_connected,
    source: brain.source ?? null,
    cap_search: brain.cap_search ?? null,
    needs_confirmation: brain.needs_confirmation,
    pending_confirmation: brain.pending_confirmation,
    pendingConfirmation: brain.pending_confirmation,
    conversation_id: conversationId,
    conversationId,
    user_message_id: userMessageId,
    userMessageId,
    steward_message_id: stewardMsg.id,
    stewardMessageId: stewardMsg.id,
    steward_message_at: new Date().toISOString(),
    stewardMessageAt: new Date().toISOString(),
  };
});

/** OCR processor stub — wire Vision API or third-party OCR in a future release. */
exports.ocrProcessor = onCall({ region: "us-central1" }, async () => {
  return {
    ok: false,
    error: "OCR is not enabled yet. Upload CSV/TXT/XLSX/DOCX for automatic parsing, or enter org chart data manually.",
  };
});
