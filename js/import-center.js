/**
 * @deprecated V1 — upload/import removed. Use js/resource-links.js for Files & Resources.
 * TN-170 Import Center — smart import preview and confirm.
 */
(function initImportCenter(global) {
  let state = { jobs: [], pending: null, busy: false, flashMessage: null };

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function pct(n) {
    if (n == null || isNaN(n)) return "—";
    return `${Math.round(Number(n) * 100)}%`;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  function renderDraftRows(drafts, type) {
    if (!drafts?.length) return "<p class=\"page-intro\">No structured rows extracted yet.</p>";
    if (type === "org_positions") {
      return `<ul class="import-draft-list">${drafts
        .map(
          (d, i) =>
            `<li><strong>${escapeHtml(d.title)}</strong> · ${escapeHtml(d.department)} · ${escapeHtml(d.assigned_member_name || "Vacant")} <small>(confidence ${pct(d.confidence)})</small></li>`
        )
        .join("")}</ul>`;
    }
    if (type === "meetings") {
      return `<ul class="import-draft-list import-meeting-draft-list">${drafts
        .map(
          (d, i) =>
            `<li class="import-meeting-draft" data-draft-idx="${i}">
              <strong>${escapeHtml(d.title)}</strong>
              · ${escapeHtml(d.meeting_date || "date TBD")}
              · ${escapeHtml(d.start_time || d.meeting_time || "1900")}–${escapeHtml(d.end_time || "2100")}
              · Uniform: ${escapeHtml(d.uniform || "—")}
              ${d.opening ? `<br><small>Opening: ${escapeHtml(d.opening)}</small>` : ""}
            </li>`
        )
        .join("")}</ul>`;
    }
    if (type === "portal_tasks") {
      return `<ul class="import-draft-list">${drafts
        .map((d) => `<li><strong>${escapeHtml(d.title)}</strong> · due ${escapeHtml(d.due_date || "—")} · ${escapeHtml(d.status)}</li>`)
        .join("")}</ul>`;
    }
    if (type === "flight_reviews") {
      return `<ul class="import-draft-list">${drafts
        .map(
          (d) =>
            `<li><strong>${escapeHtml(d.member_name || d.department)}</strong> · ${escapeHtml(d.status)} · ${escapeHtml(d.review_date || "")}</li>`
        )
        .join("")}</ul>`;
    }
    if (type === "inspection_items") {
      return `<ul class="import-draft-list">${drafts
        .map((d) => `<li><strong>${escapeHtml(d.title)}</strong> · ${escapeHtml(d.work_unit)}</li>`)
        .join("")}</ul>`;
    }
    if (type === "roster_reference") {
      return `<ul class="import-draft-list">${drafts
        .map((d) => `<li>${escapeHtml(d.name)} · ${escapeHtml(d.rank)} · ${escapeHtml(d.cap_id || "")}</li>`)
        .join("")}</ul>`;
    }
    return `<pre class="import-extract-preview">${escapeHtml(JSON.stringify(drafts.slice(0, 8), null, 2))}</pre>`;
  }

  function renderPreview() {
    const r = state.pending;
    if (!r) return "";
    const meta = r.importMeta || global.SMTN170FileIngestion?.IMPORT_TYPES?.[r.detectedType];
    const isMeetingSchedule = r.detectedType === "meeting_schedule" && r.drafts?.length;
    const typeOpts = global.SMTN170FileIngestion?.getTypeOptions?.() || [];
    const opts = typeOpts
      .map(
        (o) =>
          `<option value="${escapeHtml(o.id)}" ${r.detectedType === o.id ? "selected" : ""}>${escapeHtml(o.label)} → ${escapeHtml(o.target)}</option>`
      )
      .join("");

    const extractSnippet = r.extractedText
      ? `<details class="import-extract-details"><summary>Extracted text (preview)</summary><pre class="import-extract-preview">${escapeHtml(r.extractedText.slice(0, 4000))}${r.extractedText.length > 4000 ? "\n…" : ""}</pre></details>`
      : r.needsOcr
        ? `<p class="page-intro import-ocr-notice">This file was uploaded and indexed. OCR is required before it can be read automatically.</p>`
        : "";

    const title = isMeetingSchedule ? "Review imported meeting schedule" : "Smart import preview";
    const actions = isMeetingSchedule
      ? `<div class="import-preview-actions">
          <button type="button" class="btn-gold" id="importApproveAllBtn" ${state.busy ? "disabled" : ""}>Approve all</button>
          <button type="button" class="btn-outline" id="importEditBtn">Edit</button>
          <button type="button" class="btn-outline" id="importDiscardBtn">Discard</button>
        </div>`
      : `<div class="import-preview-actions">
          <button type="button" class="btn-gold" id="importConfirmBtn" ${state.busy ? "disabled" : ""}>Confirm import</button>
          <button type="button" class="btn-outline" id="importDismissBtn">Dismiss preview</button>
        </div>`;

    const editPanel = isMeetingSchedule
      ? `<div id="importMeetingEditPanel" class="import-meeting-edit-panel" hidden>
          <p class="page-intro">Adjust draft titles, dates, or uniforms before approving.</p>
          ${(r.drafts || [])
            .map(
              (d, i) => `<div class="import-meeting-edit-row" data-edit-idx="${i}">
                <label>Title <input type="text" data-edit-field="title" data-edit-idx="${i}" value="${escapeHtml(d.title)}" /></label>
                <label>Date <input type="date" data-edit-field="meeting_date" data-edit-idx="${i}" value="${escapeHtml(d.meeting_date || "")}" /></label>
                <label>Uniform <input type="text" data-edit-field="uniform" data-edit-idx="${i}" value="${escapeHtml(d.uniform || "")}" /></label>
              </div>`
            )
            .join("")}
          <button type="button" class="btn-outline btn-sm" id="importEditDoneBtn">Done editing</button>
        </div>`
      : "";

    return `
      <section class="ingest-review-panel import-preview-panel card-info" id="importPreviewPanel">
        <h3 class="card-info-title">${escapeHtml(title)}</h3>
        <p class="page-intro">${escapeHtml(r.message || "")}</p>
        <dl class="import-meta-grid">
          <div><dt>Source file</dt><dd>${escapeHtml(r.fileRecord?.file_name || r.fileRecord?.name || "—")}</dd></div>
          <div><dt>Detected type</dt><dd>${escapeHtml(meta?.label || r.detectedType)}</dd></div>
          <div><dt>Confidence</dt><dd>${pct(r.confidence)} ${r.lowConfidence ? "(low — needs review)" : ""}</dd></div>
          <div><dt>Target</dt><dd>${escapeHtml(meta?.target || "—")}</dd></div>
          <div><dt>Records found</dt><dd>${r.drafts?.length || 0}</dd></div>
        </dl>
        ${isMeetingSchedule ? "" : `<label for="importTypeOverride">Change destination if detection looks wrong</label>
        <select id="importTypeOverride" class="import-type-select">${opts}</select>`}
        ${renderDraftRows(r.drafts, r.type)}
        ${editPanel}
        ${extractSnippet}
        ${actions}
        <p id="importPreviewError" class="import-error" hidden role="alert"></p>
      </section>`;
  }

  function renderJobs() {
    if (!state.jobs.length) {
      return `<p class="page-intro">No import jobs yet. Upload a squadron document above to start a smart import.</p>`;
    }
    return `<table class="import-jobs-table">
      <thead><tr><th>File</th><th>Detected</th><th>Confidence</th><th>Status</th><th>When</th></tr></thead>
      <tbody>${state.jobs
        .map((j) => {
          const name = j.uploaded_files?.file_name || j.uploaded_files?.name || "—";
          const label = global.SMTN170FileIngestion?.IMPORT_TYPES?.[j.detected_type]?.label || j.detected_type;
          return `<tr>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(label)}</td>
            <td>${pct(j.confidence)}</td>
            <td>${escapeHtml(j.status)}</td>
            <td>${escapeHtml(formatWhen(j.created_at))}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table>`;
  }

  function render() {
    const root = document.getElementById("importCenterRoot");
    if (!root) return;
    root.innerHTML = `
      <section class="card-info import-center-hero">
        <h2 class="card-info-title">Import Center</h2>
        <p class="page-intro">Upload existing squadron materials (schedules, org charts, trackers, checklists, spreadsheets, PDFs). The portal will store the source file, extract readable content when possible, detect the document type, and let you review before updating Calendar, Meetings, Org Chart, Tasks, Flight Reviews, or Inspection Prep.</p>
        <p class="page-intro import-disclaimer">Smart import is best-effort — always review extracted records before confirming. Low confidence imports are marked <strong>needs review</strong>.</p>
      </section>
      <div class="import-upload-row">
        <div class="fl-dropzone" id="icDropzone">
          <p><strong>Upload for smart import</strong></p>
          <small>PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, WEBP</small>
          <input type="file" id="icFileInput" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp" />
        </div>
      </div>
      <div id="importPreviewHost">
        ${state.flashMessage ? `<p class="import-success" role="status">${escapeHtml(state.flashMessage)}</p>` : ""}
        ${renderPreview()}
      </div>
      <section class="card-info">
        <h3 class="card-info-title">Recent import jobs</h3>
        ${renderJobs()}
      </section>`;

    bindEvents();
  }

  function bindEvents() {
    const dz = document.getElementById("icDropzone");
    const input = document.getElementById("icFileInput");
    dz?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      Array.from(input.files || []).forEach((f) => handleUpload(f));
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) => {
      dz?.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("fl-dropzone--over");
      });
    });
    dz?.addEventListener("dragleave", () => dz?.classList.remove("fl-dropzone--over"));
    dz?.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("fl-dropzone--over");
      Array.from(e.dataTransfer?.files || []).forEach((f) => handleUpload(f));
    });

    document.getElementById("importConfirmBtn")?.addEventListener("click", handleConfirm);
    document.getElementById("importApproveAllBtn")?.addEventListener("click", handleConfirm);
    document.getElementById("importDismissBtn")?.addEventListener("click", () => {
      state.pending = null;
      render();
    });
    document.getElementById("importDiscardBtn")?.addEventListener("click", () => {
      state.pending = null;
      render();
    });
    document.getElementById("importEditBtn")?.addEventListener("click", () => {
      const panel = document.getElementById("importMeetingEditPanel");
      if (panel) panel.hidden = !panel.hidden;
    });
    document.getElementById("importEditDoneBtn")?.addEventListener("click", () => {
      const panel = document.getElementById("importMeetingEditPanel");
      if (panel) panel.hidden = true;
    });
    document.getElementById("importPreviewPanel")?.addEventListener("input", (e) => {
      const input = e.target.closest("[data-edit-field]");
      if (!input || !state.pending?.drafts) return;
      const idx = parseInt(input.dataset.editIdx, 10);
      const field = input.dataset.editField;
      if (state.pending.drafts[idx] && field) {
        state.pending.drafts[idx][field] = input.value;
      }
    });
    document.getElementById("importTypeOverride")?.addEventListener("change", handleTypeChange);
  }

  async function handleTypeChange(e) {
    const r = state.pending;
    if (!r?.fileRecord) return;
    const newType = e.target.value;
    const errEl = document.getElementById("importPreviewError");
    if (errEl) errEl.hidden = true;
    state.busy = true;
    render();
    try {
      const processorData = await global.SMTN170FileIngestion.invokeImportProcessor({
        uploaded_file_id: r.fileRecord.id,
        file_path: r.fileRecord.file_path,
        file_name: r.fileRecord.file_name || r.fileRecord.name,
        requested_target: newType,
      });
      const remapped = global.SMTN170FileIngestion.mapProcessorResponse(processorData, r.fileRecord);
      state.pending = remapped;
      state.pending.message = `Destination changed to ${remapped.importMeta?.label || newType}. ${remapped.drafts.length} record(s) shown — review before confirming.`;
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || "Import processor failed";
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function handleUpload(file) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const result = await global.SMTN170FileIngestion.uploadAndIngest(file, {});
      state.pending = result;
      await refreshJobs();
      global.SMTN170FileLibrary?.init?.();
    } catch (err) {
      state.pending = {
        ok: false,
        message: err.message || "Upload failed",
        needsReview: true,
        drafts: [],
        detectedType: "needs_review",
        confidence: 0,
      };
      const errEl = document.getElementById("importPreviewError");
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || "Upload failed";
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function handleConfirm() {
    const r = state.pending;
    if (!r || state.busy) return;
    const errEl = document.getElementById("importPreviewError");
    const override = document.getElementById("importTypeOverride")?.value;
    state.busy = true;
    state.flashMessage = null;
    if (errEl) errEl.hidden = true;
    try {
      if (!r.drafts?.length) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent =
            "No structured records were extracted. The file was uploaded and indexed, but nothing is ready to import.";
        }
        return;
      }
      const out = await global.SMTN170FileIngestion.confirmImport(r, override);
      state.pending = null;
      state.flashMessage = out.message || "Import complete.";
      await refreshJobs();
      global.SMTN170Shell?.renderDashboardV2?.();
      global.dispatchEvent(new CustomEvent("smtn170:import-complete", { detail: out }));
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || "Confirm import failed";
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshJobs() {
    state.jobs = await global.SMTN170FileIngestion.listImportJobs(15);
  }

  async function init() {
    await global.SMTN170Firebase?.whenReady?.();
    await global.SMTN170Auth?.syncSessionFromFirebase?.();
    await refreshJobs();
    const last = global.SMTN170FileIngestion?.getLastResult?.();
    if (last?.needsReview) state.pending = last;
    render();
  }

  global.SMTN170ImportCenter = { init, render, setPending: (r) => { state.pending = r; render(); } };

  global.addEventListener("smtn170:file-ingested", (e) => {
    if (document.getElementById("importCenterRoot")) {
      state.pending = e.detail;
      render();
    }
  });

  if (document.getElementById("importCenterRoot")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(window);
