/**
 * TN-170 Organization Chart builder
 * --------------------------------------------------------
 * Guided report builder mounted on orgchart.html. Three modes:
 *   - Builder       : edit header + commander + staff + cadet branch + custom
 *   - Preview       : shared renderer (matches print exactly)
 *   - Saved Reports : list of orgCharts docs (Open, Clone, Preview, Print)
 *
 * Persistence:
 *   - Autosave draft to localStorage (debounced 1s)
 *   - Explicit Save → Firestore `orgCharts` collection
 *   - "Reset to TN-170 Default Structure" prefills layout so users only fill names
 *
 * Source of truth for rendering: SMTN170ReportRenderers.renderOrgChartPrintView.
 */
(function initOrgChartBuilder(global) {
  const R = () => global.SMTN170ReportRenderers;
  const LOCAL_KEY = "smtn170_orgChartDraft_v1";

  const PLACEMENTS = [
    { value: "commander", label: "Commander (top)" },
    { value: "staff_row", label: "Staff row" },
    { value: "cadet_branch", label: "Cadet Programs branch" },
    { value: "custom", label: "Custom (additional)" },
  ];

  const STATUSES = [
    { value: "filled", label: "Filled" },
    { value: "vacant", label: "Vacant" },
    { value: "acting", label: "Acting" },
  ];

  const TABS = [
    { id: "builder", label: "Builder" },
    { id: "preview", label: "Preview" },
    { id: "saved", label: "Saved Reports" },
  ];

  const state = {
    tab: "builder",
    chart: null,
    saving: false,
    savedList: [],
    savedLoading: false,
    saveStatus: "idle",
    warnings: [],
    notice: "",
  };

  let autosaveTimer = null;
  let unsubscribe = null;

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function debouncedAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state.chart));
        state.saveStatus = "local";
        updateStatusIndicator();
      } catch (err) {
        console.warn("[orgchart-builder] autosave failed", err);
      }
    }, 1000);
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.positions) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  }

  function markDirty() {
    state.saveStatus = "dirty";
    state.warnings = R()?.validateOrgChart?.(state.chart) || [];
    updateStatusIndicator();
    refreshPreviewIfActive();
    debouncedAutosave();
  }

  function updateStatusIndicator() {
    const el = document.getElementById("ocbStatus");
    if (!el) return;
    if (state.saveStatus === "saved") {
      el.textContent = "Saved";
      el.className = "ocb-status ocb-status--saved";
    } else if (state.saveStatus === "local") {
      el.textContent = "Draft saved locally";
      el.className = "ocb-status ocb-status--local";
    } else if (state.saveStatus === "saving") {
      el.textContent = "Saving…";
      el.className = "ocb-status ocb-status--saving";
    } else {
      el.textContent = "Unsaved changes";
      el.className = "ocb-status ocb-status--dirty";
    }
  }

  function refreshPreviewIfActive() {
    if (state.tab !== "preview") return;
    const host = document.getElementById("ocbPreviewHost");
    if (host) host.innerHTML = R().renderOrgChartPrintView(state.chart);
  }

  function getActorName() {
    return global.SMTN170Auth?.actorDisplay?.() || "Member";
  }

  function getActorId() {
    return global.SMTN170Auth?.actorId?.() || null;
  }

  function newPosition(overrides) {
    return {
      id: R().uid("pos"),
      memberName: "",
      memberUid: null,
      title: "",
      department: "",
      reportsTo: null,
      placement: "custom",
      sortOrder: 100,
      status: "vacant",
      notes: "",
      ...(overrides || {}),
    };
  }

  function resetToDefault() {
    state.chart = R().defaultOrgChart();
    state.chart.createdBy = getActorId();
    state.chart.updatedBy = getActorId();
    state.notice = "Reset to TN-170 default structure — fill in names to complete.";
    markDirty();
    render();
  }

  async function loadSavedList() {
    state.savedLoading = true;
    const orgCharts = global.SMTN170FirebaseData?.orgCharts?.();
    if (!orgCharts) {
      state.savedLoading = false;
      state.savedList = [];
      return;
    }
    try {
      const { data, error } = await orgCharts.list({
        order: { field: "updatedAt", asc: false },
        limit: 50,
      });
      if (error) {
        console.warn("[orgchart-builder] list failed", error);
        state.savedList = [];
      } else {
        state.savedList = data || [];
      }
    } catch (err) {
      console.warn("[orgchart-builder] list crash", err);
      state.savedList = [];
    } finally {
      state.savedLoading = false;
    }
  }

  async function loadSavedChart(id) {
    const orgCharts = global.SMTN170FirebaseData?.orgCharts?.();
    if (!orgCharts) return;
    const { data, error } = await orgCharts.get(id);
    if (error || !data) {
      alert("Could not open this org chart.");
      return;
    }
    state.chart = normalizeLoaded(data);
    state.tab = "builder";
    state.saveStatus = "saved";
    state.notice = `Opened "${state.chart.title || "(untitled)"}".`;
    render();
  }

  function normalizeLoaded(data) {
    const def = R().defaultOrgChart();
    const merged = { ...def, ...data };
    merged.positions = R()
      .safeArray(data?.positions)
      .map((p) => ({ ...newPosition(), ...p }));
    return merged;
  }

  async function cloneSaved(id) {
    const orgCharts = global.SMTN170FirebaseData?.orgCharts?.();
    if (!orgCharts) return;
    const { data, error } = await orgCharts.get(id);
    if (error || !data) {
      alert("Could not clone this org chart.");
      return;
    }
    const fresh = normalizeLoaded(data);
    fresh.id = R().uid("oc");
    fresh.title = (fresh.title || "Table of Organization") + " (copy)";
    fresh.status = "draft";
    fresh.createdAt = null;
    fresh.updatedAt = null;
    fresh.createdBy = getActorId();
    fresh.effectiveDate = new Date().toISOString().slice(0, 10);
    state.chart = fresh;
    state.tab = "builder";
    state.notice = "Cloned to a new draft.";
    markDirty();
    render();
  }

  async function saveCurrent() {
    if (!state.chart) return;
    state.saving = true;
    state.saveStatus = "saving";
    updateStatusIndicator();
    const orgCharts = global.SMTN170FirebaseData?.orgCharts?.();
    if (!orgCharts) {
      alert(
        "Firestore is not available. Draft saved locally — connect Firebase to save to the squadron workspace."
      );
      state.saving = false;
      state.saveStatus = "local";
      updateStatusIndicator();
      return;
    }
    const payload = {
      ...state.chart,
      updatedAt: new Date().toISOString(),
      updatedBy: getActorId(),
      updatedByName: getActorName(),
    };
    if (!payload.createdBy) payload.createdBy = getActorId();
    const { data, error } = await orgCharts.save(payload);
    state.saving = false;
    if (error) {
      console.warn("[orgchart-builder] save failed", error);
      state.saveStatus = "dirty";
      updateStatusIndicator();
      alert(
        "Could not save to Firestore: " +
          (error.message || error) +
          "\nDraft was kept locally. (See report notes about Firestore rules.)"
      );
      return;
    }
    state.chart = normalizeLoaded(data);
    clearDraft();
    state.saveStatus = "saved";
    state.notice = `Saved "${state.chart.title || "Org Chart"}".`;
    updateStatusIndicator();
    loadSavedList().then(() => {
      if (state.tab === "saved") render();
    });
    render();
  }

  function setStatus(positionId, status) {
    const pos = state.chart.positions.find((p) => p.id === positionId);
    if (!pos) return;
    pos.status = status;
    if (status === "vacant") pos.memberName = "";
    markDirty();
  }

  function setField(positionId, field, value) {
    const pos = state.chart.positions.find((p) => p.id === positionId);
    if (!pos) return;
    pos[field] = value;
    if (field === "memberName" && value && pos.status === "vacant") {
      pos.status = "filled";
    }
    markDirty();
  }

  function setHeader(field, value) {
    state.chart[field] = value;
    markDirty();
  }

  function addPosition(placement) {
    const newPos = newPosition({ placement });
    if (placement === "staff_row" || placement === "cadet_branch") {
      const commander = R().findCommander(state.chart.positions);
      const dc = state.chart.positions.find(
        (p) => p.placement === "staff_row" && /deputy commander for cadets/i.test(p.title || "")
      );
      newPos.reportsTo = placement === "cadet_branch" ? dc?.id || null : commander?.id || null;
    }
    state.chart.positions.push(newPos);
    markDirty();
    render();
  }

  function removePosition(id) {
    if (!confirm("Remove this position from the report?")) return;
    state.chart.positions = state.chart.positions.filter((p) => p.id !== id);
    markDirty();
    render();
  }

  function movePosition(id, dir) {
    const positions = state.chart.positions;
    const idx = positions.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const target = positions[idx];
    const peers = positions.filter((p) => p.placement === target.placement);
    const peerIdx = peers.findIndex((p) => p.id === id);
    const swap = peers[peerIdx + dir];
    if (!swap) return;
    const a = target.sortOrder ?? peerIdx;
    const b = swap.sortOrder ?? peerIdx + dir;
    target.sortOrder = b;
    swap.sortOrder = a;
    markDirty();
    render();
  }

  function renderTabs() {
    return `
      <nav class="ocb-tabs" role="tablist" aria-label="Org chart builder tabs">
        ${TABS.map(
          (t) => `
          <button type="button" role="tab" aria-selected="${state.tab === t.id}" class="ocb-tab ${
            state.tab === t.id ? "ocb-tab--active" : ""
          }" data-ocb-tab="${t.id}">${escapeHtml(t.label)}</button>`
        ).join("")}
      </nav>`;
  }

  function renderHeaderEditor() {
    const c = state.chart;
    return `
      <section class="card-info ocb-section">
        <h3 class="card-info-title">Report header</h3>
        <label for="ocbSquadron">Squadron name</label>
        <input id="ocbSquadron" data-ocb-header="squadronName" value="${escapeAttr(c.squadronName || "")}" />
        <label for="ocbUnit">Unit number</label>
        <input id="ocbUnit" data-ocb-header="unitNumber" value="${escapeAttr(c.unitNumber || "")}" />
        <label for="ocbTitle">Report title</label>
        <input id="ocbTitle" data-ocb-header="title" value="${escapeAttr(c.title || "")}" />
        <label for="ocbEff">Effective date</label>
        <input id="ocbEff" type="date" data-ocb-header="effectiveDate" value="${escapeAttr(
          c.effectiveDate || ""
        )}" />
        <label for="ocbReportStatus">Status</label>
        <select id="ocbReportStatus" data-ocb-header="status">
          <option value="draft" ${c.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="final" ${c.status === "final" ? "selected" : ""}>Final</option>
        </select>
      </section>`;
  }

  function renderPositionRow(pos, opts) {
    const placement = pos.placement;
    const placementOpts = PLACEMENTS.map(
      (p) =>
        `<option value="${p.value}" ${pos.placement === p.value ? "selected" : ""}>${escapeHtml(
          p.label
        )}</option>`
    ).join("");
    const statusOpts = STATUSES.map(
      (s) =>
        `<option value="${s.value}" ${pos.status === s.value ? "selected" : ""}>${escapeHtml(
          s.label
        )}</option>`
    ).join("");

    const reportsToOpts =
      placement === "custom"
        ? `<option value="">— Reports to —</option>` +
          state.chart.positions
            .filter((p) => p.id !== pos.id)
            .map(
              (p) =>
                `<option value="${escapeAttr(p.id)}" ${
                  pos.reportsTo === p.id ? "selected" : ""
                }>${escapeHtml(p.title || "(untitled)")}</option>`
            )
            .join("")
        : "";

    return `
      <article class="ocb-row" data-pos-id="${escapeAttr(pos.id)}">
        <div class="ocb-row-head">
          <div class="ocb-row-handle" aria-hidden="true">⋮⋮</div>
          <div class="ocb-row-grow">
            <label class="ocb-mini">Title</label>
            <input data-ocb-field="title" value="${escapeAttr(pos.title || "")}" placeholder="${escapeAttr(
              opts?.titlePlaceholder || ""
            )}" />
          </div>
          <div class="ocb-row-actions">
            <button type="button" class="ocb-ghost" data-ocb-action="up">▲</button>
            <button type="button" class="ocb-ghost" data-ocb-action="down">▼</button>
            <button type="button" class="ocb-ghost ocb-ghost--danger" data-ocb-action="remove">Remove</button>
          </div>
        </div>
        <div class="ocb-row-grid">
          <div>
            <label class="ocb-mini">Member name</label>
            <input data-ocb-field="memberName" value="${escapeAttr(pos.memberName || "")}" placeholder="Rank · Name" />
          </div>
          <div>
            <label class="ocb-mini">Department</label>
            <input data-ocb-field="department" value="${escapeAttr(pos.department || "")}" />
          </div>
          <div>
            <label class="ocb-mini">Status</label>
            <select data-ocb-field="status">${statusOpts}</select>
          </div>
          <div>
            <label class="ocb-mini">Placement</label>
            <select data-ocb-field="placement">${placementOpts}</select>
          </div>
          ${
            placement === "custom"
              ? `<div>
                  <label class="ocb-mini">Reports to</label>
                  <select data-ocb-field="reportsTo">${reportsToOpts}</select>
                </div>`
              : ""
          }
          <div class="ocb-row-notes">
            <label class="ocb-mini">Notes (optional)</label>
            <input data-ocb-field="notes" value="${escapeAttr(pos.notes || "")}" placeholder="Acting, dual-hat, recruiting…" />
          </div>
        </div>
      </article>`;
  }

  function renderSection(title, placement, opts) {
    const positions = R()
      .findByPlacement(state.chart.positions, placement);
    const rows = positions.map((p) => renderPositionRow(p, opts)).join("");
    return `
      <section class="card-info ocb-section">
        <header class="ocb-section-head">
          <h3 class="card-info-title">${escapeHtml(title)}</h3>
          <button type="button" class="btn-outline" data-ocb-add="${placement}">+ Add ${
            opts?.itemLabel || "position"
          }</button>
        </header>
        ${rows || `<p class="page-intro">No positions yet — click "Add ${opts?.itemLabel || "position"}".</p>`}
      </section>`;
  }

  function renderBuilderTab() {
    const warnings = state.warnings;
    return `
      <div class="ocb-builder">
        ${
          warnings.length
            ? `<div class="card-warning ocb-warnings"><strong>Heads up:</strong><ul>${warnings
                .map((w) => `<li>${escapeHtml(w)}</li>`)
                .join("")}</ul></div>`
            : ""
        }
        ${renderHeaderEditor()}
        ${renderSection("Commander", "commander", { titlePlaceholder: "Commander", itemLabel: "commander" })}
        ${renderSection("Primary staff row", "staff_row", {
          titlePlaceholder: "e.g. Safety",
          itemLabel: "staff position",
        })}
        ${renderSection("Cadet Programs branch", "cadet_branch", {
          titlePlaceholder: "e.g. Aerospace Education",
          itemLabel: "cadet position",
        })}
        ${renderSection("Custom positions", "custom", {
          titlePlaceholder: "e.g. Chaplain",
          itemLabel: "custom position",
        })}
      </div>`;
  }

  function renderPreviewTab() {
    return `
      <div class="ocb-preview-wrap">
        <p class="page-intro">This is the exact layout that will print and save as PDF.</p>
        <div class="print-page ocb-preview-page" id="ocbPreviewHost">${R().renderOrgChartPrintView(
          state.chart
        )}</div>
      </div>`;
  }

  function renderSavedTab() {
    if (state.savedLoading) {
      return `<p class="page-intro">Loading saved reports…</p>`;
    }
    if (!state.savedList.length) {
      return `<p class="page-intro">No saved org charts yet. Build one in the <strong>Builder</strong> tab and click <strong>Save</strong>.</p>`;
    }
    const rows = state.savedList
      .map(
        (doc) => `
        <tr>
          <td>${escapeHtml(doc.title || "(untitled)")}</td>
          <td>${escapeHtml(doc.effectiveDate || "—")}</td>
          <td>${escapeHtml(doc.status === "final" ? "Final" : "Draft")}</td>
          <td>${escapeHtml(formatWhen(doc.updatedAt))}</td>
          <td>
            <button type="button" class="btn-outline" data-ocb-saved="open" data-ocb-id="${escapeAttr(
              doc.id
            )}">Open</button>
            <button type="button" class="btn-outline" data-ocb-saved="clone" data-ocb-id="${escapeAttr(
              doc.id
            )}">Clone</button>
            <button type="button" class="btn-outline" data-ocb-saved="preview" data-ocb-id="${escapeAttr(
              doc.id
            )}">Preview</button>
            <button type="button" class="btn-outline" data-ocb-saved="print" data-ocb-id="${escapeAttr(
              doc.id
            )}">Print</button>
          </td>
        </tr>`
      )
      .join("");
    return `
      <div class="ocb-saved">
        <table class="admin-table ocb-saved-table">
          <thead><tr><th>Title</th><th>Effective</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function render() {
    const root = document.getElementById("orgChartApp");
    if (!root) return;
    let content = "";
    if (state.tab === "builder") content = renderBuilderTab();
    else if (state.tab === "preview") content = renderPreviewTab();
    else content = renderSavedTab();

    root.innerHTML = `
      <header class="org-hero card-info ocb-hero">
        <div class="org-hero-text">
          <p class="org-hero-eyebrow">Squadron report builder</p>
          <h2 class="org-hero-title">Organization Chart</h2>
          <p class="org-hero-sub">Build the TN-170 Table of Organization — the Preview tab matches the printed report exactly.</p>
        </div>
        <div class="org-hero-actions ocb-actions">
          <span id="ocbStatus" class="ocb-status ocb-status--idle">—</span>
          <button type="button" class="btn-gold btn-lg" data-ocb-cmd="save">Save Org Chart</button>
          <button type="button" class="btn-outline btn-lg" data-ocb-cmd="reset">Reset to TN-170 Default Structure</button>
          <button type="button" class="btn-outline btn-lg" data-ocb-cmd="preview">Preview Print Layout</button>
          <button type="button" class="btn-outline btn-lg" data-ocb-cmd="print">Print / Save as PDF</button>
        </div>
      </header>
      ${state.notice ? `<div class="card-info ocb-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}
      ${renderTabs()}
      <div class="ocb-tabpanel" role="tabpanel">${content}</div>`;

    bindEvents(root);
    updateStatusIndicator();
  }

  function bindEvents(root) {
    if (root.dataset.ocbBound === "1") return;
    root.dataset.ocbBound = "1";

    root.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-ocb-tab]");
      if (tab) {
        state.tab = tab.dataset.ocbTab;
        if (state.tab === "saved") loadSavedList().then(render);
        else render();
        return;
      }
      const cmd = e.target.closest("[data-ocb-cmd]");
      if (cmd) {
        const c = cmd.dataset.ocbCmd;
        if (c === "save") saveCurrent();
        else if (c === "reset") {
          if (
            state.chart?.positions?.length &&
            !confirm("Reset and replace the current draft with the TN-170 default layout?")
          )
            return;
          resetToDefault();
        } else if (c === "preview") {
          state.tab = "preview";
          render();
        } else if (c === "print") {
          openPrintWindow();
        }
        return;
      }
      const add = e.target.closest("[data-ocb-add]");
      if (add) {
        addPosition(add.dataset.ocbAdd);
        return;
      }
      const rowAction = e.target.closest("[data-ocb-action]");
      if (rowAction) {
        const row = rowAction.closest("[data-pos-id]");
        const id = row?.dataset.posId;
        if (!id) return;
        const action = rowAction.dataset.ocbAction;
        if (action === "remove") removePosition(id);
        else if (action === "up") movePosition(id, -1);
        else if (action === "down") movePosition(id, 1);
        return;
      }
      const saved = e.target.closest("[data-ocb-saved]");
      if (saved) {
        const id = saved.dataset.ocbId;
        const action = saved.dataset.ocbSaved;
        if (action === "open" || action === "preview") {
          loadSavedChart(id).then(() => {
            if (action === "preview") {
              state.tab = "preview";
              render();
            }
          });
        } else if (action === "clone") {
          cloneSaved(id);
        } else if (action === "print") {
          loadSavedChart(id).then(() => openPrintWindow());
        }
      }
    });

    root.addEventListener("input", (e) => {
      const headerInput = e.target.closest("[data-ocb-header]");
      if (headerInput) {
        setHeader(headerInput.dataset.ocbHeader, headerInput.value);
        return;
      }
      const fieldInput = e.target.closest("[data-ocb-field]");
      if (fieldInput) {
        const row = fieldInput.closest("[data-pos-id]");
        if (!row) return;
        setField(row.dataset.posId, fieldInput.dataset.ocbField, fieldInput.value);
      }
    });

    root.addEventListener("change", (e) => {
      const headerInput = e.target.closest("[data-ocb-header]");
      if (headerInput) {
        setHeader(headerInput.dataset.ocbHeader, headerInput.value);
        return;
      }
      const fieldInput = e.target.closest("[data-ocb-field]");
      if (fieldInput) {
        const row = fieldInput.closest("[data-pos-id]");
        if (!row) return;
        const field = fieldInput.dataset.ocbField;
        if (field === "status") setStatus(row.dataset.posId, fieldInput.value);
        else if (field === "placement") {
          setField(row.dataset.posId, "placement", fieldInput.value);
          render();
        } else {
          setField(row.dataset.posId, field, fieldInput.value);
        }
      }
    });
  }

  function openPrintWindow() {
    const w = global.open("", "_blank", "width=1100,height=850");
    if (!w) {
      alert("Allow pop-ups to print the org chart.");
      return;
    }
    const html = R().renderOrgChartPrintView(state.chart);
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(state.chart?.title || "Organization Chart")}</title>
      <link rel="stylesheet" href="${global.location.origin}/css/print-export.css?v=2" />
    </head><body class="ocb-print-body">
      <main class="print-page">${html}</main>
      <script>setTimeout(function(){ window.print(); }, 350);<\/script>
    </body></html>`);
    w.document.close();
  }

  function injectStyles() {
    if (document.getElementById("ocbStyleTag")) return;
    const css = `
      .ocb-tabs { display:flex; gap:6px; margin:18px 0 12px; flex-wrap:wrap; }
      .ocb-tab {
        background: transparent; color: var(--tn-ink-dim, #6b7280);
        border: 1px solid var(--tn-line, #d1d5db); padding: 10px 18px;
        border-radius: 999px; font-weight: 600; font-size: 0.95rem; cursor:pointer;
      }
      .ocb-tab--active {
        background: var(--tn-gold, #c8a14a); color: var(--tn-ink-bold, #0f172a);
        border-color: var(--tn-gold, #c8a14a);
      }
      .ocb-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
      .ocb-status {
        font-size: 0.85rem; padding: 6px 12px; border-radius: 999px;
        font-weight: 600;
      }
      .ocb-status--saved { background: #d1fae5; color: #064e3b; }
      .ocb-status--saving { background: #e0e7ff; color: #1e40af; }
      .ocb-status--dirty { background: #fef3c7; color: #92400e; }
      .ocb-status--local { background: #ede9fe; color: #4c1d95; }
      .ocb-status--idle  { background: #f3f4f6; color: #4b5563; }
      .ocb-section { margin-bottom: 16px; }
      .ocb-section-head {
        display:flex; align-items:center; justify-content:space-between;
        gap: 12px; margin-bottom: 12px;
      }
      .ocb-row {
        background: rgba(15, 23, 42, 0.02); border: 1px solid var(--tn-line, #e5e7eb);
        border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
      }
      .ocb-row-head { display:flex; gap:10px; align-items:flex-end; }
      .ocb-row-handle { font-size: 1.2rem; color:#9ca3af; padding-bottom:14px; user-select:none; }
      .ocb-row-grow { flex: 1; }
      .ocb-row-actions { display:flex; gap:6px; }
      .ocb-ghost {
        background: transparent; border: 1px solid var(--tn-line, #d1d5db);
        border-radius: 8px; padding: 6px 10px; cursor:pointer; font-size:0.85rem; color:#374151;
      }
      .ocb-ghost--danger { color: #b91c1c; border-color: #fecaca; }
      .ocb-row-grid {
        display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px 12px; margin-top: 10px;
      }
      .ocb-row-notes { grid-column: 1 / -1; }
      .ocb-mini {
        display:block; font-size: 0.8rem; color: var(--tn-ink-dim, #6b7280);
        font-weight: 600; margin-bottom: 4px;
      }
      .ocb-warnings { margin-bottom: 16px; }
      .ocb-warnings ul { margin: 8px 0 0 20px; padding: 0; }
      .ocb-preview-page { color: #111; }
      .ocb-saved-table { width:100%; }
      .ocb-saved-table th, .ocb-saved-table td { padding: 10px 12px; vertical-align: middle; }
      .ocb-saved-table .btn-outline { margin-right: 6px; margin-bottom: 4px; }
      .ocb-notice { margin: 12px 0; }
      @media (max-width: 720px) {
        .ocb-row-head { flex-direction: column; align-items: stretch; }
        .ocb-row-handle { display:none; }
      }`;
    const style = document.createElement("style");
    style.id = "ocbStyleTag";
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function init() {
    if (!document.getElementById("orgChartApp")) return;
    if (!R()) {
      console.warn("[orgchart-builder] report renderers not loaded");
      return;
    }
    injectStyles();
    try {
      await global.SMTN170Firebase?.whenReady?.({ authOnly: false });
    } catch {
      /* continue */
    }
    const draft = loadDraft();
    state.chart = draft || R().defaultOrgChart();
    state.warnings = R().validateOrgChart(state.chart);
    if (draft) state.notice = "Restored your unsaved draft from this device.";
    loadSavedList();
    render();
    if (unsubscribe) unsubscribe();
    unsubscribe =
      global.SMTN170FirebaseData?.orgCharts?.()?.subscribe?.(() => {
        loadSavedList().then(() => {
          if (state.tab === "saved") render();
        });
      }) || null;
  }

  global.SMTN170OrgChartBuilder = {
    init,
    render,
    resetToDefault,
    saveCurrent,
    loadSavedList,
    loadSavedChart,
    cloneSaved,
  };

  if (document.getElementById("orgChartApp")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
