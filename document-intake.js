/**
 * Document Intake + Smart Filing — front-end demo.
 * Future: Supabase (metadata, roles, audit) + Google Drive (file storage).
 */
(function initDocumentIntakeModule(global) {
  const STORAGE_KEY = "smtn170_document_intake";

  const CATEGORIES = [
    "Operations",
    "Emergency Services",
    "Aerospace Education",
    "Cadet Programs",
    "Communications",
    "Logistics",
    "Safety",
    "Finance/Admin",
    "Biannual Flight Reviews",
    "Monthly Schedules",
    "Meeting Minutes",
    "Training Records",
    "Forms",
    "Rosters",
    "Miscellaneous / Needs Review",
  ];

  const DEPARTMENTS = CATEGORIES.filter((c) =>
    [
      "Operations",
      "Emergency Services",
      "Aerospace Education",
      "Cadet Programs",
      "Communications",
      "Logistics",
      "Safety",
      "Finance/Admin",
    ].includes(c)
  );

  const REVIEW_STATUS = {
    PENDING: "pending",
    NEEDS_REVIEW: "needs_review",
    REVIEWED: "reviewed",
    FLAGGED: "flagged",
  };

  const ROLES = {
    ADMIN: "admin",
    OFFICER: "officer",
    MEMBER: "member",
  };

  const MOCK_USER = {
    id: "user-demo-officer",
    name: "Capt. M. Ellis",
    role: ROLES.OFFICER,
  };

  const PERMISSIONS = {
    [ROLES.ADMIN]: ["upload", "review", "move", "delete", "finalize"],
    [ROLES.OFFICER]: ["upload", "review", "move", "finalize"],
    [ROLES.MEMBER]: ["upload"],
  };

  const INTEGRATION = {
    supabase: {
      connected: false,
      label: "Squadron records (Supabase)",
      status: "Not connected — filing metadata pending",
      projectRef: null,
    },
    googleDrive: {
      connected: false,
      label: "Squadron Drive",
      status: "Not linked — connect squadron Google Drive",
      rootFolderId: "PLACEHOLDER_SQUADRON_ROOT",
    },
  };

  const CLASSIFY_RULES = [
    { pattern: /flight.?review|bfr|biannual/i, category: "Biannual Flight Reviews", confidence: 0.92 },
    { pattern: /schedule|monthly.?ops/i, category: "Monthly Schedules", confidence: 0.9 },
    { pattern: /minute|agenda|meeting.?notes/i, category: "Meeting Minutes", confidence: 0.88 },
    { pattern: /safety|range|hazard|risk/i, category: "Safety", confidence: 0.9 },
    { pattern: /cadet|cpft|great.?start/i, category: "Cadet Programs", confidence: 0.88 },
    { pattern: /emergency|es_|gtm|mission/i, category: "Emergency Services", confidence: 0.87 },
    { pattern: /aerospace|aex|stem|ae_/i, category: "Aerospace Education", confidence: 0.87 },
    { pattern: /comm|radio|repeater/i, category: "Communications", confidence: 0.85 },
    { pattern: /logistics|supply|inventory/i, category: "Logistics", confidence: 0.86 },
    { pattern: /finance|budget|admin|receipt/i, category: "Finance/Admin", confidence: 0.86 },
    { pattern: /training|lesson|tlc/i, category: "Training Records", confidence: 0.84 },
    { pattern: /capf|form|application/i, category: "Forms", confidence: 0.83 },
    { pattern: /roster|duty|assignment/i, category: "Rosters", confidence: 0.85 },
    { pattern: /operations|sop|ops_/i, category: "Operations", confidence: 0.84 },
  ];

  function uid() {
    return global.crypto?.randomUUID?.() || "di-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function can(action) {
    return (PERMISSIONS[MOCK_USER.role] || []).includes(action);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function detectFileType(file) {
    const name = file.name || "";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const mime = file.type || "";
    if (mime.startsWith("image/")) return { kind: "image", ext, mime, label: "Image" };
    if (mime === "application/pdf" || ext === "pdf") return { kind: "pdf", ext, mime, label: "PDF" };
    if (mime.includes("spreadsheet") || ["xlsx", "xls", "csv"].includes(ext))
      return { kind: "spreadsheet", ext, mime, label: "Spreadsheet" };
    if (mime.includes("word") || ["doc", "docx"].includes(ext)) return { kind: "document", ext, mime, label: "Document" };
    if (mime.includes("presentation") || ["ppt", "pptx"].includes(ext))
      return { kind: "presentation", ext, mime, label: "Presentation" };
    if (["zip", "rar", "7z"].includes(ext)) return { kind: "archive", ext, mime, label: "Archive" };
    return { kind: "file", ext, mime: mime || "application/octet-stream", label: ext ? ext.toUpperCase() : "File" };
  }

  function departmentForCategory(category) {
    return DEPARTMENTS.includes(category) ? category : null;
  }

  function classifyFile(name, mimeType) {
    const base = name.replace(/\.[^/.]+$/, "");
    for (const rule of CLASSIFY_RULES) {
      if (rule.pattern.test(name) || rule.pattern.test(base)) {
        return {
          suggestedCategory: rule.category,
          department: departmentForCategory(rule.category),
          confidence: rule.confidence,
          reason: "Matched filename pattern",
        };
      }
    }
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (!ext || ["tmp", "dat", "unknown"].includes(ext)) {
      return {
        suggestedCategory: "Miscellaneous / Needs Review",
        department: null,
        confidence: 0.35,
        reason: "Unknown or weak file signal",
      };
    }
    return {
      suggestedCategory: "Miscellaneous / Needs Review",
      department: null,
      confidence: 0.48,
      reason: "No department keyword match",
    };
  }

  function logMovement(file, action, details) {
    file.movementHistory = file.movementHistory || [];
    file.movementHistory.unshift({
      id: uid(),
      action,
      details,
      by: MOCK_USER.name,
      byUserId: MOCK_USER.id,
      at: new Date().toISOString(),
      fromCategory: details.fromCategory || file.finalCategory,
      toCategory: details.toCategory || null,
    });
  }

  function createFileRecord(file, overrides) {
    const typeInfo = detectFileType(file);
    const classification = classifyFile(file.name, file.type);
    const lowConfidence = classification.confidence < 0.65;
    const finalCategory =
      overrides?.finalCategory ||
      (lowConfidence ? "Miscellaneous / Needs Review" : classification.suggestedCategory);

    const record = {
      id: uid(),
      fileName: overrides?.fileName || file.name,
      originalFileName: file.name,
      fileType: typeInfo.label,
      fileTypeKind: typeInfo.kind,
      mimeType: typeInfo.mime,
      fileSize: file.size || 0,
      uploadedBy: MOCK_USER.name,
      uploadedByUserId: MOCK_USER.id,
      uploadDate: new Date().toISOString(),
      suggestedCategory: classification.suggestedCategory,
      finalCategory,
      department: overrides?.department ?? departmentForCategory(finalCategory),
      tags: overrides?.tags || [],
      googleDriveFileId: null,
      supabaseMetadataId: null,
      reviewStatus: lowConfidence ? REVIEW_STATUS.NEEDS_REVIEW : REVIEW_STATUS.PENDING,
      notes: "",
      flagged: false,
      reviewed: false,
      classificationConfidence: classification.confidence,
      classificationReason: classification.reason,
      relativePath: file.webkitRelativePath || null,
      movementHistory: [],
    };

    logMovement(record, "uploaded", {
      toCategory: finalCategory,
      note: "Intake upload (demo — Google Drive placeholder)",
    });

    if (overrides?.finalCategory && overrides.finalCategory !== classification.suggestedCategory) {
      logMovement(record, "category_override", {
        fromCategory: classification.suggestedCategory,
        toCategory: overrides.finalCategory,
        note: "Manual category selected before upload",
      });
    }

    return record;
  }

  function defaultFiles() {
    const samples = [
      {
        name: "May_2026_Operations_Schedule.pdf",
        size: 245000,
        type: "application/pdf",
        suggested: "Monthly Schedules",
        final: "Monthly Schedules",
        confidence: 0.91,
        status: REVIEW_STATUS.REVIEWED,
        reviewed: true,
        tags: ["may-2026", "schedule"],
      },
      {
        name: "ES_Training_Log_March.xlsx",
        size: 88000,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        suggested: "Emergency Services",
        final: "Emergency Services",
        confidence: 0.87,
        status: REVIEW_STATUS.REVIEWED,
        reviewed: true,
      },
      {
        name: "scan001_unknown.pdf",
        size: 1200000,
        type: "application/pdf",
        suggested: "Miscellaneous / Needs Review",
        final: "Miscellaneous / Needs Review",
        confidence: 0.38,
        status: REVIEW_STATUS.NEEDS_REVIEW,
        reviewed: false,
      },
      {
        name: "Safety_Range_Waiver_May.pdf",
        size: 156000,
        type: "application/pdf",
        suggested: "Safety",
        final: "Operations",
        confidence: 0.89,
        status: REVIEW_STATUS.FLAGGED,
        reviewed: false,
        flagged: true,
        notes: "Misfiled — moved from Safety; verify range documentation.",
        moved: true,
      },
      {
        name: "Cadet_Roster_Spring2026.csv",
        size: 42000,
        type: "text/csv",
        suggested: "Rosters",
        final: "Rosters",
        confidence: 0.9,
        status: REVIEW_STATUS.REVIEWED,
        reviewed: true,
        tags: ["cadet", "roster"],
      },
    ];

    return samples.map((s) => {
      const fake = { name: s.name, size: s.size, type: s.type };
      const rec = createFileRecord(fake, { finalCategory: s.final });
      rec.suggestedCategory = s.suggested;
      rec.classificationConfidence = s.confidence;
      rec.reviewStatus = s.status;
      rec.reviewed = s.reviewed;
      rec.flagged = s.flagged || false;
      rec.notes = s.notes || "";
      rec.tags = s.tags || [];
      rec.googleDriveFileId = "MOCK_GDRIVE_" + rec.id.slice(0, 8);
      rec.supabaseMetadataId = "MOCK_SB_" + rec.id.slice(0, 8);
      if (s.moved) {
        rec.movementHistory.unshift({
          id: uid(),
          action: "moved",
          details: { fromCategory: s.suggested, toCategory: s.final, note: "Officer correction" },
          by: "Maj. T. Owens",
          byUserId: "user-demo-2",
          at: new Date(Date.now() - 86400000 * 2).toISOString(),
          fromCategory: s.suggested,
          toCategory: s.final,
        });
      }
      return rec;
    });
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const data = { files: defaultFiles(), auditLog: [], updatedAt: new Date().toISOString() };
      save(data);
      return data;
    }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data.files)) throw new Error("invalid");
      return data;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      const data = { files: defaultFiles(), auditLog: [], updatedAt: new Date().toISOString() };
      save(data);
      return data;
    }
  }

  function save(data) {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getFile(data, id) {
    return data.files.find((f) => f.id === id);
  }

  function getMetrics(data) {
    const files = data.files;
    const needsReview = files.filter(
      (f) => f.reviewStatus === REVIEW_STATUS.NEEDS_REVIEW && !f.reviewed
    );
    const flagged = files.filter((f) => f.flagged);
    const moved = files.filter((f) =>
      (f.movementHistory || []).some((h) => h.action === "moved" || h.action === "category_override")
    );
    const recent = [...files].sort((a, b) => (a.uploadDate < b.uploadDate ? 1 : -1)).slice(0, 5);
    const totalSize = files.reduce((n, f) => n + (f.fileSize || 0), 0);

    return {
      total: files.length,
      needsReviewCount: needsReview.length,
      flaggedCount: flagged.length,
      movedCount: moved.length,
      recent,
      needsReview,
      totalSize,
    };
  }

  function simulateUpload(file, manualCategory, onProgress, onComplete, onError) {
    let pct = 0;
    const steps = [12, 28, 45, 62, 78, 91, 100];
    let i = 0;

    const tick = () => {
      if (i >= steps.length) {
        try {
          const data = load();
          const overrides = manualCategory ? { finalCategory: manualCategory } : {};
          const record = createFileRecord(file, overrides);
          record.googleDriveFileId = "MOCK_GDRIVE_" + record.id.slice(0, 8);
          record.supabaseMetadataId = "MOCK_SB_" + record.id.slice(0, 8);
          data.files.unshift(record);
          data.auditLog = data.auditLog || [];
          data.auditLog.unshift({
            id: uid(),
            type: "file_upload",
            fileId: record.id,
            by: MOCK_USER.name,
            at: record.uploadDate,
          });
          save(data);
          onComplete(record);
        } catch (err) {
          onError(err.message || "Upload failed");
        }
        return;
      }
      pct = steps[i++];
      onProgress(pct);
      setTimeout(tick, 180 + Math.random() * 120);
    };
    setTimeout(tick, 100);
  }

  function updateFile(data, id, patch) {
    const file = getFile(data, id);
    if (!file) return null;
    const prev = { ...file };

    if (patch.finalCategory && patch.finalCategory !== file.finalCategory) {
      logMovement(file, "moved", {
        fromCategory: file.finalCategory,
        toCategory: patch.finalCategory,
        note: patch.moveNote || "Category changed by officer",
      });
      file.finalCategory = patch.finalCategory;
      file.department = departmentForCategory(patch.finalCategory);
      if (file.reviewStatus === REVIEW_STATUS.NEEDS_REVIEW && patch.finalCategory !== "Miscellaneous / Needs Review") {
        file.reviewStatus = REVIEW_STATUS.PENDING;
      }
    }

    if (patch.fileName && patch.fileName !== file.fileName) {
      logMovement(file, "renamed", {
        fromCategory: file.finalCategory,
        note: `Display name: ${prev.fileName} → ${patch.fileName}`,
      });
      file.fileName = patch.fileName;
    }

    if (patch.tags) {
      file.tags = patch.tags;
      logMovement(file, "tags_updated", { note: "Tags updated: " + patch.tags.join(", ") });
    }

    if (patch.notes !== undefined) file.notes = patch.notes;
    if (patch.flagged !== undefined) {
      file.flagged = patch.flagged;
      file.reviewStatus = patch.flagged ? REVIEW_STATUS.FLAGGED : file.reviewStatus;
      logMovement(file, patch.flagged ? "flagged" : "unflagged", { note: patch.flagged ? "Needs attention" : "Flag cleared" });
    }

    if (patch.reviewed) {
      file.reviewed = true;
      file.reviewStatus = REVIEW_STATUS.REVIEWED;
      logMovement(file, "reviewed", { note: "Marked reviewed by officer" });
    }

    save(data);
    return file;
  }

  function renderStatusBar() {
    const sb = INTEGRATION.supabase;
    const gd = INTEGRATION.googleDrive;
    return `
      <div class="di-status-bar" role="status">
        <span class="di-status-pill ${sb.connected ? "di-status-pill--ok" : "di-status-pill--off"}">
          ${escapeHtml(sb.label)}: ${escapeHtml(sb.status)}
        </span>
        <span class="di-status-pill ${gd.connected ? "di-status-pill--ok" : "di-status-pill--warn"}">
          ${escapeHtml(gd.label)}: ${escapeHtml(gd.status)}
        </span>
        <span class="di-status-pill">Role: ${escapeHtml(MOCK_USER.role)} · ${escapeHtml(MOCK_USER.name)}</span>
      </div>`;
  }

  function renderUploadQueueItem(item) {
    const stateClass =
      item.state === "error"
        ? "di-upload-state--error"
        : item.state === "done"
          ? "di-upload-state--done"
          : "di-upload-state--uploading";
    const typeInfo = detectFileType({ name: item.name, type: item.type, size: item.size });
    const catOptions = CATEGORIES.map(
      (c) => `<option value="${escapeHtml(c)}" ${item.manualCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`
    ).join("");

    const preUpload =
      item.state === "queued"
        ? `<div class="di-pre-upload-row">
            <label>Override category before upload</label>
            <select data-queue-id="${item.id}" data-field="manualCategory">
              <option value="">Use smart suggestion</option>
              ${catOptions}
            </select>
          </div>`
        : "";

    const suggest =
      item.state === "done" && item.record
        ? `<p class="di-upload-meta">Suggested: <strong>${escapeHtml(item.record.suggestedCategory)}</strong> → Filed: <strong>${escapeHtml(item.record.finalCategory)}</strong></p>`
        : "";

    return `
      <div class="di-upload-item" data-queue-id="${item.id}">
        <div class="di-upload-item-head">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <p class="di-upload-meta">${escapeHtml(typeInfo.label)} · ${formatBytes(item.size)}${item.relativePath ? " · " + escapeHtml(item.relativePath) : ""}</p>
          </div>
          <span class="di-upload-state ${stateClass}">${escapeHtml(item.stateLabel)}</span>
        </div>
        <div class="di-progress" aria-hidden="true"><span style="width:${item.progress}%"></span></div>
        ${preUpload}
        ${suggest}
      </div>`;
  }

  function renderFileCard(file, options) {
    const expanded = options?.expanded;
    const cardClass =
      file.flagged || file.reviewStatus === REVIEW_STATUS.FLAGGED
        ? "di-file-card--flagged"
        : file.reviewStatus === REVIEW_STATUS.NEEDS_REVIEW && !file.reviewed
          ? "di-file-card--needs-review"
          : "";
    const icon = (file.fileTypeKind || "file").slice(0, 3).toUpperCase();
    const conf = Math.round((file.classificationConfidence || 0) * 100);
    const tagHtml = (file.tags || []).map((t) => `<span class="di-badge">${escapeHtml(t)}</span>`).join("");
    const history = (file.movementHistory || [])
      .slice(0, 6)
      .map(
        (h) =>
          `<li><strong>${escapeHtml(h.action)}</strong> · ${escapeHtml(h.by)} · ${formatDate(h.at)}${h.fromCategory && h.toCategory ? `<br>${escapeHtml(h.fromCategory)} → ${escapeHtml(h.toCategory)}` : h.details?.note ? "<br>" + escapeHtml(h.details.note) : ""}</li>`
      )
      .join("");

    const catOptions = CATEGORIES.map(
      (c) => `<option value="${escapeHtml(c)}" ${file.finalCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`
    ).join("");

    const detail = expanded
      ? `<div class="di-detail-panel">
          <div><label>Display name</label><input data-file-id="${file.id}" data-field="fileName" value="${escapeHtml(file.fileName)}" /></div>
          <div><label>Final category</label><select data-file-id="${file.id}" data-field="finalCategory">${catOptions}</select></div>
          <div><label>Tags (comma-separated)</label><input data-file-id="${file.id}" data-field="tags" value="${escapeHtml((file.tags || []).join(", "))}" /></div>
          <div><label>Notes</label><textarea data-file-id="${file.id}" data-field="notes" rows="2">${escapeHtml(file.notes || "")}</textarea></div>
          <p class="di-upload-meta">Original: ${escapeHtml(file.originalFileName)} · Suggested: <strong>${escapeHtml(file.suggestedCategory)}</strong> (${conf}% confidence)</p>
          <p class="di-upload-meta">Google Drive ID: <code>${escapeHtml(file.googleDriveFileId || "pending")}</code> · Supabase: <code>${escapeHtml(file.supabaseMetadataId || "pending")}</code></p>
          <h4 style="margin:12px 0 6px;font-size:0.8rem;text-transform:uppercase;color:var(--gold)">Movement history</h4>
          <ul class="di-history">${history || "<li>No movements logged</li>"}</ul>
          <div class="di-file-actions">
            <button type="button" class="ghost-btn btn-sm" data-action="save-file" data-file-id="${file.id}">Save changes</button>
            ${!file.reviewed ? `<button type="button" class="btn-sm" data-action="mark-reviewed" data-file-id="${file.id}">Mark reviewed</button>` : ""}
            <button type="button" class="ghost-btn btn-sm" data-action="toggle-flag" data-file-id="${file.id}">${file.flagged ? "Clear flag" : "Flag attention"}</button>
          </div>
        </div>`
      : "";

    return `
      <article class="di-file-card ${cardClass}" data-file-id="${file.id}">
        <div class="di-file-card-head">
          <div class="di-file-icon">${escapeHtml(icon)}</div>
          <div class="di-file-title">
            <h3>${escapeHtml(file.fileName)}</h3>
            <small>${escapeHtml(file.fileType)} · ${formatBytes(file.fileSize)} · ${formatDate(file.uploadDate)} · ${escapeHtml(file.uploadedBy)}</small>
          </div>
          <button type="button" class="ghost-btn btn-sm" data-action="toggle-detail" data-file-id="${file.id}">${expanded ? "Hide" : "Manage"}</button>
        </div>
        <div class="di-badges">
          <span class="di-badge di-badge--cat">${escapeHtml(file.finalCategory)}</span>
          ${file.suggestedCategory !== file.finalCategory ? `<span class="di-badge di-badge--suggest">Was: ${escapeHtml(file.suggestedCategory)}</span>` : ""}
          ${file.reviewStatus === REVIEW_STATUS.NEEDS_REVIEW && !file.reviewed ? '<span class="di-badge di-badge--warn">Needs review</span>' : ""}
          ${file.reviewed ? '<span class="di-badge di-badge--ok">Reviewed</span>' : ""}
          ${file.flagged ? '<span class="di-badge di-badge--warn">Attention</span>' : ""}
          ${tagHtml}
        </div>
        ${file.notes ? `<p class="di-upload-meta">${escapeHtml(file.notes)}</p>` : ""}
        ${detail}
      </article>`;
  }

  function renderFileList(files, emptyMsg) {
    if (!files.length) {
      return `<div class="di-empty"><h3>Nothing here yet</h3><p>${escapeHtml(emptyMsg)}</p></div>`;
    }
    return `<div class="di-file-grid">${files.map((f) => renderFileCard(f, { expanded: f.id === expandedFileId })).join("")}</div>`;
  }

  function renderDashboardWidgets() {
    const data = load();
    const m = getMetrics(data);

    const recentRoot = document.getElementById("diDashboardRecent");
    const reviewRoot = document.getElementById("diDashboardNeedsReview");
    const storageRoot = document.getElementById("diDashboardStorage");

    if (recentRoot) {
      const list =
        m.recent.length === 0
          ? '<p class="di-upload-meta">No recent filings. Use the File Library to upload squadron documents.</p>'
          : m.recent
              .map(
                (f) =>
                  `<div class="di-dash-list-item"><strong>${escapeHtml(f.fileName)}</strong><span>${escapeHtml(f.finalCategory)} · ${formatDate(f.uploadDate)}</span></div>`
              )
              .join("");
      recentRoot.innerHTML = `
        <div class="di-dash-grid">
          <div><strong>${m.total}</strong><span>Files on record</span></div>
          <div><strong class="di-warn">${m.needsReviewCount}</strong><span>Unfiled</span></div>
          <div><strong>${m.movedCount}</strong><span>Re-filed</span></div>
          <div><strong>${formatBytes(m.totalSize)}</strong><span>Library size</span></div>
        </div>
        <div class="di-dash-list">${list}</div>
        <div class="fr-dash-actions di-dash-actions">
          <a class="btn gold" href="documents.html#upload">File to library</a>
          <a class="btn" href="documents.html#review">Filing queue</a>
        </div>`;
    }

    if (reviewRoot) {
      const items =
        m.needsReview.length === 0
          ? '<p class="di-upload-meta">Filing queue clear — no unfiled documents pending.</p>'
          : m.needsReview
              .slice(0, 4)
              .map(
                (f) =>
                  `<div class="di-dash-list-item"><strong>${escapeHtml(f.fileName)}</strong><span>Suggested ${escapeHtml(f.suggestedCategory)} · ${Math.round((f.classificationConfidence || 0) * 100)}% confidence</span></div>`
              )
              .join("");
      reviewRoot.innerHTML = items;
    }

      if (storageRoot) {
      storageRoot.innerHTML = `
        <div class="di-sync-row">
          <div><span>${escapeHtml(INTEGRATION.googleDrive.label)}</span><span class="di-upload-meta">${escapeHtml(INTEGRATION.googleDrive.status)}</span></div>
          <div><span>${escapeHtml(INTEGRATION.supabase.label)}</span><span class="di-upload-meta">${escapeHtml(INTEGRATION.supabase.status)}</span></div>
        </div>`;
    }
  }

  let uploadQueue = [];
  let activeTab = "upload";
  let expandedFileId = null;
  let searchQuery = "";
  let filterCategory = "";

  function renderModulePage() {
    const statusRoot = document.getElementById("diStatusBar");
    const mainRoot = document.getElementById("diMainPanel");
    const sideRoot = document.getElementById("diSidePanel");
    const queueRoot = document.getElementById("diUploadQueue");
    if (!mainRoot) return;

    const data = load();
    const m = getMetrics(data);

    if (statusRoot) statusRoot.innerHTML = renderStatusBar();

    let files = [...data.files];
    if (filterCategory) files = files.filter((f) => f.finalCategory === filterCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      files = files.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          f.originalFileName.toLowerCase().includes(q) ||
          (f.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    const reviewFiles = data.files.filter(
      (f) => f.reviewStatus === REVIEW_STATUS.NEEDS_REVIEW && !f.reviewed
    );

    const tabs = [
      { id: "upload", label: "File & upload", count: uploadQueue.length },
      { id: "library", label: "File library", count: data.files.length },
      { id: "review", label: "Unfiled queue", count: reviewFiles.length },
    ];

    const tabHtml = tabs
      .map(
        (t) =>
          `<button type="button" class="di-tab ${activeTab === t.id ? "active" : ""}" data-tab="${t.id}">${escapeHtml(t.label)}<span class="di-tab-count">${t.count}</span></button>`
      )
      .join("");

    let panelContent = "";

    if (activeTab === "upload") {
      panelContent = `
        <div class="di-dropzone" id="diDropzone" tabindex="0" role="button" aria-label="Upload files or folders">
          <strong>Drag & drop — file to squadron library</strong>
          <p>Files are routed to the correct Google Drive squadron folder (demo). Metadata and filing history stored in Supabase (demo).</p>
          <div class="di-drop-actions">
            <button type="button" class="ghost-btn" id="diPickFiles">Choose files</button>
            <button type="button" class="ghost-btn" id="diPickFolder">Choose folder</button>
          </div>
          <input type="file" id="diFileInput" multiple hidden />
          <input type="file" id="diFolderInput" webkitdirectory directory multiple hidden />
        </div>
        <div class="di-upload-queue" id="diUploadQueueInner">${uploadQueue.map(renderUploadQueueItem).join("") || '<div class="di-empty"><h3>No files in queue</h3><p>Drop files above or use Choose files / Choose folder.</p></div>'}</div>
        ${uploadQueue.some((q) => q.state === "queued") ? `<button type="button" class="gold-btn" style="margin-top:12px;width:100%" id="diUploadAll">Upload ${uploadQueue.filter((q) => q.state === "queued").length} file(s)</button>` : ""}
        ${!can("upload") ? '<div class="di-error" style="margin-top:12px"><h3>Upload restricted</h3><p>Your role does not include upload permission in this demo.</p></div>' : ""}`;
    } else if (activeTab === "review") {
      panelContent = renderFileList(
        reviewFiles,
        "Documents the system could not confidently file — safety officer or admin reviews and assigns the correct directorate folder."
      );
    } else {
      panelContent = `
        <div class="di-filter-bar">
          <input type="search" id="diSearch" placeholder="Search name or tags…" value="${escapeHtml(searchQuery)}" />
          <select id="diFilterCategory">
            <option value="">All categories</option>
            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${filterCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        ${renderFileList(files, "No files filed yet. Upload from the File & upload tab.")}`;
    }

    mainRoot.innerHTML = `
      <div class="di-tabs" role="tablist">${tabHtml}</div>
      <article class="panel">${panelContent}</article>
      <p class="di-arch-note"><strong>How it works:</strong> Google Drive holds squadron files in permission-aware folders. Supabase holds filing metadata, roles, and audit trail. Officers can re-file misclassified documents — every move is logged.</p>`;

    if (queueRoot) queueRoot.innerHTML = uploadQueue.map(renderUploadQueueItem).join("");

    if (sideRoot) {
      const queuePreview = reviewFiles
        .slice(0, 3)
        .map(
          (f) =>
            `<div class="di-queue-item"><h4>${escapeHtml(f.fileName)}</h4><p>Suggested: ${escapeHtml(f.suggestedCategory)} · ${Math.round((f.classificationConfidence || 0) * 100)}%</p><a class="ghost-btn btn-sm" href="#" data-action="open-review" data-file-id="${f.id}">Review</a></div>`
        )
        .join("");
      sideRoot.innerHTML = `
        <article class="panel">
          <h2>Unfiled queue</h2>
          ${queuePreview || '<div class="di-empty"><p>No items waiting.</p></div>'}
        </article>
        <article class="panel">
          <h2>Filing history</h2>
          <ul class="di-history">
            ${data.files
              .flatMap((f) => (f.movementHistory || []).map((h) => ({ ...h, fileName: f.fileName })))
              .sort((a, b) => (a.at < b.at ? 1 : -1))
              .slice(0, 5)
              .map(
                (h) =>
                  `<li><strong>${escapeHtml(h.fileName)}</strong><br>${escapeHtml(h.action)} by ${escapeHtml(h.by)} · ${formatDate(h.at)}</li>`
              )
              .join("") || "<li>No movements yet</li>"}
          </ul>
        </article>`;
    }

    bindDropzone();
  }

  function startQueuedUpload(item) {
    const manualCat = () => {
      const sel = document.querySelector(`select[data-queue-id="${item.id}"]`);
      return sel?.value || "";
    };

    item.state = "uploading";
    item.stateLabel = "Uploading…";

    simulateUpload(
      item.file,
      manualCat() || null,
      (pct) => {
        item.progress = pct;
        item.stateLabel = pct < 100 ? `Uploading ${pct}%` : "Filing to Drive…";
        renderModulePage();
      },
      (record) => {
        item.state = "done";
        item.stateLabel = "Complete";
        item.progress = 100;
        item.record = record;
        renderModulePage();
        renderDashboardWidgets();
      },
      (msg) => {
        item.state = "error";
        item.stateLabel = msg;
        renderModulePage();
      }
    );
  }

  function processFileList(fileList) {
    if (!can("upload")) {
      alert("Your role does not have upload permission.");
      return;
    }
    const files = Array.from(fileList);
    if (!files.length) return;

    files.forEach((file) => {
      uploadQueue.push({
        id: uid(),
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath: file.webkitRelativePath || null,
        file,
        progress: 0,
        state: "queued",
        stateLabel: "Ready — set category, then upload",
        manualCategory: "",
      });
    });
    activeTab = "upload";
    renderModulePage();
  }

  function uploadAllQueued() {
    const pending = uploadQueue.filter((q) => q.state === "queued");
    if (!pending.length) return;
    pending.forEach(startQueuedUpload);
  }

  async function traverseEntry(entry, path, bucket) {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          file.webkitRelativePath = path + file.name;
          bucket.push(file);
          resolve();
        });
      });
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise((res) => reader.readEntries(res));
      for (const ent of entries) {
        await traverseEntry(ent, path + entry.name + "/", bucket);
      }
    }
  }

  async function handleDataTransfer(dt) {
    const bucket = [];
    const items = dt.items;
    if (items && items.length) {
      for (const item of items) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) await traverseEntry(entry, "", bucket);
        else {
          const f = item.getAsFile();
          if (f) bucket.push(f);
        }
      }
    } else {
      bucket.push(...Array.from(dt.files));
    }
    processFileList(bucket);
  }

  function bindDropzone() {
    const zone = document.getElementById("diDropzone");
    const fileInput = document.getElementById("diFileInput");
    const folderInput = document.getElementById("diFolderInput");
    const pickFiles = document.getElementById("diPickFiles");
    const pickFolder = document.getElementById("diPickFolder");

    if (!zone || zone.dataset.bound) return;
    zone.dataset.bound = "1";

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      handleDataTransfer(e.dataTransfer);
    });
    zone.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      fileInput?.click();
    });

    pickFiles?.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput?.click();
    });
    pickFolder?.addEventListener("click", (e) => {
      e.stopPropagation();
      folderInput?.click();
    });

    document.getElementById("diUploadAll")?.addEventListener("click", uploadAllQueued);

    fileInput?.addEventListener("change", () => {
      processFileList(fileInput.files);
      fileInput.value = "";
    });
    folderInput?.addEventListener("change", () => {
      processFileList(folderInput.files);
      folderInput.value = "";
    });
  }

  function bindModuleEvents() {
    if (document.body.dataset.diBound) return;
    document.body.dataset.diBound = "1";

    document.body.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        activeTab = tab.dataset.tab;
        renderModulePage();
        return;
      }

      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const fileId = btn.dataset.fileId;

      if (action === "toggle-detail" && fileId) {
        expandedFileId = expandedFileId === fileId ? null : fileId;
        renderModulePage();
        return;
      }

      if (action === "open-review" && fileId) {
        e.preventDefault();
        activeTab = "review";
        expandedFileId = fileId;
        renderModulePage();
        return;
      }

      if (action === "save-file" && fileId) {
        const data = load();
        const card = btn.closest(".di-file-card");
        const fileName = card.querySelector('[data-field="fileName"]')?.value?.trim();
        const finalCategory = card.querySelector('[data-field="finalCategory"]')?.value;
        const tagsRaw = card.querySelector('[data-field="tags"]')?.value || "";
        const notes = card.querySelector('[data-field="notes"]')?.value || "";
        const tags = tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (!can("move")) {
          alert("Your role cannot move or edit filings.");
          return;
        }
        updateFile(data, fileId, { fileName, finalCategory, tags, notes });
        renderModulePage();
        renderDashboardWidgets();
        return;
      }

      if (action === "mark-reviewed" && fileId) {
        if (!can("review")) {
          alert("Review permission required.");
          return;
        }
        updateFile(load(), fileId, { reviewed: true });
        renderModulePage();
        renderDashboardWidgets();
        return;
      }

      if (action === "toggle-flag" && fileId) {
        const f = getFile(load(), fileId);
        if (f) updateFile(load(), fileId, { flagged: !f.flagged });
        renderModulePage();
        renderDashboardWidgets();
      }
    });

    document.body.addEventListener("change", (e) => {
      const sel = e.target.closest('select[data-field="manualCategory"]');
      if (sel) {
        const item = uploadQueue.find((q) => q.id === sel.dataset.queueId);
        if (item) item.manualCategory = sel.value;
      }
    });

    document.body.addEventListener("input", (e) => {
      if (e.target.id === "diSearch") {
        searchQuery = e.target.value;
        renderModulePage();
      }
    });

    document.body.addEventListener("change", (e) => {
      if (e.target.id === "diFilterCategory") {
        filterCategory = e.target.value;
        renderModulePage();
      }
    });
  }

  function init() {
    if (location.hash === "#upload") activeTab = "upload";
    if (location.hash === "#review") activeTab = "review";

    renderDashboardWidgets();
    renderModulePage();
    bindModuleEvents();
  }

  global.SMTN170DocumentIntake = {
    STORAGE_KEY,
    CATEGORIES,
    ROLES,
    INTEGRATION,
    load,
    save,
    classifyFile,
    createFileRecord,
    getMetrics,
    updateFile,
    renderDashboardWidgets,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
