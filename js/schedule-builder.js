/**
 * TN-170 Monthly Meeting Schedule Builder
 * --------------------------------------------------------
 * Mounted on schedule.html. Four flat tabs:
 *   Setup | Grid Builder | Preview | Saved Schedules
 *
 * This builder produces the **squadron's printable monthly meeting plan** in
 * the same Google Docs-style grid used for weekly handouts. It is NOT the
 * generic squadron calendar (see calendar.html for that).
 *
 * Key features:
 *   - 4-week × 6-row grid (Uniform / Opening / Emphasis / Block #1 / Block #2 /
 *     Closing) — desktop shows the full grid, mobile collapses to per-week
 *     accordions with the same underlying data model.
 *   - Inline cell editors: Uniform dropdown (PT/ABU/Blues/OCP/Civies/Custom),
 *     time + title + owner + bullets + notes + highlightType per block.
 *   - Multi-entry blocks: a single cell can carry multiple stacked entries
 *     (e.g. Week 2 Block #1 has both "TBD" and "1920 - TBD").
 *   - Audience labels with highlight mapping: BCT (yellow), Flights (green),
 *     All Cadets (cyan). Editable label + toggle + highlight per audience —
 *     admins can add a custom label (e.g. "Parents") via the audience editor;
 *     it is no longer part of the default seed.
 *   - "Load TN-170 June 2026 Example" prefill helper for round-trip testing.
 *   - Autosave to localStorage (debounced 1s); explicit Save to Firestore
 *     `monthlySchedules`. Clone Previous Month duplicates with regenerated
 *     dates.
 *   - Source of truth for rendering: `SMTN170ReportRenderers
 *     .renderMonthlySchedulePrintView` — same module used by the print view.
 */
(function initScheduleBuilder(global) {
  const R = () => global.SMTN170ReportRenderers;
  const LOCAL_KEY = "smtn170_monthlyScheduleDraft_v3";

  const TABS = [
    { id: "setup", label: "Setup" },
    { id: "grid", label: "Grid Builder" },
    { id: "preview", label: "Preview" },
    { id: "saved", label: "Saved Schedules" },
  ];

  const UNIFORM_OPTIONS = ["PT", "ABU", "Blues", "OCP", "Civies", "Custom"];

  const HIGHLIGHTS = [
    { value: "none", label: "None", title: "Plain — no highlight" },
    {
      value: "green",
      label: "Main",
      title: "Primary activity / training",
    },
    {
      value: "cyan",
      label: "Safety",
      title: "Safety briefing / special advisory",
    },
    {
      value: "yellow",
      label: "Exam",
      title: "Testing / exam / leadership / event note",
    },
  ];

  const HIGHLIGHT_TITLES = HIGHLIGHTS.reduce((acc, h) => {
    acc[h.value] = h.title;
    return acc;
  }, {});

  const BLOCK_ROWS = [
    { key: "opening", label: "Opening" },
    { key: "emphasis", label: "Emphasis" },
    { key: "block1", label: "Block #1" },
    { key: "block2", label: "Block #2" },
    { key: "closing", label: "Closing" },
  ];

  const state = {
    tab: "setup",
    schedule: null,
    saving: false,
    savedList: [],
    savedLoading: false,
    saveStatus: "idle",
    warnings: [],
    notice: "",
    mobileActiveWeek: 0,
    expanded: {}, // weekId|blockKey -> bool, controls inline editor open state
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
    state.tab = "grid";
    state.saveStatus = "saved";
    state.notice = `Opened "${state.schedule.title || "(untitled)"}".`;
    render();
    return state.schedule;
  }

  async function deleteSavedSchedule(id) {
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) {
      alert("Firestore is not available — cannot delete this schedule.");
      return;
    }
    const doc = state.savedList.find((d) => d.id === id);
    const label =
      doc?.title ||
      (doc?.month && doc?.year
        ? `${R().MONTH_NAMES[(doc.month - 1) % 12]} ${doc.year}`
        : "this monthly schedule");
    if (!confirm(`Delete schedule "${label}"? This cannot be undone.`)) return;
    const { error } = await ms.remove(id);
    if (error) {
      console.warn("[schedule-builder] delete failed", error);
      alert("Could not delete: " + (error.message || error));
      return;
    }
    state.notice = "Schedule deleted.";
    if (state.schedule?.id === id) {
      state.schedule = R().defaultMonthlySchedule();
      state.saveStatus = "idle";
    }
    await loadSavedList();
    render();
  }

  function isAdminUser() {
    return !!global.SMTN170Auth?.isAdmin?.();
  }

  /**
   * Normalize anything coming from Firestore / localStorage / the legacy
   * builder into the canonical shape used by the renderer and the editor.
   * - Audience labels: string array → {label, highlightType, enabled} array
   * - Blocks: single-entry → entries[1] (renderer still consumes top-level
   *   fields for back-compat; editor reads entries[])
   */
  function normalizeLoaded(data) {
    const renderers = R();
    const def = renderers.defaultMonthlySchedule();
    const merged = { ...def, ...data };
    merged.audienceLabels = renderers.normalizeAudienceLabels(
      data?.audienceLabels
    );
    merged.weeks = renderers
      .safeArray(data?.weeks)
      .map((w) => normalizeWeek(w));
    if (!merged.weeks.length) merged.weeks = def.weeks;
    return merged;
  }

  function normalizeWeek(w) {
    const renderers = R();
    const defaults = renderers.defaultBlocks();
    return {
      id: w?.id || renderers.uid("wk"),
      label: w?.label || "",
      date: w?.date || "",
      uniform: w?.uniform || "ABU",
      uniformCustom: w?.uniformCustom || "",
      opening: renderers.normalizeBlock(w?.opening, defaults.opening),
      emphasis: renderers.normalizeBlock(w?.emphasis, defaults.emphasis),
      block1: renderers.normalizeBlock(w?.block1, defaults.block1),
      block2: renderers.normalizeBlock(w?.block2, defaults.block2),
      closing: renderers.normalizeBlock(w?.closing, defaults.closing),
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
        !(d.year === state.schedule.year && d.month === state.schedule.month)
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
    const start = parseLocalDate(schedule.firstMeetingDate);
    if (!start || Number.isNaN(start.getTime())) return;
    schedule.weeks.forEach((w, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      w.date = isoDate(d);
      if (!w.label) w.label = `Week ${i + 1}`;
    });
  }

  function parseLocalDate(yyyyMmDd) {
    if (!yyyyMmDd) return null;
    const m = String(yyyyMmDd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date(yyyyMmDd);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function generateWeeks(weekCount) {
    const count = Math.max(1, Number(weekCount) || 4);
    const existing = state.schedule.weeks;
    const next = [];
    for (let i = 0; i < count; i++) {
      const reused = existing[i];
      if (reused) next.push(reused);
      else next.push(normalizeWeek({ label: `Week ${i + 1}` }));
    }
    state.schedule.weeks = next;
    regenerateWeekDatesFromFirst(state.schedule);
    markDirty();
    render();
  }

  function applySmartDefaultsTo(weekIdx) {
    const week = state.schedule.weeks[weekIdx];
    if (!week) return;
    const defaults = R().defaultBlocks();
    BLOCK_ROWS.forEach(({ key }) => {
      // Only fill blank slots; preserve user content.
      const cur = week[key];
      const def = defaults[key];
      const head = cur?.entries?.[0] || cur;
      const looksEmpty = !head?.title && !head?.startTime && !head?.endTime;
      if (looksEmpty) {
        week[key] = R().normalizeBlock(def, def);
      }
    });
    markDirty();
  }

  function applySmartDefaultsAll() {
    state.schedule.weeks.forEach((_, i) => applySmartDefaultsTo(i));
    render();
  }

  function loadTN170JuneExample() {
    const example = R().tn170JuneExample();
    state.schedule = normalizeLoaded(example);
    state.notice =
      "Loaded the TN-170 June 2026 reference example. Save to write it to Firestore.";
    state.tab = "grid";
    markDirty();
    render();
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

  /* ---- Mutations ---- */

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

  function setAudienceField(index, field, value) {
    const arr = state.schedule.audienceLabels || [];
    if (!arr[index]) return;
    arr[index][field] = value;
    markDirty();
  }

  function setWeekField(weekId, field, value) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week) return;
    week[field] = value;
    markDirty();
  }

  function setEntryField(weekId, blockKey, entryIdx, field, value) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week || !week[blockKey]) return;
    const block = week[blockKey];
    block.entries = R().safeArray(block.entries);
    if (!block.entries[entryIdx]) return;
    if (field === "bullets") {
      block.entries[entryIdx][field] = String(value || "")
        .split(/\r?\n/)
        .map((b) => b.trim())
        .filter(Boolean);
    } else {
      block.entries[entryIdx][field] = value;
    }
    // Keep top-level convenience fields in sync with entries[0] so legacy
    // single-entry consumers still work after a round-trip.
    if (entryIdx === 0) {
      Object.assign(block, block.entries[0]);
    }
    markDirty();
  }

  function addEntry(weekId, blockKey) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week || !week[blockKey]) return;
    const block = week[blockKey];
    block.entries = R().safeArray(block.entries);
    if (!block.entries.length) {
      // Seed with the current single-entry top-level data so we don't lose it.
      block.entries.push(R().normalizeEntry(block, block));
    }
    block.entries.push(R().emptyEntry(block.highlightType));
    markDirty();
    render();
  }

  function removeEntry(weekId, blockKey, entryIdx) {
    const week = state.schedule.weeks.find((w) => w.id === weekId);
    if (!week || !week[blockKey]) return;
    const block = week[blockKey];
    block.entries = R().safeArray(block.entries);
    if (block.entries.length <= 1) return;
    block.entries.splice(entryIdx, 1);
    Object.assign(block, block.entries[0]);
    markDirty();
    render();
  }

  /* ---- UI fragments ---- */

  function renderHeroHeader() {
    return `
      <header class="org-hero card-info sb-hero">
        <div class="org-hero-text">
          <p class="org-hero-eyebrow">Squadron report builder</p>
          <h2 class="org-hero-title">Monthly Meeting Schedule Builder</h2>
          <p class="org-hero-sub">Build the squadron's printable monthly meeting plan in the same format used for weekly meeting handouts.</p>
        </div>
        <div class="org-hero-actions sb-actions">
          <span id="schedStatus" class="sb-status sb-status--idle">—</span>
          <button type="button" class="btn-gold btn-lg" data-sb-cmd="save">Save Schedule</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="clone-prev">Clone Previous Month</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="preview">Preview Print Layout</button>
          <button type="button" class="btn-outline btn-lg" data-sb-cmd="print">Print / Save as PDF</button>
        </div>
      </header>`;
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

  function renderAudienceEditor() {
    const labels = R().normalizeAudienceLabels(state.schedule.audienceLabels);
    state.schedule.audienceLabels = labels;
    const rows = labels
      .map((a, i) => {
        const hl = HIGHLIGHTS.map(
          (h) =>
            `<option value="${h.value}" ${
              a.highlightType === h.value ? "selected" : ""
            }>${escapeHtml(h.label)}</option>`
        ).join("");
        return `
          <div class="sb-audience-row" data-sb-audience-idx="${i}">
            <label class="sb-check sb-audience-toggle">
              <input type="checkbox" data-sb-audience-field="enabled" ${
                a.enabled ? "checked" : ""
              } />
              <span class="sb-mini sb-audience-toggle-label">Show</span>
            </label>
            <input class="sb-audience-label" data-sb-audience-field="label" value="${escapeAttr(
              a.label
            )}" />
            <select class="sb-audience-hl" data-sb-audience-field="highlightType" title="${escapeAttr(
              HIGHLIGHT_TITLES[a.highlightType] || ""
            )}">${hl}</select>
            <span class="sb-audience-preview sched-badge ${
              R().HIGHLIGHT_BADGE_CLASSES[a.highlightType] || "sched-badge--plain"
            }">${escapeHtml(a.label || "—")}</span>
          </div>`;
      })
      .join("");
    return `
      <fieldset class="sb-fieldset sb-audience">
        <legend>Audience labels &amp; highlight mapping</legend>
        <p class="page-intro" style="margin:0 0 10px;">
          Each printed audience badge picks up the highlight colour you choose
          here (yellow / green / cyan / plain). Toggle to hide a label without
          removing it.
        </p>
        ${rows}
      </fieldset>`;
  }

  function renderSetupTab() {
    const s = state.schedule;
    const monthOpts = R()
      .MONTH_NAMES.map(
        (m, i) =>
          `<option value="${i + 1}" ${s.month === i + 1 ? "selected" : ""}>${escapeHtml(m)}</option>`
      )
      .join("");

    return `
      <section class="card-info sb-section">
        <h3 class="card-info-title">Month setup</h3>
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
        ${renderAudienceEditor()}
        <div class="sb-help">
          <div class="sb-help-actions">
            <button type="button" class="btn-outline" data-sb-cmd="defaults-all">Apply smart defaults to all weeks</button>
            <button type="button" class="btn-outline" data-sb-cmd="load-example">Load TN-170 June 2026 Example</button>
            <button type="button" class="btn-gold" data-sb-tab-go="grid">Open Grid Builder →</button>
          </div>
          <p class="page-intro" style="margin-top:10px">
            Smart defaults: Opening 1900–1905 Anthem, Emphasis 1905–1920 (15m),
            Block #1 1920–2005 (45m), Block #2 2005–2050 (45m), Closing
            2050–2100 Announcements.
          </p>
        </div>
      </section>`;
  }

  /* ---- Block / entry editor ---- */

  function renderEntryEditor(weekId, blockKey, entryIdx, entry, totalEntries) {
    const hlOpts = HIGHLIGHTS.map(
      (h) =>
        `<option value="${h.value}" title="${escapeAttr(h.title)}" ${
          entry.highlightType === h.value ? "selected" : ""
        }>${escapeHtml(h.label)}</option>`
    ).join("");
    return `
      <div class="sb-entry" data-entry-idx="${entryIdx}">
        <div class="sb-entry-head">
          <span class="sb-entry-tag">Entry ${entryIdx + 1}</span>
          ${
            totalEntries > 1
              ? `<button type="button" class="sb-entry-remove" data-sb-cmd="remove-entry" data-week-id="${escapeAttr(
                  weekId
                )}" data-block-key="${escapeAttr(blockKey)}" data-entry-idx="${entryIdx}" title="Remove this entry">✕</button>`
              : ""
          }
        </div>
        <div class="sb-block-grid">
          <div>
            <label class="sb-mini">Start</label>
            <input data-sb-entry-field="startTime" value="${escapeAttr(
              entry.startTime || ""
            )}" placeholder="1900" />
          </div>
          <div>
            <label class="sb-mini">End</label>
            <input data-sb-entry-field="endTime" value="${escapeAttr(
              entry.endTime || ""
            )}" placeholder="1920" />
          </div>
          <div>
            <label class="sb-mini">Duration</label>
            <input data-sb-entry-field="durationLabel" value="${escapeAttr(
              entry.durationLabel || ""
            )}" placeholder="15m" />
          </div>
          <div>
            <label class="sb-mini" title="green = main training · cyan = safety / special · yellow = exam / leadership · none = plain">Highlight</label>
            <select data-sb-entry-field="highlightType" title="${escapeAttr(
              HIGHLIGHT_TITLES[entry.highlightType] || ""
            )}">${hlOpts}</select>
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Title</label>
            <input data-sb-entry-field="title" value="${escapeAttr(
              entry.title || ""
            )}" placeholder="Activity title" />
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Owner / Lead</label>
            <input data-sb-entry-field="owner" value="${escapeAttr(
              entry.owner || ""
            )}" placeholder="Lt. Smith, J" />
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Bullets (one per line)</label>
            <textarea data-sb-entry-field="bullets" rows="2">${escapeHtml(
              R().safeArray(entry.bullets).join("\n")
            )}</textarea>
          </div>
          <div class="sb-block-wide">
            <label class="sb-mini">Notes</label>
            <input data-sb-entry-field="notes" value="${escapeAttr(
              entry.notes || ""
            )}" />
          </div>
        </div>
      </div>`;
  }

  function renderBlockCellEditor(weekId, blockKey, label, block) {
    const entries = R().safeArray(block.entries);
    const list = entries.length ? entries : [block];
    return `
      <div class="sb-cell" data-week-id="${escapeAttr(weekId)}" data-block-key="${escapeAttr(
        blockKey
      )}">
        <div class="sb-cell-head">
          <strong>${escapeHtml(label)}</strong>
          <button type="button" class="sb-add-entry" data-sb-cmd="add-entry" data-week-id="${escapeAttr(
            weekId
          )}" data-block-key="${escapeAttr(blockKey)}">+ Add another entry</button>
        </div>
        <div class="sb-cell-entries">
          ${list
            .map((e, i) => renderEntryEditor(weekId, blockKey, i, e, list.length))
            .join("")}
        </div>
      </div>`;
  }

  function renderUniformCell(week) {
    const opts = UNIFORM_OPTIONS.map(
      (u) =>
        `<option value="${u}" ${week.uniform === u ? "selected" : ""}>${escapeHtml(u)}</option>`
    ).join("");
    const isCustom = week.uniform === "Custom";
    return `
      <div class="sb-uniform" data-week-id="${escapeAttr(week.id)}">
        <label class="sb-mini">Uniform</label>
        <select data-sb-week-field="uniform">${opts}</select>
        ${
          isCustom
            ? `<input class="sb-uniform-custom" data-sb-week-field="uniformCustom" placeholder="Custom uniform" value="${escapeAttr(
                week.uniformCustom || ""
              )}" />`
            : ""
        }
      </div>`;
  }

  /* ---- Grid Builder tab ---- */

  function renderGridDesktop() {
    const weeks = state.schedule.weeks;
    const colHeaders = weeks
      .map((w, i) => {
        const dateLabel = R().formatWeekDate(w.date);
        return `
          <th class="sb-grid-week-head">
            <div class="sb-grid-week-title">Week ${i + 1}${
              dateLabel ? " — " + escapeHtml(dateLabel) : ""
            }</div>
            <input type="date" class="sb-grid-week-date" data-sb-week-field="date" data-week-id="${escapeAttr(
              w.id
            )}" value="${escapeAttr(w.date || "")}" />
          </th>`;
      })
      .join("");

    const uniformRow = `
      <tr>
        <th class="sb-grid-row-label">Uniform</th>
        ${weeks
          .map((w) => `<td class="sb-grid-cell sb-grid-cell--uniform">${renderUniformCell(w)}</td>`)
          .join("")}
      </tr>`;

    const blockRows = BLOCK_ROWS.map(
      ({ key, label }) => `
        <tr>
          <th class="sb-grid-row-label">${escapeHtml(label)}</th>
          ${weeks
            .map(
              (w) =>
                `<td class="sb-grid-cell">${renderBlockCellEditor(
                  w.id,
                  key,
                  label,
                  w[key]
                )}</td>`
            )
            .join("")}
        </tr>`
    ).join("");

    return `
      <div class="sb-grid-scroll">
        <table class="sb-grid-table">
          <thead>
            <tr>
              <th class="sb-grid-row-label"></th>
              ${colHeaders}
            </tr>
          </thead>
          <tbody>
            ${uniformRow}
            ${blockRows}
          </tbody>
        </table>
      </div>`;
  }

  function renderGridMobile() {
    const weeks = state.schedule.weeks;
    if (!weeks.length) return "";
    const idx = Math.min(state.mobileActiveWeek, weeks.length - 1);
    const tabs = weeks
      .map((w, i) => {
        const dateLabel = R().formatWeekDate(w.date);
        return `<button type="button" class="sb-week-tab ${
          i === idx ? "sb-week-tab--active" : ""
        }" data-sb-mobile-week="${i}">Week ${i + 1}${
          dateLabel ? "<small>" + escapeHtml(dateLabel) + "</small>" : ""
        }</button>`;
      })
      .join("");
    const w = weeks[idx];
    const body = `
      <div class="sb-week-card">
        <div class="sb-week-card-head">
          <label class="sb-mini">Date</label>
          <input type="date" data-sb-week-field="date" data-week-id="${escapeAttr(
            w.id
          )}" value="${escapeAttr(w.date || "")}" />
        </div>
        ${renderUniformCell(w)}
        ${BLOCK_ROWS.map(
          ({ key, label }) =>
            `<details class="sb-mobile-block" open><summary>${escapeHtml(
              label
            )}</summary>${renderBlockCellEditor(w.id, key, label, w[key])}</details>`
        ).join("")}
      </div>`;
    return `
      <div class="sb-mobile-grid">
        <div class="sb-week-tabs">${tabs}</div>
        ${body}
      </div>`;
  }

  function renderGridTab() {
    return `
      <section class="card-info sb-section">
        <div class="sb-grid-head">
          <h3 class="card-info-title" style="margin:0;">Weekly grid</h3>
          <div class="sb-grid-tools">
            <button type="button" class="btn-outline" data-sb-cmd="defaults-all">Apply smart defaults to all weeks</button>
          </div>
        </div>
        <p class="page-intro">
          Each column is a week. Each row is the same as on the printed schedule
          (Uniform · Opening · Emphasis · Block #1 · Block #2 · Closing). Use
          <strong>+ Add another entry</strong> inside a block to stack multiple
          activities in the same cell.
        </p>
        <div class="sb-grid-wrapper sb-grid-desktop">${renderGridDesktop()}</div>
        <div class="sb-grid-wrapper sb-grid-mobile">${renderGridMobile()}</div>
      </section>
      <section class="card-info sb-section">
        <h3 class="card-info-title">Extras</h3>
        <label for="sbExtra">Extracurricular activities</label>
        <textarea id="sbExtra" rows="3" data-sb-header="extracurricularActivities">${escapeHtml(
          state.schedule.extracurricularActivities || ""
        )}</textarea>
        <label for="sbNotes">Announcements / additional notes</label>
        <textarea id="sbNotes" rows="3" data-sb-header="notes">${escapeHtml(
          state.schedule.notes || ""
        )}</textarea>
      </section>`;
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
      return `<p class="page-intro">No saved monthly schedules yet. Build one in <strong>Grid Builder</strong> and click <strong>Save Schedule</strong>.</p>`;
    }
    const canDelete = isAdminUser();
    const rows = state.savedList
      .map(
        (doc) => `
        <tr>
          <td>${escapeHtml(R().MONTH_NAMES[(doc.month - 1) % 12] || "")} ${escapeHtml(
            doc.year || ""
          )}</td>
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
            ${
              canDelete
                ? `<button type="button" class="sb-delete-btn" data-sb-saved="delete" data-sb-id="${escapeAttr(
                    doc.id
                  )}" title="Delete this schedule (admin only)">Delete</button>`
                : ""
            }
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

  function renderWarnings() {
    if (!state.warnings.length) return "";
    return `
      <div class="card-warning sb-warnings">
        <strong>Heads up:</strong>
        <ul>${state.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
      </div>`;
  }

  function render() {
    const root = document.getElementById("scheduleBuilderRoot");
    if (!root) return;
    let content = "";
    if (state.tab === "setup") content = renderSetupTab();
    else if (state.tab === "grid")
      content = renderWarnings() + renderGridTab();
    else if (state.tab === "preview") content = renderPreviewTab();
    else content = renderSavedTab();

    root.innerHTML = `
      ${renderHeroHeader()}
      ${state.notice ? `<div class="card-info sb-notice" role="status">${escapeHtml(state.notice)}</div>` : ""}
      ${renderTabs()}
      <div class="sb-tabpanel" role="tabpanel">${content}</div>`;

    bindEvents(root);
    updateStatusIndicator();
  }

  /* ---- Event wiring ---- */

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
      const tabGo = e.target.closest("[data-sb-tab-go]");
      if (tabGo) {
        state.tab = tabGo.dataset.sbTabGo;
        if (state.tab === "saved") loadSavedList().then(render);
        else render();
        return;
      }
      const mobileWeek = e.target.closest("[data-sb-mobile-week]");
      if (mobileWeek) {
        state.mobileActiveWeek = Number(mobileWeek.dataset.sbMobileWeek) || 0;
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
        } else if (c === "load-example") {
          loadTN170JuneExample();
        } else if (c === "add-entry") {
          addEntry(cmd.dataset.weekId, cmd.dataset.blockKey);
        } else if (c === "remove-entry") {
          removeEntry(
            cmd.dataset.weekId,
            cmd.dataset.blockKey,
            Number(cmd.dataset.entryIdx) || 0
          );
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
            state.tab = "grid";
            state.notice = "Cloned to a new draft.";
            markDirty();
            render();
          });
        } else if (action === "print") {
          loadSavedSchedule(id).then(() => openPrintWindow());
        } else if (action === "delete") {
          deleteSavedSchedule(id);
        }
      }
    });

    const handleEvent = (e) => {
      const headerInput = e.target.closest("[data-sb-header]");
      if (headerInput) {
        const field = headerInput.dataset.sbHeader;
        const value =
          headerInput.type === "number" ? +headerInput.value : headerInput.value;
        setHeader(field, value);
        return;
      }
      const audienceRow = e.target.closest("[data-sb-audience-idx]");
      if (audienceRow) {
        const idx = Number(audienceRow.dataset.sbAudienceIdx) || 0;
        const field = e.target.closest("[data-sb-audience-field]");
        if (!field) return;
        const fieldName = field.dataset.sbAudienceField;
        const value = field.type === "checkbox" ? field.checked : field.value;
        setAudienceField(idx, fieldName, value);
        // Re-render this audience row so the preview badge updates immediately.
        const labels = state.schedule.audienceLabels;
        const a = labels[idx];
        const badge = audienceRow.querySelector(".sb-audience-preview");
        if (badge) {
          badge.className = `sb-audience-preview sched-badge ${
            R().HIGHLIGHT_BADGE_CLASSES[a.highlightType] || "sched-badge--plain"
          }`;
          badge.textContent = a.label || "—";
        }
        return;
      }
      const weekField = e.target.closest("[data-sb-week-field]");
      if (weekField) {
        const weekId =
          weekField.dataset.weekId ||
          weekField.closest("[data-week-id]")?.dataset.weekId;
        if (!weekId) return;
        const fieldName = weekField.dataset.sbWeekField;
        setWeekField(weekId, fieldName, weekField.value);
        // Switching the uniform select to/from Custom changes which inputs are
        // shown, so re-render only when that flips.
        if (fieldName === "uniform") render();
        return;
      }
      const entryField = e.target.closest("[data-sb-entry-field]");
      if (entryField) {
        const entry = entryField.closest("[data-entry-idx]");
        const cell = entryField.closest("[data-block-key]");
        if (!entry || !cell) return;
        setEntryField(
          cell.dataset.weekId,
          cell.dataset.blockKey,
          Number(entry.dataset.entryIdx) || 0,
          entryField.dataset.sbEntryField,
          entryField.value
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
      <link rel="stylesheet" href="${global.location.origin}/css/print-export.css?v=7" />
      <link rel="stylesheet" href="${global.location.origin}/css/print-contrast.css?v=1" />
    </head><body class="sb-print-body">
      <main class="print-page">${html}</main>
      <script>setTimeout(function(){ window.print(); }, 350);<\/script>
    </body></html>`);
    w.document.close();
  }

  /* ---- Styles ---- */

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
      .sb-audience-row {
        display:grid;
        grid-template-columns: 90px 1fr 130px 130px;
        gap: 10px; align-items:center; margin-bottom: 6px;
      }
      .sb-audience-toggle { gap: 4px; }
      .sb-audience-toggle-label { margin: 0; }
      .sb-audience-label { width: 100%; }
      .sb-audience-preview { justify-self:start; }
      .sb-check { display:flex; align-items:center; gap:6px; font-weight: 500; }
      .sb-check input { width: auto; }
      .sb-help { margin-top: 16px; }
      .sb-help-actions { display:flex; flex-wrap:wrap; gap: 10px; }
      .sb-mini { display:block; font-size:0.78rem; color: var(--tn-ink-dim, #6b7280); font-weight:600; margin-bottom:4px; }
      .sb-grid-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 10px; margin-bottom: 10px; }

      .sb-grid-scroll { overflow-x: auto; }
      .sb-grid-table {
        width:100%; border-collapse: separate; border-spacing: 0;
        font-size: 0.85rem; table-layout: fixed;
      }
      .sb-grid-table th, .sb-grid-table td {
        border: 1px solid var(--tn-line, #d1d5db);
        padding: 6px 8px; vertical-align: top;
        background: #fff;
      }
      .sb-grid-row-label {
        font-weight: 700; background: #f3f4f6;
        width: 110px; text-align: center; vertical-align: middle;
        position: sticky; left: 0; z-index: 2;
      }
      .sb-grid-week-head { background: #f3f4f6; text-align: center; font-weight:600; }
      .sb-grid-week-title { margin-bottom: 4px; }
      .sb-grid-week-date { width: 100%; font-size: 0.8rem; }
      .sb-grid-cell { min-width: 220px; }
      .sb-grid-cell--uniform { background: rgba(15,23,42,0.02); }

      .sb-uniform { display:flex; flex-direction: column; gap: 4px; }
      .sb-uniform-custom { margin-top: 4px; }

      .sb-cell { display:flex; flex-direction: column; gap: 6px; }
      .sb-cell-head {
        display:flex; align-items:center; justify-content:space-between;
        gap: 6px; font-size: 0.78rem; color: var(--tn-ink-dim, #6b7280);
      }
      .sb-cell-head strong { font-size: 0.8rem; color: var(--tn-ink-bold, #0f172a); }
      .sb-add-entry {
        background: transparent; border: 1px dashed var(--tn-line, #d1d5db);
        color: var(--tn-ink-dim, #4b5563); border-radius: 6px;
        padding: 2px 8px; font-size: 0.75rem; cursor: pointer;
      }
      .sb-add-entry:hover { color: var(--tn-ink-bold, #0f172a); border-style: solid; }
      .sb-cell-entries { display:flex; flex-direction: column; gap: 6px; }
      .sb-entry {
        border: 1px solid var(--tn-line, #e5e7eb); border-radius: 8px;
        padding: 6px 8px; background: rgba(15,23,42,0.02);
      }
      .sb-entry-head {
        display:flex; justify-content:space-between; align-items:center;
        margin-bottom: 4px;
      }
      .sb-entry-tag {
        font-size: 0.7rem; color: var(--tn-ink-dim, #6b7280); font-weight: 600;
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .sb-entry-remove {
        background: transparent; border: 0; color: #b91c1c; cursor: pointer;
        font-size: 0.9rem; line-height: 1; padding: 2px 6px;
      }
      .sb-block-grid {
        display:grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      }
      .sb-block-grid input, .sb-block-grid select, .sb-block-grid textarea {
        font-size: 0.78rem; padding: 4px 6px;
      }
      .sb-block-wide { grid-column: 1 / -1; }

      .sb-warnings { margin-bottom: 14px; }
      .sb-warnings ul { margin: 8px 0 0 20px; padding: 0; }
      .sb-preview-page { color: #111; }
      .sb-saved-table { width:100%; }
      .sb-saved-table th, .sb-saved-table td { padding: 10px 12px; vertical-align: middle; }
      .sb-saved-table .btn-outline { margin-right: 6px; margin-bottom: 4px; }
      .sb-delete-btn {
        background: transparent; border: 1px solid #fecaca;
        color: #b91c1c; border-radius: 8px; padding: 8px 12px;
        font-size: 0.85rem; font-weight: 600; cursor: pointer;
        margin-right: 6px; margin-bottom: 4px;
      }
      .sb-delete-btn:hover {
        background: #fef2f2; border-color: #fca5a5;
      }
      .sb-notice { margin: 12px 0; }

      .sb-grid-mobile { display: none; }
      .sb-week-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 10px; }
      .sb-week-tab {
        background: transparent; border: 1px solid var(--tn-line, #d1d5db);
        padding: 8px 12px; border-radius: 999px; font-weight: 600; cursor: pointer;
        display:flex; flex-direction: column; align-items: center; gap: 2px;
      }
      .sb-week-tab small { font-size: 0.72rem; color: var(--tn-ink-dim, #6b7280); font-weight: 500; }
      .sb-week-tab--active {
        background: var(--tn-gold, #c8a14a); color: var(--tn-ink-bold, #0f172a);
        border-color: var(--tn-gold, #c8a14a);
      }
      .sb-week-tab--active small { color: rgba(15,23,42,0.7); }
      .sb-week-card { display:flex; flex-direction: column; gap: 10px; }
      .sb-week-card-head { display:flex; flex-direction: column; gap: 4px; }
      .sb-mobile-block { border: 1px solid var(--tn-line, #e5e7eb); border-radius: 10px; padding: 10px; background: #fff; }
      .sb-mobile-block summary { font-weight: 600; cursor: pointer; }

      @media (max-width: 960px) {
        .sb-grid-desktop { display: none; }
        .sb-grid-mobile { display: block; }
        .sb-block-grid { grid-template-columns: repeat(2, 1fr); }
        .sb-audience-row { grid-template-columns: 80px 1fr; row-gap: 4px; }
        .sb-audience-row .sb-audience-hl,
        .sb-audience-row .sb-audience-preview { grid-column: 1 / -1; }
      }
      @media (max-width: 540px) {
        .sb-block-grid { grid-template-columns: 1fr; }
      }`;
    const style = document.createElement("style");
    style.id = "sbStyleTag";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /**
   * Cross-page deep link support: the Calendar's "Open in builder" link
   * passes `?month=YYYY-MM` (and optionally `?id=<docId>`) so we can land
   * the user directly on the matching schedule. Falls back silently.
   */
  function parseDeepLink() {
    try {
      const params = new URLSearchParams(global.location?.search || "");
      const id = params.get("id") || "";
      const monthRaw = params.get("month") || "";
      const m = monthRaw.match(/^(\d{4})-(\d{2})$/);
      const monthKey = m ? { year: Number(m[1]), month: Number(m[2]) } : null;
      return { id, monthKey };
    } catch {
      return { id: "", monthKey: null };
    }
  }

  async function applyDeepLink({ id, monthKey }) {
    const ms = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!ms) return false;
    if (id) {
      const { data } = await ms.get(id);
      if (data) {
        state.schedule = normalizeLoaded(data);
        state.tab = "grid";
        state.saveStatus = "saved";
        return true;
      }
    }
    if (monthKey) {
      const { data } = await ms.list({
        order: { field: "updatedAt", asc: false },
        limit: 50,
      });
      const match = (data || []).find(
        (d) => Number(d.month) === monthKey.month && Number(d.year) === monthKey.year
      );
      if (match) {
        state.schedule = normalizeLoaded(match);
        state.tab = "grid";
        state.saveStatus = "saved";
        return true;
      }
      // No saved doc for that month yet — open the builder pre-pointed at
      // it so the user can start fresh on the right month/year.
      state.schedule = R().defaultMonthlySchedule(monthKey.year, monthKey.month);
      state.tab = "setup";
      state.saveStatus = "idle";
      return true;
    }
    return false;
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
    const deep = parseDeepLink();
    let appliedDeep = false;
    if (deep.id || deep.monthKey) {
      try {
        appliedDeep = await applyDeepLink(deep);
      } catch (err) {
        console.warn("[schedule-builder] deep link failed", err);
      }
    }
    if (!appliedDeep) {
      const draft = loadDraft();
      state.schedule = draft ? normalizeLoaded(draft) : R().defaultMonthlySchedule();
      if (draft) state.notice = "Restored your unsaved draft from this device.";
    } else if (deep.monthKey) {
      state.notice = `Opened ${R().MONTH_NAMES[deep.monthKey.month - 1]} ${deep.monthKey.year} schedule.`;
    }
    state.warnings = R().validateSchedule(state.schedule);
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
    deleteSavedSchedule,
    loadTN170JuneExample,
  };

  if (document.getElementById("scheduleBuilderRoot")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
