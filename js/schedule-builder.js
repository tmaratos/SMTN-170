/**
 * TN-170 Meeting Schedule — guided step builder + Firestore meetings collection.
 *
 * Data model (extended for print/PDF export, backward-compatible with legacy):
 *   schedules/{month_key} {
 *     month_key, template_name, payload: {
 *       scheduleTitle, audienceLabels: ["BCT","Flights","All Cadets","Parents"],
 *       weeks: [{
 *         label, date, uniform,
 *         opening:  { startTime, endTime, title, owner, notes, highlightType },
 *         emphasis: { startTime, endTime, durationLabel, title, owner, notes, highlightType },
 *         block1:   { startTime, endTime, title, owner, notes, highlightType },
 *         block2:   { startTime, endTime, title, owner, notes, highlightType },
 *         closing:  { startTime, endTime, title, owner, notes, highlightType }
 *       }, ...],
 *       extracurricularNote: "5th Night Fun Night (June 30th), NESA (June 21st-27th)",
 *       extras: legacy free-text notes
 *     }
 *   }
 *
 * Legacy payloads (plain strings per cell) still load: the builder transparently
 * promotes them to the extended cell shape on first edit. The print view applies
 * sensible default times if any are missing.
 */
(function initScheduleBuilder(global) {
  const STEPS = ["month", "template", "weeks", "preview", "save"];
  const STEP_LABELS = {
    month: "1. Month",
    template: "2. Template",
    weeks: "3. Weekly plan",
    preview: "4. Preview",
    save: "5. Save",
  };

  const CELL_SLOTS = ["opening", "emphasis", "block1", "block2", "closing"];
  const SLOT_LABEL = {
    opening: "Opening",
    emphasis: "Emphasis",
    block1: "Block #1",
    block2: "Block #2",
    closing: "Closing",
  };

  const DEFAULT_TIMES = {
    opening:  { startTime: "1900", endTime: "1905" },
    emphasis: { startTime: "1905", endTime: "1920" },
    block1:   { startTime: "1920", endTime: "2005" },
    block2:   { startTime: "2010", endTime: "2050" },
    closing:  { startTime: "2050", endTime: "2100" },
  };

  const HIGHLIGHT_OPTS = [
    { value: "none", label: "None" },
    { value: "green", label: "Green — main activity" },
    { value: "cyan", label: "Cyan — safety / special" },
    { value: "yellow", label: "Yellow — testing / leadership" },
  ];

  const DEFAULT_AUDIENCE_LABELS = ["BCT", "Flights", "All Cadets", "Parents"];

  function makeCell(slot, title, owner) {
    return {
      startTime: DEFAULT_TIMES[slot]?.startTime || "",
      endTime: DEFAULT_TIMES[slot]?.endTime || "",
      durationLabel: "",
      title: title || "",
      owner: owner || "",
      notes: "",
      highlightType: "none",
    };
  }

  function buildTemplateWeeks(weekSeeds) {
    return weekSeeds.map((seed) => ({
      label: "",
      date: "",
      uniform: seed.uniform || "",
      opening: makeCell("opening", seed.opening, ""),
      emphasis: makeCell("emphasis", seed.emphasis, ""),
      block1: makeCell("block1", seed.block1, ""),
      block2: makeCell("block2", seed.block2, ""),
      closing: makeCell("closing", seed.closing, ""),
    }));
  }

  const TEMPLATES = {
    cadet: {
      name: "Monthly Cadet Meeting Schedule",
      weeks: buildTemplateWeeks([
        { uniform: "PT", opening: "Anthem & formation", emphasis: "Calisthenics / fitness", block1: "CPFT", block2: "Aerospace education", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Safety briefing", block1: "CAP communications", block2: "Drill & ceremonies", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Leadership block", block1: "AE / STEM", block2: "Character development", closing: "Announcements" },
        { uniform: "Blues", opening: "Anthem", emphasis: "Cadet council / awards", block1: "Drill", block2: "Guest speaker or service", closing: "Announcements" },
      ]),
    },
    senior: {
      name: "Senior Member Training Month",
      weeks: buildTemplateWeeks([
        { uniform: "Blues", opening: "Call to order", emphasis: "Safety moment", block1: "Commander remarks", block2: "Directorate updates", closing: "Training sign-ups" },
        { uniform: "Blues", opening: "Call to order", emphasis: "ES training", block1: "GTM / ICS", block2: "SUI prep", closing: "Announcements" },
        { uniform: "Blues", opening: "Call to order", emphasis: "AE night", block1: "AEX", block2: "STEM planning", closing: "Announcements" },
        { uniform: "Blues", opening: "Call to order", emphasis: "BFR / staff", block1: "Department reviews", block2: "Open forum", closing: "Announcements" },
      ]),
    },
    ae: {
      name: "Aerospace Education Month",
      weeks: buildTemplateWeeks([
        { uniform: "ABU", opening: "Anthem", emphasis: "AE theme intro", block1: "AEX module", block2: "Model rocketry", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "STEM night", block1: "Hands-on lab", block2: "Guest aerospace speaker", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Cyber / drones", block1: "sUAS safety", block2: "Planning field trip", closing: "Announcements" },
        { uniform: "Blues", opening: "Anthem", emphasis: "AE awards", block1: "Quiz bowl", block2: "Showcase projects", closing: "Announcements" },
      ]),
    },
  };

  let state = {
    step: 0,
    monthKey: new Date().toISOString().slice(0, 7),
    templateKey: "senior",
    weeks: [],
    extras: "",
    scheduleTitle: "",
    audienceLabels: [...DEFAULT_AUDIENCE_LABELS],
    extracurricularNote: "",
    scheduleId: null,
  };

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function monthLabel(key) {
    try {
      const [y, m] = key.split("-");
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } catch {
      return key;
    }
  }

  function tuesdayDatesForMonth(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return [];
    const out = [];
    const date = new Date(y, m - 1, 1);
    while (date.getMonth() === m - 1 && out.length < 5) {
      if (date.getDay() === 2) out.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return out;
  }

  function formatShortDate(d) {
    if (!d) return "";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function autoLabelWeeks(weeks, monthKey) {
    const tuesdays = tuesdayDatesForMonth(monthKey);
    return weeks.map((w, i) => {
      const tuesday = tuesdays[i] || null;
      if (!w.label) w.label = `Week ${i + 1}${tuesday ? " - " + formatShortDate(tuesday) : ""}`;
      if (!w.date && tuesday) w.date = tuesday.toISOString().slice(0, 10);
      return w;
    });
  }

  function defaultWeeks(key) {
    const weeks = JSON.parse(JSON.stringify(TEMPLATES[key]?.weeks || TEMPLATES.senior.weeks));
    return autoLabelWeeks(weeks, state.monthKey);
  }

  /**
   * Promote a legacy week (string-valued cells) into the extended cell shape.
   * Idempotent — already-structured weeks pass through.
   */
  function normalizeWeek(week, i, monthKey) {
    if (!week) week = {};
    const out = {
      label: week.label || "",
      date: week.date || "",
      uniform: typeof week.uniform === "string" ? week.uniform : week.uniform?.title || "",
    };
    CELL_SLOTS.forEach((slot) => {
      const raw = week[slot];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        out[slot] = {
          startTime: raw.startTime || DEFAULT_TIMES[slot]?.startTime || "",
          endTime: raw.endTime || DEFAULT_TIMES[slot]?.endTime || "",
          durationLabel: raw.durationLabel || "",
          title: raw.title || "",
          owner: raw.owner || "",
          notes: raw.notes || "",
          highlightType: raw.highlightType || "none",
        };
      } else {
        out[slot] = makeCell(slot, typeof raw === "string" ? raw : "");
      }
    });
    autoLabelWeeks([out], monthKey);
    return out;
  }

  async function loadSchedule(monthKey) {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) return null;
    const { data } = await sb.from("schedules").select("*").eq("month_key", monthKey).maybeSingle();
    return data;
  }

  async function saveSchedule() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    const uid = global.SMTN170Auth?.actorId?.();
    const now = new Date().toISOString();
    const payload = {
      scheduleTitle: state.scheduleTitle || TEMPLATES[state.templateKey]?.name || "Monthly Cadet Meeting Schedule",
      audienceLabels: state.audienceLabels?.length ? state.audienceLabels : [...DEFAULT_AUDIENCE_LABELS],
      weeks: state.weeks,
      extras: state.extras,
      extracurricularNote: state.extracurricularNote,
      templateKey: state.templateKey,
    };
    const row = {
      id: state.monthKey,
      month_key: state.monthKey,
      template_name: payload.scheduleTitle,
      payload,
      updated_at: now,
      last_worked_at: now,
      last_worked_by: uid,
      updated_by: uid,
    };
    if (!sb) {
      localStorage.setItem("smtn170_schedule_" + state.monthKey, JSON.stringify(row));
      alert("Schedule saved locally (connect Firebase for squadron workspace).");
      return;
    }
    const { error } = await sb.from("schedules").upsert(row, { onConflict: "month_key" });
    if (error) throw error;
    alert("Meeting schedule saved for " + monthLabel(state.monthKey) + ".");
  }

  /** Open the standalone print/PDF document view for the current month. */
  function openPrintView(extraQuery) {
    const month = encodeURIComponent(state.monthKey);
    const query = "?month=" + month + (extraQuery ? "&" + extraQuery : "");
    const url = "./schedule-print.html" + query;
    const w = global.open(url, "_blank", "noopener");
    if (!w) alert("Allow pop-ups to open the print view.");
    return w;
  }

  function previewPrintSchedule() {
    return openPrintView("autoprint=0");
  }
  function printSchedule() {
    return openPrintView();
  }
  function exportSchedulePdf() {
    return openPrintView();
  }

  function renderPreviewHtml() {
    const w = state.weeks;
    const rows = [
      ["Uniform", ...w.map((x) => x.uniform || "")],
      ["Opening", ...w.map((x) => x.opening?.title || "")],
      ["Emphasis", ...w.map((x) => x.emphasis?.title || "")],
      ["Block #1", ...w.map((x) => x.block1?.title || "")],
      ["Block #2", ...w.map((x) => x.block2?.title || "")],
      ["Closing", ...w.map((x) => x.closing?.title || "")],
    ];
    const head = w.map((x, i) => `<th>${escapeHtml(x.label || "Week " + (i + 1))}</th>`).join("");
    const body = rows
      .map((r) => `<tr><td><strong>${escapeHtml(r[0])}</strong></td>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    return `
      <div class="sched-preview-doc print-card" id="schedulePrintArea">
        <h2>TN-170 · ${escapeHtml(monthLabel(state.monthKey))}</h2>
        <p>${escapeHtml(state.scheduleTitle || TEMPLATES[state.templateKey]?.name || "Schedule")}</p>
        <table class="sched-preview-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>
        ${state.extracurricularNote ? `<p><strong>Extracurricular Activities:</strong> ${escapeHtml(state.extracurricularNote)}</p>` : ""}
        ${state.extras ? `<p><strong>Notes:</strong> ${escapeHtml(state.extras)}</p>` : ""}
      </div>`;
  }

  function renderCellEditor(weekIdx, slot, cell) {
    const hlOpts = HIGHLIGHT_OPTS.map(
      (h) => `<option value="${h.value}" ${cell.highlightType === h.value ? "selected" : ""}>${escapeHtml(h.label)}</option>`
    ).join("");
    return `
      <fieldset class="sched-cell-edit" data-week="${weekIdx}" data-slot="${slot}" style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;margin-top:6px">
        <legend style="font-weight:600;font-size:0.85rem">${escapeHtml(SLOT_LABEL[slot])}</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <label style="font-size:0.78rem">Start time
            <input type="text" data-week="${weekIdx}" data-slot="${slot}" data-field="startTime" value="${escapeHtml(cell.startTime)}" placeholder="1900" />
          </label>
          <label style="font-size:0.78rem">End time
            <input type="text" data-week="${weekIdx}" data-slot="${slot}" data-field="endTime" value="${escapeHtml(cell.endTime)}" placeholder="1905" />
          </label>
        </div>
        <label style="font-size:0.78rem">Activity title
          <input type="text" data-week="${weekIdx}" data-slot="${slot}" data-field="title" value="${escapeHtml(cell.title)}" />
        </label>
        <label style="font-size:0.78rem">Owner / responsible
          <input type="text" data-week="${weekIdx}" data-slot="${slot}" data-field="owner" value="${escapeHtml(cell.owner)}" placeholder="Person or unit" />
        </label>
        <label style="font-size:0.78rem">Highlight
          <select data-week="${weekIdx}" data-slot="${slot}" data-field="highlightType">${hlOpts}</select>
        </label>
        <label style="font-size:0.78rem">Notes
          <input type="text" data-week="${weekIdx}" data-slot="${slot}" data-field="notes" value="${escapeHtml(cell.notes)}" />
        </label>
      </fieldset>`;
  }

  function renderStepContent() {
    const step = STEPS[state.step];
    if (step === "month") {
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Which month are you planning?</h3>
          <label for="schedMonthPick">Meeting month</label>
          <input type="month" id="schedMonthPick" value="${escapeHtml(state.monthKey)}" />
          <label for="schedTitle" style="margin-top:10px">Schedule title (shown on the printed document)</label>
          <input type="text" id="schedTitle" value="${escapeHtml(state.scheduleTitle)}" placeholder="Monthly Cadet Meeting Schedule" />
          <label for="schedExtracurricular" style="margin-top:10px">Extracurricular activities note</label>
          <input type="text" id="schedExtracurricular" value="${escapeHtml(state.extracurricularNote)}" placeholder="5th Night Fun Night (June 30th), NESA (June 21st-27th)" />
          <p class="page-intro" style="margin-top:12px">Pick the month for your weekly squadron meeting plan.</p>
        </div>`;
    }
    if (step === "template") {
      const opts = Object.keys(TEMPLATES)
        .map(
          (k) =>
            `<label class="sched-template-opt card-info" style="display:block;margin-bottom:12px;cursor:pointer">
              <input type="radio" name="schedTpl" value="${k}" ${state.templateKey === k ? "checked" : ""} style="width:auto;margin-right:10px" />
              <strong>${escapeHtml(TEMPLATES[k].name)}</strong>
            </label>`
        )
        .join("");
      return `<div class="sched-step-card"><h3 class="card-info-title">Choose a starting template</h3>${opts}</div>`;
    }
    if (step === "weeks") {
      const cards = state.weeks
        .map(
          (wk, i) => `
        <div class="sched-week-card">
          <h4>${escapeHtml(wk.label || "Week " + (i + 1))}</h4>
          <label>Label / date (e.g. "Week 1 - 6/2")</label>
          <input data-week="${i}" data-field="label" value="${escapeHtml(wk.label)}" />
          <label>Uniform</label>
          <input data-week="${i}" data-field="uniform" value="${escapeHtml(wk.uniform)}" />
          ${CELL_SLOTS.map((slot) => renderCellEditor(i, slot, wk[slot])).join("")}
        </div>`
        )
        .join("");
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Fill in each meeting week</h3>
          <p class="page-intro">Set uniforms, activity titles, times, owners, and color highlights for each block.</p>
          <label for="schedAudience">Audience labels (comma-separated, shown as colored badges)</label>
          <input id="schedAudience" type="text" value="${escapeHtml((state.audienceLabels || []).join(", "))}" placeholder="BCT, Flights, All Cadets, Parents" />
          <label for="schedExtras" style="margin-top:10px">Free-text notes (legacy)</label>
          <textarea id="schedExtras" rows="2">${escapeHtml(state.extras)}</textarea>
        </div>
        <div class="sched-week-grid">${cards}</div>`;
    }
    if (step === "preview") return `<div class="sched-step-card">${renderPreviewHtml()}</div>`;
    if (step === "save") {
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Save to squadron workspace</h3>
          <p>Everyone approved can view this schedule after you save.</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button type="button" class="btn-gold btn-lg" data-sched-action="save">Save schedule</button>
            <button type="button" class="btn-outline btn-lg" data-sched-action="preview-print">Preview Print Schedule</button>
            <button type="button" class="btn-outline btn-lg" data-sched-action="print">Print Schedule</button>
            <button type="button" class="btn-outline btn-lg" data-sched-action="export-pdf">Export Schedule PDF</button>
          </div>
        </div>
        ${renderPreviewHtml()}`;
    }
    return "";
  }

  function renderToolbar() {
    return `
      <div class="sched-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <button type="button" class="btn-gold" data-sched-action="create-monthly" data-steward-action="create" data-steward-label="Create Monthly Schedule" data-steward-help="Start a new monthly meeting schedule">Create Monthly Schedule</button>
        <button type="button" class="btn-outline" data-sched-action="edit-monthly" data-steward-action="edit" data-steward-label="Edit Monthly Schedule" data-steward-help="Edit the current monthly meeting schedule">Edit Monthly Schedule</button>
        <button type="button" class="btn-outline" data-sched-action="preview-print" data-steward-action="preview" data-steward-label="Preview Print Schedule" data-steward-help="Open the print view without auto-printing">Preview Print Schedule</button>
        <button type="button" class="btn-outline" data-sched-action="print" data-steward-action="print" data-steward-label="Print Schedule" data-steward-help="Open the print view and print">Print Schedule</button>
        <button type="button" class="btn-outline" data-sched-action="export-pdf" data-steward-action="export" data-steward-label="Export Schedule PDF" data-steward-help="Open the print view to save as PDF">Export Schedule PDF</button>
      </div>`;
  }

  function render() {
    const root = document.getElementById("scheduleBuilderRoot");
    if (!root) return;

    const pills = STEPS.map((s, i) => {
      const cls = i === state.step ? "active" : i < state.step ? "done" : "";
      return `<button type="button" class="sched-step-pill ${cls}" data-sched-step="${i}">${STEP_LABELS[s]}</button>`;
    }).join("");

    root.innerHTML = `
      <div class="sched-wizard">
        <header class="card-info">
          <h2 style="margin:0 0 8px;font-size:1.35rem">Meeting schedule builder</h2>
          <p class="page-intro" style="margin:0">Step-by-step plan for the month — no spreadsheets required.</p>
          ${renderToolbar()}
          <div class="sched-steps" style="margin-top:16px">${pills}</div>
        </header>
        <div data-steward-context="schedule"></div>
        <button type="button" class="btn-outline btn-lg" data-steward-ask="Help me build this month's squadron meeting schedule with uniforms and training nights.">Generate with Steward</button>
        <div id="schedStepBody">${renderStepContent()}</div>
        <div class="sched-nav-actions">
          <button type="button" class="ghost-btn btn-lg" data-sched-nav="back" ${state.step === 0 ? "disabled" : ""}>Back</button>
          <button type="button" class="btn-gold btn-lg" data-sched-nav="next">${state.step === STEPS.length - 1 ? "Done" : "Next step"}</button>
        </div>
      </div>`;

    global.SMTN170Pages?.injectStewardContexts?.();
    global.SMTN170Pages?.bindStewardContextActions?.();

    root.querySelector("#schedMonthPick")?.addEventListener("change", (e) => {
      state.monthKey = e.target.value;
      state.weeks = autoLabelWeeks(state.weeks, state.monthKey);
    });
    root.querySelector("#schedTitle")?.addEventListener("input", (e) => {
      state.scheduleTitle = e.target.value;
    });
    root.querySelector("#schedExtracurricular")?.addEventListener("input", (e) => {
      state.extracurricularNote = e.target.value;
    });
    root.querySelector("#schedAudience")?.addEventListener("input", (e) => {
      state.audienceLabels = e.target.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    });
    root.querySelectorAll("[name=schedTpl]").forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) {
          state.templateKey = r.value;
          state.weeks = defaultWeeks(state.templateKey);
          state.scheduleTitle = state.scheduleTitle || TEMPLATES[state.templateKey]?.name || "";
        }
      });
    });
    root.querySelector("#schedExtras")?.addEventListener("input", (e) => {
      state.extras = e.target.value;
    });

    root.querySelectorAll("[data-week][data-slot][data-field]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = +inp.dataset.week;
        const slot = inp.dataset.slot;
        const field = inp.dataset.field;
        const w = state.weeks[i];
        if (!w || !w[slot]) return;
        w[slot][field] = inp.value;
      });
      inp.addEventListener("change", () => {
        const i = +inp.dataset.week;
        const slot = inp.dataset.slot;
        const field = inp.dataset.field;
        const w = state.weeks[i];
        if (!w || !w[slot]) return;
        w[slot][field] = inp.value;
      });
    });

    root.querySelectorAll("[data-week][data-field]:not([data-slot])").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = +inp.dataset.week;
        const f = inp.dataset.field;
        if (state.weeks[i]) state.weeks[i][f] = inp.value;
      });
    });

    root.querySelectorAll("[data-sched-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.step = +btn.dataset.schedStep;
        render();
      });
    });

    root.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-sched-nav]");
      if (nav) {
        if (nav.dataset.schedNav === "back" && state.step > 0) state.step--;
        if (nav.dataset.schedNav === "next" && state.step < STEPS.length - 1) state.step++;
        render();
      }
      const act = e.target.closest("[data-sched-action]");
      const action = act?.dataset.schedAction;
      if (!action) return;
      if (action === "save") saveSchedule().catch((err) => alert(err.message));
      else if (action === "preview-print") previewPrintSchedule();
      else if (action === "print") printSchedule();
      else if (action === "export-pdf") exportSchedulePdf();
      else if (action === "create-monthly") {
        if (!state.weeks?.length || confirm("Start a fresh schedule for " + monthLabel(state.monthKey) + "?")) {
          state.weeks = defaultWeeks(state.templateKey);
          state.scheduleTitle = state.scheduleTitle || TEMPLATES[state.templateKey]?.name || "";
          state.step = 0;
          render();
        }
      } else if (action === "edit-monthly") {
        state.step = 2;
        render();
      }
    });
  }

  async function init() {
    state.weeks = defaultWeeks(state.templateKey);
    const saved = await loadSchedule(state.monthKey);
    if (saved?.payload) {
      const p = saved.payload;
      state.weeks = (p.weeks || []).map((w, i) => normalizeWeek(w, i, state.monthKey));
      if (!state.weeks.length) state.weeks = defaultWeeks(state.templateKey);
      state.extras = p.extras || "";
      state.templateKey = p.templateKey || state.templateKey;
      state.scheduleTitle = p.scheduleTitle || saved.template_name || "";
      state.audienceLabels = Array.isArray(p.audienceLabels) && p.audienceLabels.length ? p.audienceLabels : [...DEFAULT_AUDIENCE_LABELS];
      state.extracurricularNote = p.extracurricularNote || "";
      state.scheduleId = saved.id;
    }
    render();
    global.SMTN170Firebase?.subscribeTable?.("schedules", null, async () => {
      const s = await loadSchedule(state.monthKey);
      if (s?.payload) {
        state.weeks = (s.payload.weeks || []).map((w, i) => normalizeWeek(w, i, state.monthKey));
        render();
      }
    });
  }

  global.SMTN170ScheduleBuilder = {
    init,
    render,
    previewPrintSchedule,
    printSchedule,
    exportSchedulePdf,
    DEFAULT_TIMES,
    DEFAULT_AUDIENCE_LABELS,
  };

  if (document.getElementById("scheduleBuilderRoot")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
