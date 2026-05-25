/**
 * TN-170 file upload ingestion — storage + uploaded_files + portal record drafts.
 */
(function initFileIngestion(global) {
  const CATEGORIES = {
    org_chart: "org_chart",
    meeting_schedule: "meeting_schedule",
    meeting_minutes: "meeting_minutes",
    inspection_prep: "inspection_prep",
    flight_review: "flight_review",
    safety: "safety",
    training: "training",
    forms: "forms",
    general: "general",
  };

  const FOLDER_TO_CATEGORY = {
    General: "general",
    "Meeting Schedule": "meeting_schedule",
    "Meeting Minutes": "meeting_minutes",
    Safety: "safety",
    Operations: "general",
    "Emergency Services": "general",
    "Aerospace Education": "training",
    "Cadet Programs": "training",
    Training: "training",
    Finance: "forms",
    Forms: "forms",
    org_chart: "org_chart",
    meeting_schedule: "meeting_schedule",
    inspection_prep: "inspection_prep",
    flight_review: "flight_review",
  };

  const TEXT_EXT = ["txt", "csv", "json", "md", "log"];
  const PDF_IMAGE_EXT = ["pdf", "png", "jpg", "jpeg", "gif", "webp"];

  let lastResult = null;

  function getClient() {
    return global.TN170SupabaseClient || global.SMTN170Supabase?.getClient?.();
  }

  function ext(name) {
    const p = (name || "").split(".");
    return p.length > 1 ? p.pop().toLowerCase() : "";
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function detectFileCategory(fileName, mimeType, userSelectedCategory) {
    if (userSelectedCategory && CATEGORIES[userSelectedCategory]) return userSelectedCategory;
    const lower = (fileName || "").toLowerCase();
    if (/org.?chart|organization|billet|staffing/i.test(lower)) return CATEGORIES.org_chart;
    if (/schedule|calendar|meeting.?plan/i.test(lower)) return CATEGORIES.meeting_schedule;
    if (/minutes|meeting.?notes/i.test(lower)) return CATEGORIES.meeting_minutes;
    if (/inspection|sui|checklist|readiness/i.test(lower)) return CATEGORIES.inspection_prep;
    if (/bfr|flight.?review|review.?packet/i.test(lower)) return CATEGORIES.flight_review;
    if (/safety/i.test(lower)) return CATEGORIES.safety;
    if (/training|aex|aes/i.test(lower)) return CATEGORIES.training;
    if (/form/i.test(lower)) return CATEGORIES.forms;
    if ((mimeType || "").includes("csv")) return CATEGORIES.meeting_schedule;
    if ((mimeType || "").includes("json")) return CATEGORIES.general;
    return CATEGORIES.general;
  }

  async function downloadFileText(fileRecord) {
    const sb = getClient();
    if (!sb || !fileRecord?.storage_path) return null;
    const bucket = global.SMTN170Supabase?.storageBucket?.() || "squadron-files";
    const { data, error } = await sb.storage.from(bucket).download(fileRecord.storage_path);
    if (error) {
      console.warn("[ingest] download", error.message);
      return null;
    }
    const e = ext(fileRecord.name);
    if (!TEXT_EXT.includes(e) && !(fileRecord.mime_type || "").includes("text")) {
      return null;
    }
    try {
      return await data.text();
    } catch {
      return null;
    }
  }

  function parseCsvLines(text) {
    return (text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function parseOrgChartText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    const depts = global.SMTN170OrgChart?.DEPARTMENTS || [
      "Command",
      "Operations",
      "Safety",
      "Administration",
    ];
    lines.forEach((line, i) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
      const title = cols[0] || line;
      if (!title || title.length < 2 || /^title|position|name/i.test(title)) return;
      const department = cols[1] && depts.includes(cols[1]) ? cols[1] : "Operations";
      const member = cols[2] || "";
      drafts.push({
        draft: true,
        title,
        department,
        assigned_member_name: member,
        status: member ? "filled" : "vacant",
        responsibilities: cols[3] || "",
        notes: "[import draft]",
        sort_order: i + 1,
      });
    });
    return drafts;
  }

  function parseMeetingScheduleText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : null;
      let title = line;
      let dateStr = "";
      let timeStr = "";
      let loc = "";
      if (cols && cols.length >= 2) {
        title = cols[0];
        dateStr = cols[1];
        timeStr = cols[2] || "";
        loc = cols[3] || "";
      } else {
        const dm = line.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (dm) dateStr = dm[1];
      }
      if (!title || /^title|meeting|date/i.test(title)) return;
      let meeting_date = null;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) meeting_date = d.toISOString().slice(0, 10);
      }
      drafts.push({
        draft: true,
        title,
        meeting_date: meeting_date || new Date().toISOString().slice(0, 10),
        meeting_time: timeStr,
        location: loc,
        status: "planned",
        notes: "[import draft]",
      });
    });
    return drafts;
  }

  function parseInspectionText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const clean = line.replace(/^[-*•\d.]+\s*/, "").trim();
      if (!clean || clean.length < 3) return;
      if (/^item|checklist|title/i.test(clean)) return;
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [clean];
      drafts.push({
        draft: true,
        title: cols[0],
        work_unit: cols[1] || "General",
        status: "needs_review",
        notes: "[import draft]",
      });
    });
    return drafts;
  }

  function parseFlightReviewText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
      const dept = cols[0];
      if (!dept || /^department|dept/i.test(dept)) return;
      drafts.push({
        draft: true,
        department: dept,
        status: cols[1] || "needs_review",
        notes: cols[2] || "[import draft]",
      });
    });
    return drafts;
  }

  async function createRecordsFromExtractedText(fileRecord, extractedText, category) {
    if (!extractedText) return { drafts: [], parsed: false };

    switch (category) {
      case CATEGORIES.org_chart:
        return { drafts: parseOrgChartText(extractedText), parsed: true, type: "org_positions" };
      case CATEGORIES.meeting_schedule:
      case CATEGORIES.meeting_minutes:
        return { drafts: parseMeetingScheduleText(extractedText), parsed: true, type: "meetings" };
      case CATEGORIES.inspection_prep:
        return { drafts: parseInspectionText(extractedText), parsed: true, type: "inspection_items" };
      case CATEGORIES.flight_review:
        return { drafts: parseFlightReviewText(extractedText), parsed: true, type: "flight_reviews" };
      default:
        return { drafts: [], parsed: true, type: "general" };
    }
  }

  async function saveDraftOrgPositions(drafts) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to save positions.");
    const saved = [];
    for (const d of drafts) {
      const row = {
        id: global.crypto?.randomUUID?.() || "org-" + Date.now() + "-" + Math.random().toString(16).slice(2),
        title: d.title,
        department: d.department || "Operations",
        parent_id: d.parent_id || null,
        sort_order: d.sort_order || saved.length + 1,
        assigned_member_name: d.assigned_member_name || "",
        status: d.status || "vacant",
        is_command: !!d.is_command,
        responsibilities: d.responsibilities || "",
        notes: (d.notes || "[import draft]").trim(),
        created_by: uid,
        updated_by: uid,
        last_worked_by: uid,
        last_worked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("org_positions").upsert(row);
      if (error) throw new Error(error.message);
      saved.push(row);
    }
    return saved;
  }

  async function saveDraftMeetings(drafts) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to save meetings.");
    const saved = [];
    for (const d of drafts) {
      const { data, error } = await sb
        .from("meetings")
        .insert({
          title: d.title,
          meeting_date: d.meeting_date,
          meeting_time: d.meeting_time || null,
          location: d.location || null,
          notes: d.notes || "[import draft]",
          status: d.status || "planned",
          created_by: uid,
          updated_by: uid,
          last_worked_by: uid,
          last_worked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved.push(data);
    }
    return saved;
  }

  async function saveDraftInspectionItems(drafts) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to save inspection items.");
    const saved = [];
    for (const d of drafts) {
      const { data, error } = await sb
        .from("inspection_items")
        .insert({
          title: d.title,
          work_unit: d.work_unit || "General",
          status: d.status || "needs_review",
          notes: d.notes || "[import draft]",
          created_by: uid,
          last_worked_by: uid,
          last_worked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved.push(data);
    }
    return saved;
  }

  async function saveDraftFlightReviews(drafts) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to save flight reviews.");
    const saved = [];
    for (const d of drafts) {
      const { data, error } = await sb
        .from("flight_reviews")
        .insert({
          department: d.department,
          status: ["current", "due_soon", "overdue", "scheduled", "completed", "needs_review"].includes(d.status)
            ? d.status
            : "needs_review",
          notes: d.notes || "[import draft]",
          created_by: uid,
          last_worked_by: uid,
          last_worked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved.push(data);
    }
    return saved;
  }

  async function updatePortalFromFile(fileRecord, extractedText, category) {
    const cat = category || detectFileCategory(fileRecord.name, fileRecord.mime_type, fileRecord.folder);
    const e = ext(fileRecord.name);
    const isBinary = PDF_IMAGE_EXT.includes(e);

    if (isBinary && !extractedText) {
      return {
        ok: true,
        category: cat,
        message:
          cat === CATEGORIES.org_chart
            ? "Org chart uploaded. Automatic parsing for PDF/image org charts requires OCR. You can manually add positions or ask Steward to help draft them from visible text."
            : "File uploaded and indexed. Automatic reading for this file type is not enabled yet.",
        drafts: [],
        parsed: false,
        fileRecord,
      };
    }

    const { drafts, parsed, type } = await createRecordsFromExtractedText(fileRecord, extractedText, cat);

    if (!parsed || !extractedText) {
      return {
        ok: true,
        category: cat,
        message: "File uploaded and indexed. Automatic reading for this file type is not enabled yet.",
        drafts: [],
        parsed: false,
        fileRecord,
      };
    }

    if (!drafts.length) {
      return {
        ok: true,
        category: cat,
        message: "File uploaded and indexed, but no structured rows were detected. Review the file or add records manually.",
        drafts: [],
        parsed: true,
        fileRecord,
        type,
      };
    }

    return {
      ok: true,
      category: cat,
      message: `Detected ${drafts.length} draft ${type || "record"}(s). Review before saving to the portal.`,
      drafts,
      parsed: true,
      fileRecord,
      type,
      needsReview: true,
    };
  }

  async function ingestUploadedFile(fileRecord) {
    const text = await downloadFileText(fileRecord);
    const category = detectFileCategory(fileRecord.name, fileRecord.mime_type, FOLDER_TO_CATEGORY[fileRecord.folder] || fileRecord.folder);
    const result = await updatePortalFromFile(fileRecord, text, category);
    lastResult = result;
    global.dispatchEvent(new CustomEvent("smtn170:file-ingested", { detail: result }));
    return result;
  }

  async function uploadAndIngest(file, options) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to upload files.");
    if (!file) throw new Error("No file selected.");

    const category = options?.category || detectFileCategory(file.name, file.type, options?.folder);
    const folder = options?.folder || category || "general";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const prefix =
      category === CATEGORIES.org_chart
        ? `org-charts/imports/${uid}`
        : category === CATEGORIES.meeting_schedule
          ? `schedules/imports/${uid}`
          : `${uid}`;
    const storagePath = `${prefix}/${Date.now()}-${safeName}`;
    const bucket = global.SMTN170Supabase?.storageBucket?.() || "squadron-files";

    const { error: upErr } = await sb.storage.from(bucket).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const now = new Date().toISOString();
    const { data: row, error: dbErr } = await sb
      .from("uploaded_files")
      .insert({
        name: file.name,
        folder: folder,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uid,
        last_worked_by: uid,
        last_worked_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);

    const fileRecord = { ...row, folder };
    return ingestUploadedFile(fileRecord);
  }

  async function listUploadedFiles(limit) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit || 20);
    if (error) {
      console.error("[ingest] list files", error.message);
      return [];
    }
    return data || [];
  }

  async function commitDrafts(result) {
    if (!result?.drafts?.length) return { saved: [] };
    const type = result.type;
    if (type === "org_positions") return { saved: await saveDraftOrgPositions(result.drafts) };
    if (type === "meetings") return { saved: await saveDraftMeetings(result.drafts) };
    if (type === "inspection_items") return { saved: await saveDraftInspectionItems(result.drafts) };
    if (type === "flight_reviews") return { saved: await saveDraftFlightReviews(result.drafts) };
    return { saved: [] };
  }

  function parseOrgChartUpload(fileRecord) {
    return ingestUploadedFile(fileRecord);
  }

  function draftOrgPositionsFromUpload(fileRecord) {
    return ingestUploadedFile(fileRecord);
  }

  global.SMTN170FileIngestion = {
    CATEGORIES,
    detectFileCategory,
    ingestUploadedFile,
    uploadAndIngest,
    updatePortalFromFile,
    createRecordsFromExtractedText,
    downloadFileText,
    listUploadedFiles,
    commitDrafts,
    saveDraftOrgPositions,
    saveDraftMeetings,
    saveDraftInspectionItems,
    saveDraftFlightReviews,
    parseOrgChartUpload,
    draftOrgPositionsFromUpload,
    getLastResult: () => lastResult,
  };
})(window);
