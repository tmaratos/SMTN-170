/**
 * TN-170 Smart Import — upload, classify, extract, preview, confirm, save.
 */
(function initFileIngestion(global) {
  const PARSER_VERSION = "1.1";

  const IMPORT_TYPES = {
    meeting_schedule: {
      label: "Meeting schedule",
      target: "Meetings / Calendar",
      table: "meetings",
      href: "schedule.html",
    },
    cap_calendar: {
      label: "CAP calendar",
      target: "Calendar",
      table: "meetings",
      href: "calendar.html",
    },
    org_chart: {
      label: "Organization chart",
      target: "Organization Chart",
      table: "org_positions",
      href: "orgchart.html",
    },
    duty_assignments: {
      label: "Duty assignments",
      target: "Organization Chart",
      table: "org_positions",
      href: "orgchart.html",
    },
    senior_roster: {
      label: "Senior member roster",
      target: "Senior Member Workspace",
      table: null,
      href: "senior-member.html",
    },
    cadet_roster: {
      label: "Cadet roster",
      target: "Cadet Programs (reference)",
      table: null,
      href: "senior-member.html",
    },
    flight_review: {
      label: "Flight review tracker",
      target: "Flight Reviews",
      table: "flight_reviews",
      href: "flight-review.html",
    },
    inspection_checklist: {
      label: "Inspection checklist",
      target: "Inspection Prep",
      table: "inspection_items",
      href: "sui-readiness.html",
    },
    training_tracker: {
      label: "Training tracker",
      target: "Training (reference)",
      table: null,
      href: "documents.html",
    },
    task_list: {
      label: "Task list",
      target: "Tasks",
      table: "portal_tasks",
      href: "tasks.html",
    },
    reference_document: {
      label: "Reference document",
      target: "Files / CAP References",
      table: null,
      href: "documents.html",
    },
    needs_review: {
      label: "Needs review",
      target: "Import review",
      table: null,
      href: "documents.html",
    },
  };

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
    task_list: "task_list",
    duty_assignments: "duty_assignments",
    senior_roster: "senior_roster",
    needs_review: "needs_review",
  };

  const TYPE_TO_CATEGORY = {
    meeting_schedule: CATEGORIES.meeting_schedule,
    cap_calendar: CATEGORIES.meeting_schedule,
    org_chart: CATEGORIES.org_chart,
    duty_assignments: CATEGORIES.org_chart,
    flight_review: CATEGORIES.flight_review,
    inspection_checklist: CATEGORIES.inspection_prep,
    task_list: "task_list",
    training_tracker: CATEGORIES.training,
    senior_roster: CATEGORIES.general,
    cadet_roster: CATEGORIES.general,
    reference_document: CATEGORIES.general,
    needs_review: CATEGORIES.needs_review,
  };

  const TEXT_EXT = ["txt", "csv", "json", "md", "log"];
  const PARSEABLE_EXT = [...TEXT_EXT, "xlsx", "xls"];
  const BINARY_EXT = ["pdf", "docx", "doc", "png", "jpg", "jpeg", "gif", "webp"];

  let lastResult = null;
  let xlsxLoading = null;

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

  function loadScriptOnce(src) {
    if (global.XLSX && src.includes("xlsx")) return Promise.resolve();
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load spreadsheet parser."));
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  async function extractTextFromBlob(blob, fileName, mimeType) {
    const e = ext(fileName);
    if (TEXT_EXT.includes(e) || (mimeType || "").includes("text") || e === "csv") {
      try {
        return await blob.text();
      } catch {
        return null;
      }
    }
    if (e === "xlsx" || e === "xls") {
      try {
        await loadScriptOnce("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
        const buf = await blob.arrayBuffer();
        const wb = global.XLSX.read(buf, { type: "array" });
        return wb.SheetNames.map((n) => `--- ${n} ---\n${global.XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n");
      } catch (err) {
        console.warn("[import] xlsx", err);
        return null;
      }
    }
    return null;
  }

  async function extractTextFromFile(file) {
    if (!file) return null;
    return extractTextFromBlob(file, file.name, file.type);
  }

  async function downloadFileText(fileRecord) {
    const sb = getClient();
    if (!sb || !fileRecord?.storage_path) return null;
    const bucket = global.SMTN170Supabase?.storageBucket?.() || "squadron-files";
    const { data, error } = await sb.storage.from(bucket).download(fileRecord.storage_path);
    if (error) {
      console.warn("[import] download", error.message);
      return null;
    }
    return extractTextFromBlob(data, fileRecord.name || fileRecord.file_name, fileRecord.mime_type || fileRecord.file_type);
  }

  function scoreClassification(text, fileName) {
    const t = `${fileName}\n${text || ""}`.toLowerCase();
    const scores = {
      org_chart: 0,
      duty_assignments: 0,
      meeting_schedule: 0,
      cap_calendar: 0,
      flight_review: 0,
      inspection_checklist: 0,
      task_list: 0,
      senior_roster: 0,
      cadet_roster: 0,
      training_tracker: 0,
    };

    if (/org.?chart|organization chart|billet|commander|deputy|officer|reports to|duty position/i.test(t)) {
      scores.org_chart += 3;
      scores.duty_assignments += 2;
    }
    if (/duty assignment|assignments|position title|section chief/i.test(t)) scores.duty_assignments += 3;
    if (/schedule|meeting night|drill|uniform|recurring|calendar/i.test(t)) {
      scores.meeting_schedule += 3;
      scores.cap_calendar += 2;
    }
    if (/cap calendar|event date|squadron calendar/i.test(t)) scores.cap_calendar += 3;
    if (/bfr|flight review|pilot|expiration|reviewer|aircraft|capid|cap id/i.test(t)) scores.flight_review += 4;
    if (/sui|inspection|compliance|checklist|readiness|wing inspection/i.test(t)) scores.inspection_checklist += 4;
    if (/assigned to|due date|task|complete|priority|follow.?up/i.test(t)) scores.task_list += 3;
    if (/senior member|senior roster|sm roster/i.test(t)) scores.senior_roster += 3;
    if (/cadet roster|cadet programs|cadet member/i.test(t)) scores.cadet_roster += 3;
    if (/training tracker|aex|aes|tls|achievement/i.test(t)) scores.training_tracker += 2;

    let best = "needs_review";
    let bestScore = 0;
    Object.entries(scores).forEach(([k, v]) => {
      if (v > bestScore) {
        bestScore = v;
        best = k;
      }
    });

    const confidence = bestScore === 0 ? 0.15 : Math.min(0.95, 0.35 + bestScore * 0.12);
    if (confidence < 0.4) best = "needs_review";

    return { detectedType: best, confidence, scores };
  }

  function detectFileCategory(fileName, mimeType, userSelectedCategory) {
    if (userSelectedCategory && IMPORT_TYPES[userSelectedCategory]) return userSelectedCategory;
    const lower = (fileName || "").toLowerCase();
    if (/org.?chart|organization/i.test(lower)) return "org_chart";
    if (/schedule|calendar/i.test(lower)) return "meeting_schedule";
    if (/bfr|flight.?review/i.test(lower)) return "flight_review";
    if (/inspection|sui|checklist/i.test(lower)) return "inspection_checklist";
    if (/task/i.test(lower)) return "task_list";
    if (/roster|duty/i.test(lower)) return "duty_assignments";
    return "needs_review";
  }

  function parseCsvLines(text) {
    return (text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function parseDateToken(str) {
    if (!str) return null;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const tryD = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
      if (!isNaN(tryD.getTime())) return tryD.toISOString().slice(0, 10);
    }
    return null;
  }

  function parseOrgChartText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    const depts = global.SMTN170OrgChart?.DEPARTMENTS || ["Command", "Operations", "Safety", "Administration"];
    lines.forEach((line, i) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : line.split(/\t+/).map((c) => c.trim());
      let title = cols[0] || line;
      let department = cols[1] || "Operations";
      let member = cols[2] || "";
      let rank = cols[3] || "";
      let reportsTo = cols[4] || "";
      if (/^title|position|duty/i.test(title)) return;
      if (!depts.includes(department)) {
        if (depts.includes(cols[0])) {
          department = cols[0];
          title = cols[1] || line;
          member = cols[2] || "";
        }
      }
      drafts.push({
        draft: true,
        confidence: member ? 0.7 : 0.5,
        title,
        department,
        assigned_member_name: member,
        rank: rank || "",
        parent_hint: reportsTo,
        status: member ? "filled" : "vacant",
        responsibilities: "",
        notes: "Smart import — source document",
        sort_order: i + 1,
      });
    });
    return drafts;
  }

  function parseMeetingScheduleText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : line.split(/\t+/).map((c) => c.trim());
      let title = cols[0] || line;
      if (/^title|event|meeting|date/i.test(title)) return;
      const dateStr = cols[1] || "";
      const timeStr = cols[2] || "";
      const endTime = cols[3] || "";
      const loc = cols[4] || cols[3] || "";
      const meeting_date = parseDateToken(dateStr) || parseDateToken(line);
      drafts.push({
        draft: true,
        confidence: meeting_date ? 0.75 : 0.45,
        title,
        meeting_date: meeting_date || null,
        meeting_time: timeStr,
        end_time: endTime,
        location: loc,
        status: "planned",
        notes: "Smart import — source document",
      });
    });
    return drafts;
  }

  function parseInspectionText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const clean = line.replace(/^[-*•\d.]+\s*/, "").trim();
      if (!clean || clean.length < 3 || /^item|checklist|title/i.test(clean)) return;
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [clean];
      drafts.push({
        draft: true,
        confidence: 0.65,
        title: cols[0],
        work_unit: cols[1] || "General",
        status: "needs_review",
        notes: "Smart import — source document",
      });
    });
    return drafts;
  }

  function parseFlightReviewText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : line.split(/\t+/).map((c) => c.trim());
      if (/^name|member|department|pilot/i.test(cols[0])) return;
      const member = cols[0] || "";
      const capId = (cols[1] || "").match(/\d{6,}/) ? cols[1] : cols[2] || "";
      const reviewDate = parseDateToken(cols[2]) || parseDateToken(cols[3]);
      const expiration = parseDateToken(cols[3]) || parseDateToken(cols[4]);
      let status = "needs_review";
      if (/current|valid|complete/i.test(line)) status = "current";
      if (/due|soon/i.test(line)) status = "due_soon";
      if (/overdue|expired/i.test(line)) status = "overdue";
      drafts.push({
        draft: true,
        confidence: 0.6,
        member_name: member,
        cap_id: capId,
        department: member || cols[0] || "General",
        review_date: reviewDate,
        expiration_date: expiration,
        status,
        notes: "Smart import — source document",
      });
    });
    return drafts;
  }

  function parseTasksText(text) {
    const lines = parseCsvLines(text);
    const drafts = [];
    lines.forEach((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
      const title = cols[0];
      if (!title || /^task|title|item/i.test(title)) return;
      drafts.push({
        draft: true,
        confidence: 0.65,
        title,
        due_date: parseDateToken(cols[1]),
        status: /complete|done/i.test(line) ? "completed" : "open",
        priority: cols[2] || "normal",
        description: cols[3] || "",
        notes: "Smart import — source document",
      });
    });
    return drafts;
  }

  function parseRosterText(text, kind) {
    const lines = parseCsvLines(text);
    return lines
      .filter((l) => l.length > 2 && !/^name|rank|email/i.test(l))
      .map((line, i) => {
        const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
        return {
          draft: true,
          confidence: 0.55,
          name: cols[0],
          rank: cols[1] || "",
          cap_id: cols[2] || "",
          email: cols[3] || "",
          kind,
        };
      });
  }

  async function createRecordsFromExtractedText(fileRecord, extractedText, detectedType) {
    if (!extractedText) return { drafts: [], parsed: false, type: null };

    switch (detectedType) {
      case "org_chart":
      case "duty_assignments":
        return { drafts: parseOrgChartText(extractedText), parsed: true, type: "org_positions" };
      case "meeting_schedule":
      case "cap_calendar":
        return { drafts: parseMeetingScheduleText(extractedText), parsed: true, type: "meetings" };
      case "inspection_checklist":
        return { drafts: parseInspectionText(extractedText), parsed: true, type: "inspection_items" };
      case "flight_review":
        return { drafts: parseFlightReviewText(extractedText), parsed: true, type: "flight_reviews" };
      case "task_list":
        return { drafts: parseTasksText(extractedText), parsed: true, type: "portal_tasks" };
      case "senior_roster":
        return { drafts: parseRosterText(extractedText, "senior"), parsed: true, type: "roster_reference" };
      case "cadet_roster":
        return { drafts: parseRosterText(extractedText, "cadet"), parsed: true, type: "roster_reference" };
      default:
        return { drafts: [], parsed: true, type: "reference" };
    }
  }

  async function saveParsedDocument(uploadedFileId, extractedText, extractedJson) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("parsed_documents")
      .insert({
        uploaded_file_id: uploadedFileId,
        extracted_text: extractedText || null,
        extracted_json: extractedJson || {},
        parser_version: PARSER_VERSION,
      })
      .select()
      .single();
    if (error) {
      console.warn("[import] parsed_documents", error.message);
      return null;
    }
    return data;
  }

  async function saveImportJob(payload) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb) return null;
    const { data, error } = await sb
      .from("import_jobs")
      .insert({
        uploaded_file_id: payload.uploaded_file_id,
        detected_type: payload.detected_type,
        target_type: payload.target_type,
        confidence: payload.confidence,
        status: payload.status || "pending_review",
        error_message: payload.error_message || null,
        record_count: payload.record_count || 0,
        created_by: uid,
      })
      .select()
      .single();
    if (error) {
      console.warn("[import] import_jobs", error.message);
      return null;
    }
    return data;
  }

  async function updateImportJob(id, patch) {
    const sb = getClient();
    if (!sb || !id) return;
    await sb.from("import_jobs").update(patch).eq("id", id);
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
        notes: (d.notes || "Smart import").trim(),
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
      if (!d.meeting_date) continue;
      const { data, error } = await sb
        .from("meetings")
        .insert({
          title: d.title,
          meeting_date: d.meeting_date,
          meeting_time: d.meeting_time || null,
          location: d.location || null,
          notes: d.notes || "Smart import",
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
          notes: d.notes || "Smart import",
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
      const notes = [
        d.notes || "Smart import",
        d.member_name ? `Member: ${d.member_name}` : "",
        d.cap_id ? `CAP ID: ${d.cap_id}` : "",
        d.review_date ? `Review: ${d.review_date}` : "",
        d.expiration_date ? `Expires: ${d.expiration_date}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const { data, error } = await sb
        .from("flight_reviews")
        .insert({
          department: d.department || d.member_name || "General",
          status: ["current", "due_soon", "overdue", "scheduled", "completed", "needs_review"].includes(d.status)
            ? d.status
            : "needs_review",
          notes,
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

  async function saveDraftTasks(drafts) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to save tasks.");
    const saved = [];
    for (const d of drafts) {
      const { data, error } = await sb
        .from("portal_tasks")
        .insert({
          title: d.title,
          description: d.description || null,
          status: d.status || "open",
          due_date: d.due_date || null,
          priority: d.priority || "normal",
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

  async function buildImportResult(fileRecord, extractedText, options) {
    const userType = options?.detectedType || options?.category;
    const classification = scoreClassification(extractedText, fileRecord.name || fileRecord.file_name);
    let detectedType = userType && IMPORT_TYPES[userType] ? userType : classification.detectedType;
    let confidence = classification.confidence;
    if (userType && IMPORT_TYPES[userType]) confidence = Math.max(confidence, 0.55);

    const e = ext(fileRecord.name || fileRecord.file_name);
    const isBinary = BINARY_EXT.includes(e) && !extractedText;

    if (isBinary) {
      return {
        ok: true,
        detectedType: detectedType === "needs_review" ? detectFileCategory(fileRecord.name, fileRecord.mime_type) : detectedType,
        confidence: 0.2,
        category: TYPE_TO_CATEGORY[detectedType] || CATEGORIES.needs_review,
        message:
          "File stored and indexed. Text could not be extracted from this format automatically — review the source document and confirm a destination, or re-upload as CSV/TXT/XLSX if available.",
        drafts: [],
        parsed: false,
        parseable: false,
        fileRecord,
        extractedText: null,
        needsReview: true,
        importMeta: IMPORT_TYPES[detectedType] || IMPORT_TYPES.needs_review,
      };
    }

    const { drafts, parsed, type } = await createRecordsFromExtractedText(fileRecord, extractedText, detectedType);
    const importMeta = IMPORT_TYPES[detectedType] || IMPORT_TYPES.needs_review;

    if (!parsed || !extractedText) {
      return {
        ok: true,
        detectedType,
        confidence: 0.2,
        category: TYPE_TO_CATEGORY[detectedType],
        message: "File stored. Readable text was not extracted — marked as needs review.",
        drafts: [],
        parsed: false,
        parseable: false,
        fileRecord,
        extractedText,
        needsReview: true,
        importMeta,
        type,
      };
    }

    if (!drafts.length) {
      return {
        ok: true,
        detectedType,
        confidence: Math.min(confidence, 0.35),
        category: TYPE_TO_CATEGORY[detectedType],
        message:
          "File stored and text was extracted, but no structured rows were detected with confidence. Review extracted content and choose a destination.",
        drafts: [],
        parsed: true,
        parseable: true,
        fileRecord,
        extractedText: (extractedText || "").slice(0, 8000),
        needsReview: true,
        importMeta,
        type,
      };
    }

    const lowConfidence = confidence < 0.45 || detectedType === "needs_review";
    return {
      ok: true,
      detectedType,
      confidence,
      category: TYPE_TO_CATEGORY[detectedType] || detectedType,
      message: `Smart import detected ${drafts.length} possible record(s) for ${importMeta.label}. This is a best-effort extraction — review before confirming.`,
      drafts,
      parsed: true,
      parseable: true,
      fileRecord,
      extractedText: (extractedText || "").slice(0, 8000),
      type,
      needsReview: true,
      lowConfidence,
      importMeta,
    };
  }

  async function persistImportAudit(fileRecord, result) {
    const parsed = await saveParsedDocument(fileRecord.id, result.extractedText, {
      detected_type: result.detectedType,
      confidence: result.confidence,
      draft_count: result.drafts?.length || 0,
      scores: result.scores,
    });
    const job = await saveImportJob({
      uploaded_file_id: fileRecord.id,
      detected_type: result.detectedType,
      target_type: result.type,
      confidence: result.confidence,
      status: result.drafts?.length ? "pending_review" : "needs_review",
      record_count: result.drafts?.length || 0,
    });
    return { parsed, job };
  }

  async function updatePortalFromFile(fileRecord, extractedText, categoryOrType) {
    const result = await buildImportResult(fileRecord, extractedText, {
      detectedType: categoryOrType,
      category: categoryOrType,
    });
    await persistImportAudit(fileRecord, result);
    return result;
  }

  async function ingestUploadedFile(fileRecord, options) {
    const text = options?.extractedText != null ? options.extractedText : await downloadFileText(fileRecord);
    const folder = fileRecord.folder || fileRecord.upload_area;
    const detected =
      options?.detectedType ||
      detectFileCategory(fileRecord.name || fileRecord.file_name, fileRecord.mime_type, folder);
    const result = await buildImportResult(fileRecord, text, { detectedType: detected });
    await persistImportAudit(fileRecord, result);
    lastResult = result;
    global.dispatchEvent(new CustomEvent("smtn170:file-ingested", { detail: result }));
    return result;
  }

  async function uploadAndIngest(file, options) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to upload files.");
    if (!file) throw new Error("No file selected.");

    const extractedText = await extractTextFromFile(file);
    const classification = scoreClassification(extractedText, file.name);
    const detectedType =
      options?.detectedType || options?.category || classification.detectedType;
    const uploadArea = options?.upload_area || options?.folder || TYPE_TO_CATEGORY[detectedType] || "general";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `imports/${uid}/${Date.now()}-${safeName}`;
    const bucket = global.SMTN170Supabase?.storageBucket?.() || "squadron-files";

    const { error: upErr } = await sb.storage.from(bucket).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const now = new Date().toISOString();
    const fileType = ext(file.name) || file.type;
    const insertPayload = {
      name: file.name,
      folder: uploadArea,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: uid,
      last_worked_by: uid,
      last_worked_at: now,
      updated_at: now,
    };
    const { data: row, error: dbErr } = await sb.from("uploaded_files").insert(insertPayload).select().single();
    if (dbErr) throw new Error(dbErr.message);

    try {
      await sb.from("uploaded_files").update({ upload_area: uploadArea, file_type: fileType }).eq("id", row.id);
    } catch {
      /* optional columns */
    }

    const fileRecord = { ...row, folder: uploadArea, upload_area: uploadArea, file_type: fileType };
    const result = await buildImportResult(fileRecord, extractedText, { detectedType });
    const audit = await persistImportAudit(fileRecord, result);
    result.importJob = audit.job;
    result.parsedDocument = audit.parsed;
    lastResult = result;
    global.dispatchEvent(new CustomEvent("smtn170:file-ingested", { detail: result }));
    return result;
  }

  async function commitDrafts(result, overrideType) {
    const drafts = result?.drafts || [];
    if (!drafts.length) return { saved: [], message: "No records to import." };

    const type = overrideType || result.type;
    let saved = [];
    if (type === "org_positions") saved = await saveDraftOrgPositions(drafts);
    else if (type === "meetings") saved = await saveDraftMeetings(drafts);
    else if (type === "inspection_items") saved = await saveDraftInspectionItems(drafts);
    else if (type === "flight_reviews") saved = await saveDraftFlightReviews(drafts);
    else if (type === "portal_tasks") saved = await saveDraftTasks(drafts);
    else if (type === "roster_reference") {
      return {
        saved: [],
        message:
          "Roster data extracted and stored with the source file. Member rows were not auto-written to a roster table — review in Import Center or Senior Member Workspace.",
      };
    } else {
      return { saved: [], message: "No automatic target table for this document type. File remains indexed." };
    }

    if (result.importJob?.id) {
      await updateImportJob(result.importJob.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        record_count: saved.length,
      });
    }

    global.dispatchEvent(new CustomEvent("smtn170:import-complete", { detail: { saved, result } }));
    return { saved, message: `${saved.length} record(s) imported. Source document kept on file.` };
  }

  async function confirmImport(result, overrideDetectedType) {
    if (!result) throw new Error("Nothing to import.");
    let type = result.type;
    if (overrideDetectedType) {
      const remapped = await createRecordsFromExtractedText(
        result.fileRecord,
        result.extractedText || (await downloadFileText(result.fileRecord)),
        overrideDetectedType
      );
      result.detectedType = overrideDetectedType;
      result.drafts = remapped.drafts;
      result.type = remapped.type;
      type = remapped.type;
    }
    return commitDrafts({ ...result, type }, type);
  }

  async function listUploadedFiles(limit) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit || 30);
    if (error) {
      console.error("[import] list files", error.message);
      return [];
    }
    return data || [];
  }

  async function listImportJobs(limit) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("import_jobs")
      .select("*, uploaded_files(name, folder, storage_path)")
      .order("created_at", { ascending: false })
      .limit(limit || 20);
    if (error) {
      console.warn("[import] list jobs", error.message);
      return [];
    }
    return data || [];
  }

  function getTypeOptions() {
    return Object.entries(IMPORT_TYPES).map(([id, meta]) => ({
      id,
      label: meta.label,
      target: meta.target,
    }));
  }

  function typeToTable(detectedType) {
    const map = {
      org_chart: "org_positions",
      duty_assignments: "org_positions",
      meeting_schedule: "meetings",
      cap_calendar: "meetings",
      flight_review: "flight_reviews",
      inspection_checklist: "inspection_items",
      task_list: "portal_tasks",
    };
    return map[detectedType] || null;
  }

  global.SMTN170FileIngestion = {
    PARSER_VERSION,
    IMPORT_TYPES,
    CATEGORIES,
    detectFileCategory,
    scoreClassification,
    extractTextFromFile,
    ingestUploadedFile,
    uploadAndIngest,
    updatePortalFromFile,
    createRecordsFromExtractedText,
    downloadFileText,
    listUploadedFiles,
    listImportJobs,
    commitDrafts,
    confirmImport,
    saveDraftOrgPositions,
    saveDraftMeetings,
    saveDraftInspectionItems,
    saveDraftFlightReviews,
    saveDraftTasks,
    getTypeOptions,
    typeToTable,
    getLastResult: () => lastResult,
  };
})(window);
