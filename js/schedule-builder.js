/**
 * TN-170 Monthly Squadron Meeting Schedule builder
 * --------------------------------------------------------
 * Mounted on schedule.html. Three modes: Builder | Preview | Saved Reports.
 *
 * Wizard steps inside Builder:
 *   1. Month Setup (month, year, first meeting date, weeks, audiences, defaults)
 *   2. Weekly Schedule Grid (rows: Uniform / Opening / Emphasis / Block 1 / Block 2 / Closing)
 *   3. Extras (extracurricular activities, announcements/notes)
 *
 * Persistence:
 *   - Autosave draft to localStorage (debounced 1s)
 *   - Explicit Save → Firestore `monthlySchedules` collection
 *   - "Clone Previous Month" duplicates structure with regenerated week dates
 *
 * Source of truth for rendering: SMTN170ReportRenderers.renderMonthlySchedulePrintView.
 */
(function initScheduleBuilder(global) {
  const R = () => global.SMTN170ReportRenderers;
  const LOCAL_KEY = "smtn170_monthlyScheduleDraft_v2";

  const TABS = [
    { id: "builder", label: "Builder" },
    { id: "preview", label: "Preview" },
    { id: "saved", label: "Saved Reports" },
  ];

  const STEPS = [
    { id: "setup", label: "1. Month setup" },
    { id: "grid", label: "2. Weekly grid" },
    { id: "extras", label: "3. Extras" },
  ];

  const UNIFORM_OPTIONS = ["PT", "ABU", "Blues", "OCP", "Civies", "Custom"];

  const HIGHLIGHTS = [
    { value: "none", label: "None" },
    { value: "green", label: "Main training" },
    { value: "cyan", label: "Safety / Special" },
    { value: "yellow", label: "Exam / Leadership" },
  ];

  const BLOCK_ROWS = [
    { key: "opening", label: "Opening" },
    { key: "emphasis", label: "Emphasis" },
    { key: "block1", label: "Block #1" },
    { key: "block2", label: "Block #2" },
    { key: "closing", label: "Closing" },
  ];

  const state = {
    tab: "builder",
    step: "setup",
    schedule: null,
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
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state.schedule));
        state.saveStatus = "local";
        updateStatusIndicator();
      } catch (err) {
        console.warn("[schedule-builder] autosave failed", err);
      }
    }, 1000);
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.weeks) return parsed;
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
    state.warnings = R()?.validateSchedule?.(state.schedule) || [];
    updateStatusIndicator();
    refreshPreviewIfActive();
    debouncedAutosave();
  }

  function updateStatusIndicator() {
    const el = document.getElementById("schedStatus");
    if (!el) return;
    if (state.saveStatus === "saved") {
      el.textContent = "Saved";
      el.className = "sb-status sb-status--saved";
    } else if (state.saveStatus === "local") {
      el.textContent = "Draft saved locally";
      el.className = "sb-status sb-status--local";
    } else if (state.saveStatus === "saving") {
      el.textContent = "Saving…";
      el.className = "sb-status sb-status--saving";
    } else if (state.saveStatus === "dirty") {
      el.textContent = "Unsaved changes";
      el.className = "sb-status sb-status--dirty";
    } else {
      el.textContent = "—";
      el.className = "sb-status sb-status--idle";
    }
  }

  function refreshPreviewIfActive() {
    if (state.tab !== "preview") return;
    const host = document.getElementById("sbPreviewHost");
    if (host) host.innerHTML = R().renderMonthlySchedulePrintView(state.schedule);
  }

  function getActorName() {
    return global.SMTN170Auth?.actorDisplay?.() || "Member";
  }

  function getActorId() {
    return global.SMTN170Auth?.actorId?.() || null;
  }

  async function loadSavedList() {
    state.savedLoading = true;
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) {
      state.savedLoading = false;
      state.savedList = [];
      return;
    }
    try {
      const { data, error } = await ms.list({
        order: { field: "updatedAt", asc: false },
        limit: 50,
      });
      if (error) {
        console.warn("[schedule-builder] list failed", error);
        state.savedList = [];
      } else {
        state.savedList = data || [];
      }
    } catch (err) {
      console.warn("[schedule-builder] list crash", err);
      state.savedList = [];
    } finally {
      state.savedLoading = false;
    }
  }

  async function loadSavedSchedule(id) {
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) return null;
    const { data, error } = await ms.get(id);
    if (error || !data) {
      alert("Could not open this monthly schedule.");
      return null;
    }
    state.schedule = normalizeLoaded(data);
    state.tab = "builder";
    state.step = "grid";
    state.saveStatus = "saved";
    state.notice = `Opened "${state.schedule.title || "(untitled)"}".`;
    render();
    return state.schedule;
  }

  function normalizeLoaded(data) {
    const def = R().defaultMonthlySchedule();
    const merged = { ...def, ...data };
    merged.weeks = R()
      .safeArray(data?.weeks)
      .map((w) => normalizeWeek(w));
    if (!merged.weeks.length) merged.weeks = def.weeks;
    return merged;
  }

  function normalizeWeek(w) {
    const defaults = R().defaultBlocks();
    return {
      id: w?.id || R().uid("wk"),
      label: w?.label || "",
      date: w?.date || "",
      uniform: w?.uniform || "ABU",
      opening: { ...defaults.opening, ...(w?.opening || {}) },
      emphasis: { ...defaults.emphasis, ...(w?.emphasis || {}) },
      block1: { ...defaults.block1, ...(w?.block1 || {}) },
      block2: { ...defaults.block2, ...(w?.block2 || {}) },
      closing: { ...defaults.closing, ...(w?.closing || {}) },
    };
  }

  async function clonePreviousMonth() {
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) {
      alert("Firestore not connected — cannot fetch previous month.");
      return;
    }
    const { data } = await ms.list({
      order: { field: "updatedAt", asc: false },
      limit: 5,
    });
    const source = (data || []).find(
      (d) =>
        !(
          d.year === state.schedule.year && d.month === state.schedule.month
        )
    );
    if (!source) {
      alert("No previous monthly schedule to clone yet.");
      return;
    }
    const next = normalizeLoaded(source);
    next.id = R().uid("sched");
    next.status = "draft";
    next.createdAt = null;
    next.updatedAt = null;
    const targetMonth = state.schedule.month;
    const targetYear = state.schedule.year;
    next.month = targetMonth;
    next.year = targetYear;
    next.title = `${R().MONTH_NAMES[targetMonth - 1]} ${targetYear} Monthly Squadron Meeting Schedule`;
    if (state.schedule.firstMeetingDate) {
      next.firstMeetingDate = state.schedule.firstMeetingDate;
      regenerateWeekDatesFromFirst(next);
    }
    state.schedule = next;
    state.notice = `Cloned previous month (${
      R().MONTH_NAMES[source.month - 1]
    } ${source.year}) — review week dates and content.`;
    markDirty();
    render();
  }

  function regenerateWeekDatesFromFirst(schedule) {
    if (!schedule?.firstMeetingDate) return;
    const start = new Date(schedule.firstMeetingDate);
    if (Number.isNaN(start.getTime())) return;
    schedule.weeks.forEach((w, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      w.date = d.toISOString().slice(0, 10);
      if (!w.label) w.label = `Week ${i + 1}`;
    });
  }

  function generateWeeks(weekCount) {
    const count = Math.max(1, Number(weekCount) || 4);
    const existing = state.schedule.weeks;
    const next = [];
    for (let i = 0; i < count; i++) {
      const reused = existing[i];
      if (reused) next.push(reused);
      else next.push(R().defaultWeek(`Week ${i + 1}`, ""));
    }
    state.schedule.weeks = next;
    regenerateWeekDatesFromFirst(state.schedule);
    markDirty();
    render();
  }

  function applySmartDefaultsTo(weekIdx) {
    const week = state.schedule.weeks[weekIdx];
    if (!week) return;
    const def = R().defaultBlocks();
    BLOCK_ROWS.forEach(({ key }) => {
      week[key] = { ...def[key], ...week[key] };
    });
    markDirty();
    render();
  }

  function applySmartDefaultsAll() {
    state.schedule.weeks.forEach((_, i) => applySmartDefaultsTo(i));
  }

  async function saveCurrent() {
    if (!state.schedule) return;
    state.saving = true;
    state.saveStatus = "saving";
    updateStatusIndicator();
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) {
      alert(
        "Firestore is not available. Draft saved locally — connect Firebase to save to the squadron workspace."
      );
      state.saving = false;
      state.saveStatus = "local";
      updateStatusIndicator();
      return;
    }
    const payload = {
      ...state.schedule,
      updatedAt: new Date().toISOString(),
      updatedBy: getActorId(),
      updatedByName: getActorName(),
    };
    if (!payload.createdBy) payload.createdBy = getActorId();
    const { data, error } = await ms.save(payload);
    state.saving = false;
    if (error) {
      console.warn("[schedule-builder] save failed", error);
      state.saveStatus = "dirty";
      updateStatusIndicator();
      alert(
        "Could not save to Firestore: " +
          (error.message || error) +
          "\nDraft was kept locally. (See report notes about Firestore rules.)"
      );
      return;
    }
    state.schedule = normalizeLoaded(data);
    clearDraft();
    state.saveStatus = "saved";
    state.notice = `Saved "${state.schedule.title || "Monthly Schedule"}".`;
    updateStatusIndicator();
    loadSavedList().then(() => {
      if (state.tab === "saved") render();
    });
    render();
  }

  function setHeader(field, value) {
    state.schedule[field] = value;
    if (field === "firstMeetingDate") regenerateWeekDatesFromFirst(state.schedule);
    if (field === "month" || field === "year") {
      state.schedule.title = `${R().MONTH_NAMES[(state.schedule.month - 1) % 12]} ${
        state.schedule.year
      } Monthly Squadron Meeting Schedule`;
    }
    markDirty();
  }

  function setAudience(label, on) {
    const arr = state.schedule.audienceLabels || [];
    const has = arr.includes(label);
    if (on && !has) arr.push(label);
    if (!on && has) state.schedule.audienceLabels = arr.filter((l) => l !== label);
    markDirty();
  }

  function setWeekField(weekId, field, value) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week) return;
    week[field] = value;
    markDirty();
  }

  function setBlockField(weekId, blockKey, field, value) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week || !week[blockKey]) return;
    if (field === "bullets") {
      week[blockKey][field] = String(value || "")
        .split(/\r?\n/)
        .map((b) => b.trim())
        .filter(Boolean);
    } else {
      week[blockKey][field] = value;
    }
    markDirty();
  }

  function renderTabs() {
    return `
      <nav class="sb-tabs" role="tablist" aria-label="Schedule builder tabs">
        ${TABS.map(
          (t) => `
          <button type="button" role="tab" aria-selected="${state.tab === t.id}" class="sb-tab ${
            state.tab === t.id ? "sb-tab--active" : ""
          }" data-sb-tab="${t.id}">${escapeHtml(t.label)}</button>`
        ).join("")}
      </nav>`;
  }

  function renderStepNav() {
    return `
      <nav class="sb-steps" aria-label="Builder steps">
        ${STEPS.map(
          (s) => `
          <button type="button" class="sb-step ${state.step === s.id ? "sb-step--active" : ""}" data-sb-step="${s.id}">${escapeHtml(
            s.label
          )}</button>`
        ).join("")}
      </nav>`;
  }

  function renderSetupStep() {
    const s = state.schedule;
    const monthOpts = R()
      .MONTH_NAMES.map(
        (m, i) =>
          `<option value="${i + 1}" ${s.month === i + 1 ? "selected" : ""}>${escapeHtml(m)}</option>`
      )
      .join("");
    const audChecks = ["BCT", "Flights", "All Cadets", "Parents"]
      .map(
        (a) => `
          <label class="sb-check">
            <input type="checkbox" data-sb-audience="${escapeAttr(a)}" ${
              s.audienceLabels?.includes(a) ? "checked" : ""
            } />
            ${escapeHtml(a)}
          </label>`
      )
      .join("");

    return `
      <section class="card-info sb-section">
        <h3 class="card-info-title">Step 1 — Month setup</h3>
        <div class="sb-grid">
          <div>
            <label for="sbMonth">Month</label>
            <select id="sbMonth" data-sb-header="month">${monthOpts}</select>
          </div>
          <div>
            <label for="sbYear">Year</label>
            <input id="sbYear" type="number" min="2024" max="2099" data-sb-header="year" value="${escapeAttr(
              s.year
            )}" />
          </div>
          <div>
            <label for="sbFirst">First meeting date</label>
            <input id="sbFirst" type="date" data-sb-header="firstMeetingDate" value="${escapeAttr(
              s.firstMeetingDate || ""
            )}" />
          </div>
          <div>
            <label for="sbWeeks">Number of weeks</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="sbWeeks" type="number" min="1" max="6" value="${escapeAttr(
                s.weeks.length
              )}" style="max-width:120px;" />
              <button type="button" class="btn-outline" data-sb-cmd="generate-weeks">Generate week columns</button>
            </div>
          </div>
        </div>
        <fieldset class="sb-fieldset">
          <legend>Audience labels (shown on the printed legend)</legend>
          <div class="sb-checks">${audChecks}</div>
        </fieldset>
        <div class="sb-help">
          <button type="button" class="btn-outline" data-sb-cmd="defaults-all">Apply smart defaults to all weeks</button>
          <p class="page-intro" style="margin-top:8px">
            Smart defaults: Opening 1900–1905, Emphasis 1905–1920 (15m), Block #1 1920–2005 (45m), Block #2 2005–2050 (45m), Closing 2050–2100.
          </p>
        </div>
      </section>`;
  }

  function renderBlockEditor(weekId, blockKey, block, label) {
    const hlOpts = HIGHLIGHTS.map(
      (h) =>
        `<option value="${h.value}" ${
          block.highlightType === h.value ? "selected" : ""
        }>${escapeHtml(h.label)}</option>`
    ).join("");
    return `
      <details class="sb-block" data-week-id="${escapeAttr(weekId)}" data-block-key="${escapeAttr(
        blockKey
      )}">
        <summary><strong>${escapeHtml(label)}</strong>${
          block.title ? " — " + escapeHtml(block.title) : ""
        }</summary>
        <div class="sb-block-grid">
          <div>
            <label class="sb-mini">Start</label>
            <input data-sb-block-field="startTime" value="${escapeAttr(block.startTime || "")}" />
          </div>
          <div>
            <label class="sb-mini">End</label>
            <input data-sb-block-field="endTime" value="${escapeAttr(block.endTime || "")}" />
          </div>
          <div>
            <label class="sb-mini">Duration label</label>
            <input data-sb-block-field="durationLabel" value="${escapeAttr(block.durationLabel || "")}" />
          </div>
          <div>
            <label class="sb-mini">Highlight</label>
            <select data-sb-block-field="highlightType">${hlOpts}</select>
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Title</label>
            <input data-sb-block-field="title" value="${escapeAttr(block.title || "")}" />
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Owner</label>
            <input data-sb-block-field="owner" value="${escapeAttr(block.owner || "")}" />
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Bullets (one per line)</label>
            <textarea data-sb-block-field="bullets" rows="3">${escapeHtml(
              (block.bullets || []).join("\n")
            )}</textarea>
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Notes</label>
            <input data-sb-block-field="notes" value="${escapeAttr(block.notes || "")}" />
          </div>
        </div>
      </details>`;
  }

  function renderWeekColumn(week, idx) {
    const uniformOpts = UNIFORM_OPTIONS.map(
      (u) =>
        `<option value="${u}" ${week.uniform === u ? "selected" : ""}>${escapeHtml(u)}</option>`
    ).join("");
    return `
      <article class="sb-week-col" data-week-id="${escapeAttr(week.id)}">
        <header class="sb-week-head">
          <strong>Week ${idx + 1}</strong>
          <input type="date" data-sb-week-field="date" value="${escapeAttr(week.date || "")}" />
        </header>
        <div class="sb-week-uniform">
          <label class="sb-mini">Uniform</label>
          <select data-sb-week-field="uniform">${uniformOpts}</select>
        </div>
        <div class="sb-blocks">
          ${BLOCK_ROWS.map(({ key, label }) =>
            renderBlockEditor(week.id, key, week[key] || {}, label)
          ).join("")}
        </div>
        <footer class="sb-week-foot">
          <button type="button" class="btn-outline" data-sb-cmd="defaults-week" data-week-idx="${idx}">Apply smart defaults</button>
        </footer>
      </article>`;
  }

  function renderGridStep() {
    const cols = state.schedule.weeks
      .map((w, i) => renderWeekColumn(w, i))
      .join("");
    return `
      <section class="card-info sb-section">
        <h3 class="card-info-title">Step 2 — Weekly grid</h3>
        <p class="page-intro">Each column is a week. Each row (Opening, Emphasis, Block #1, Block #2, Closing) is the same as on the printed schedule.</p>
        <div class="sb-week-strip">${cols}</div>
      </section>`;
  }

  function renderExtrasStep() {
    const s = state.schedule;
    return `
      <section class="card-info sb-section">
        <h3 class="card-info-title">Step 3 — Extras</h3>
        <label for="sbExtra">Extracurricular activities</label>
        <textarea id="sbExtra" rows="3" data-sb-header="extracurricularActivities">${escapeHtml(
          s.extracurricularActivities || ""
        )}</textarea>
        <label for="sbNotes">Announcements / additional notes</label>
        <textarea id="sbNotes" rows="4" data-sb-header="notes">${escapeHtml(s.notes || "")}</textarea>
      </section>`;
  }

  function renderBuilderTab() {
    const warnings = state.warnings;
    return `
      <div class="sb-builder">
        ${
          warnings.length
            ? `<div class="card-warning sb-warnings"><strong>Heads up:</strong><ul>${warnings
                .map((w) => `<li>${escapeHtml(w)}</li>`)
                .join("")}</ul></div>`
            : ""
        }
        ${renderStepNav()}
        <div class="sb-stepbody">
          ${
            state.step === "setup"
              ? renderSetupStep()
              : state.step === "grid"
                ? renderGridStep()
                : renderExtrasStep()
          }
        </div>
        <div class="sb-step-actions">
          <button type="button" class="btn-outline" data-sb-step-nav="back">Back</button>
          <button type="button" class="btn-gold" data-sb-step-nav="next">${
            state.step === "extras" ? "Done — go to Preview" : "Next"
          }</button>
        </div>
      </div>`;
  }

  function renderPreviewTab() {
    return `
      <div class="sb-preview-wrap">
        <p class="page-intro">Preview — this matches the printed monthly schedule exactly.</p>
        <div class="print-page sb-preview-page" id="sbPreviewHost">${R().renderMonthlySchedulePrintView(
          state.schedule
        )}</div>
      </div>`;
  }

  function renderSavedTab() {
    if (state.savedLoading) {
      return `<p class="page-intro">Loading saved schedules…</p>`;
    }
    if (!state.savedList.length) {
      return `<p class="page-intro">No saved monthly schedules yet. Build one in the <strong>Builder</strong> tab and click <strong>Save</strong>.</p>`;
    }
    const rows = state.savedList
      .map(
        (doc) => `
        <tr>
          <td>${escapeHtml(R().MONTH_NAMES[(doc.month - 1) % 12] || "")} ${escapeHtml(doc.year || "")}</td>
          <td>${escapeHtml(doc.title || "(untitled)")}</td>
          <td>${escapeHtml(doc.status === "final" ? "Final" : "Draft")}</td>
          <td>${escapeHtml(formatWhen(doc.updatedAt))}</td>
          <td>
            <button type="button" class="btn-outline" data-sb-saved="open" data-sb-id="${escapeAttr(
              doc.id
            )}">Open</button>
            <button type="button" class="btn-outline" data-sb-saved="clone" data-sb-id="${escapeAttr(
              doc.id
            )}">Clone</button>
            <button type="button" class="btn-outline" data-sb-saved="preview" data-sb-id="${escapeAttr(
              doc.id
            )}">Preview</button>
            <button type="button" class="btn-outline" data-sb-saved="print" data-sb-id="${escapeAttr(
              doc.id
            )}">Print</button>
          </td>
        </tr>`
      )
      .join("");
    return `
      <div class="sb-saved">
        <table class="admin-table sb-saved-table">
          <thead>
            <tr><th>Month</th><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr>
          </thead>
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
    const root = document.getElementById("scheduleBuilderRoot");
    if (!root) return;
    let content = "";
    if (state.tab === "builder") content = renderBuilderTab();
    else if (state.tab === "preview") content = renderPreviewTab();
    else content = renderSavedTab();

    root.innerHTML = `
      <header class="org-hero card-info sb-hero">
        <div class="org-hero-text">
          <p class="org-hero-eyebrow">Squadron report builder</p>
          <h2 class="org-hero-title">Monthly Squadron Meeting Schedule</h2>
          <p class="org-hero-sub">Plan the month — Preview matches the printed schedule exactly.</p>
        </div>
        <div class="org-hero-actions sb-actions">
          <span id="schedStatus" class="sb-status sb-status--idle">—</span>
          <button type="button" class="btn-gold btn-lg" data-sb-cmd="save">Save Schedule</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="clone-prev">Clone Previous Month</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="preview">Preview Print Layout</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="print">Print / Save as PDF</button>
        </div>
      </header>
      ${state.notice ? `<div class="card-info sb-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}
      ${renderTabs()}
      <div class="sb-tabpanel" role="tabpanel">${content}</div>`;

    bindEvents(root);
    updateStatusIndicator();
  }

  function bindEvents(root) {
    if (root.dataset.sbBound === "1") return;
    root.dataset.sbBound = "1";

    root.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-sb-tab]");
      if (tab) {
        state.tab = tab.dataset.sbTab;
        if (state.tab === "saved") loadSavedList().then(render);
        else render();
        return;
      }
      const step = e.target.closest("[data-sb-step]");
      if (step) {
        state.step = step.dataset.sbStep;
        render();
        return;
      }
      const stepNav = e.target.closest("[data-sb-step-nav]");
      if (stepNav) {
        const dir = stepNav.dataset.sbStepNav;
        const idx = STEPS.findIndex((s) => s.id === state.step);
        if (dir === "back" && idx > 0) {
          state.step = STEPS[idx - 1].id;
        } else if (dir === "next") {
          if (idx < STEPS.length - 1) state.step = STEPS[idx + 1].id;
          else {
            state.tab = "preview";
          }
        }
        render();
        return;
      }
      const cmd = e.target.closest("[data-sb-cmd]");
      if (cmd) {
        const c = cmd.dataset.sbCmd;
        if (c === "save") saveCurrent();
        else if (c === "clone-prev") clonePreviousMonth();
        else if (c === "preview") {
          state.tab = "preview";
          render();
        } else if (c === "print") openPrintWindow();
        else if (c === "generate-weeks") {
          const input = document.getElementById("sbWeeks");
          generateWeeks(input?.value);
        } else if (c === "defaults-all") {
          applySmartDefaultsAll();
          render();
        } else if (c === "defaults-week") {
          const idx = +cmd.dataset.weekIdx;
          applySmartDefaultsTo(idx);
        }
        return;
      }
      const saved = e.target.closest("[data-sb-saved]");
      if (saved) {
        const id = saved.dataset.sbId;
        const action = saved.dataset.sbSaved;
        if (action === "open" || action === "preview") {
          loadSavedSchedule(id).then(() => {
            if (action === "preview") {
              state.tab = "preview";
              render();
            }
          });
        } else if (action === "clone") {
          loadSavedSchedule(id).then(() => {
            const s = state.schedule;
            s.id = R().uid("sched");
            s.title = (s.title || "Monthly schedule") + " (copy)";
            s.status = "draft";
            state.tab = "builder";
            state.notice = "Cloned to a new draft.";
            markDirty();
            render();
          });
        } else if (action === "print") {
          loadSavedSchedule(id).then(() => openPrintWindow());
        }
      }
    });

    const handleEvent = (e) => {
      const headerInput = e.target.closest("[data-sb-header]");
      if (headerInput) {
        const field = headerInput.dataset.sbHeader;
        const value = headerInput.type === "number" ? +headerInput.value : headerInput.value;
        setHeader(field, value);
        return;
      }
      const audience = e.target.closest("[data-sb-audience]");
      if (audience && audience.type === "checkbox") {
        setAudience(audience.dataset.sbAudience, audience.checked);
        return;
      }
      const weekField = e.target.closest("[data-sb-week-field]");
      if (weekField) {
        const col = weekField.closest("[data-week-id]");
        if (!col) return;
        setWeekField(col.dataset.weekId, weekField.dataset.sbWeekField, weekField.value);
        return;
      }
      const blockField = e.target.closest("[data-sb-block-field]");
      if (blockField) {
        const block = blockField.closest("[data-block-key]");
        if (!block) return;
        setBlockField(
          block.dataset.weekId,
          block.dataset.blockKey,
          blockField.dataset.sbBlockField,
          blockField.value
        );
      }
    };

    root.addEventListener("input", handleEvent);
    root.addEventListener("change", handleEvent);
  }

  function openPrintWindow() {
    const w = global.open("", "_blank", "width=1200,height=900");
    if (!w) {
      alert("Allow pop-ups to print the monthly schedule.");
      return;
    }
    const html = R().renderMonthlySchedulePrintView(state.schedule);
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(state.schedule?.title || "Monthly Schedule")}</title>
      <link rel="stylesheet" href="${global.location.origin}/css/print-export.css?v=1" />
    </head><body class="sb-print-body">
      <main class="print-page">${html}</main>
      <script>setTimeout(function(){ window.print(); }, 350);<\/script>
    </body></html>`);
    w.document.close();
  }

  function injectStyles() {
    if (document.getElementById("sbStyleTag")) return;
    const css = `
      .sb-tabs { display:flex; gap:6px; margin:18px 0 12px; flex-wrap:wrap; }
      .sb-tab {
        background: transparent; color: var(--tn-ink-dim, #6b7280);
        border: 1px solid var(--tn-line, #d1d5db); padding: 10px 18px;
        border-radius: 999px; font-weight: 600; font-size: 0.95rem; cursor:pointer;
      }
      .sb-tab--active {
        background: var(--tn-gold, #c8a14a); color: var(--tn-ink-bold, #0f172a);
        border-color: var(--tn-gold, #c8a14a);
      }
      .sb-steps { display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 12px; }
      .sb-step {
        background: transparent; color: var(--tn-ink-dim, #6b7280);
        border: 1px dashed var(--tn-line, #d1d5db); padding: 8px 14px;
        border-radius: 999px; font-size: 0.92rem; cursor:pointer; font-weight: 600;
      }
      .sb-step--active { background: rgba(200,161,74,0.18); color: var(--tn-ink-bold, #0f172a); border-style: solid; }
      .sb-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
      .sb-status {
        font-size: 0.85rem; padding: 6px 12px; border-radius: 999px;
        font-weight: 600;
      }
      .sb-status--saved { background: #d1fae5; color: #064e3b; }
      .sb-status--saving { background: #e0e7ff; color: #1e40af; }
      .sb-status--dirty { background: #fef3c7; color: #92400e; }
      .sb-status--local { background: #ede9fe; color: #4c1d95; }
      .sb-status--idle { background: #f3f4f6; color: #4b5563; }
      .sb-section { margin-bottom: 16px; }
      .sb-grid {
        display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;
      }
      .sb-fieldset {
        margin-top: 14px; padding: 12px 14px; border-radius: 12px;
        border: 1px solid var(--tn-line, #e5e7eb); background: rgba(15, 23, 42, 0.02);
      }
      .sb-fieldset legend { font-weight: 600; color: var(--tn-ink-dim, #4b5563); padding: 0 6px; }
      .sb-checks { display:flex; gap: 12px; flex-wrap: wrap; }
      .sb-check { display:flex; align-items:center; gap:6px; font-weight: 500; }
      .sb-check input { width: auto; }
      .sb-help { margin-top: 16px; }
      .sb-step-actions { display:flex; justify-content:space-between; gap: 10px; margin-top: 14px; }
      .sb-week-strip {
        display:grid; gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .sb-week-col {
        border: 1px solid var(--tn-line, #e5e7eb); border-radius: 12px;
        padding: 12px; background: rgba(15, 23, 42, 0.02);
      }
      .sb-week-head {
        display:flex; align-items:center; justify-content:space-between;
        gap: 8px; margin-bottom: 8px;
      }
      .sb-week-head input { max-width: 160px; }
      .sb-week-uniform { margin-bottom: 8px; }
      .sb-mini { display:block; font-size:0.8rem; color: var(--tn-ink-dim, #6b7280); font-weight:600; margin-bottom:4px; }
      .sb-blocks details {
        border: 1px solid var(--tn-line, #e5e7eb); border-radius: 10px;
        padding: 8px 10px; margin-bottom: 8px; background: #fff;
      }
      .sb-blocks details summary { cursor:pointer; padding: 4px 0; font-weight: 500; }
      .sb-block-grid {
        display:grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px;
      }
      .sb-block-wide { grid-column: 1 / -1; }
      .sb-warnings { margin-bottom: 14px; }
      .sb-warnings ul { margin: 8px 0 0 20px; padding: 0; }
      .sb-preview-page { color: #111; }
      .sb-saved-table { width:100%; }
      .sb-saved-table th, .sb-saved-table td { padding: 10px 12px; vertical-align: middle; }
      .sb-saved-table .btn-outline { margin-right: 6px; margin-bottom: 4px; }
      .sb-notice { margin: 12px 0; }
      @media (max-width: 720px) {
        .sb-block-grid { grid-template-columns: 1fr; }
      }`;
    const style = document.createElement("style");
    style.id = "sbStyleTag";
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function init() {
    if (!document.getElementById("scheduleBuilderRoot")) return;
    if (!R()) {
      console.warn("[schedule-builder] report renderers not loaded");
      return;
    }
    injectStyles();
    try {
      await global.SMTN170Firebase?.whenReady?.({ authOnly: false });
    } catch {
      /* continue */
    }
    const draft = loadDraft();
    state.schedule = draft ? normalizeLoaded(draft) : R().defaultMonthlySchedule();
    state.warnings = R().validateSchedule(state.schedule);
    if (draft) state.notice = "Restored your unsaved draft from this device.";
    loadSavedList();
    render();
    if (unsubscribe) unsubscribe();
    unsubscribe =
      global.SMTN170FirebaseData?.monthlySchedules?.()?.subscribe?.(() => {
        loadSavedList().then(() => {
          if (state.tab === "saved") render();
        });
      }) || null;
  }

  global.SMTN170ScheduleBuilder = {
    init,
    render,
    saveCurrent,
    clonePreviousMonth,
    loadSavedList,
    loadSavedSchedule,
  };

  if (document.getElementById("scheduleBuilderRoot")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
