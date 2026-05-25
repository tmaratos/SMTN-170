/**
 * TN-170 Meeting Schedule — guided step builder + Supabase schedules table.
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

  const TEMPLATES = {
    cadet: {
      name: "Monthly Cadet Meeting Schedule",
      weeks: [
        { uniform: "PT", opening: "Anthem & formation", emphasis: "Calisthenics / fitness", block1: "CPFT", block2: "Aerospace education", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Safety briefing", block1: "CAP communications", block2: "Drill & ceremonies", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Leadership block", block1: "AE / STEM", block2: "Character development", closing: "Announcements" },
        { uniform: "Blues", opening: "Anthem", emphasis: "Cadet council / awards", block1: "Drill", block2: "Guest speaker or service", closing: "Announcements" },
      ],
    },
    senior: {
      name: "Senior Member Training Month",
      weeks: [
        { uniform: "Blues", opening: "Call to order", emphasis: "Safety moment", block1: "Commander remarks", block2: "Directorate updates", closing: "Training sign-ups" },
        { uniform: "Blues", opening: "Call to order", emphasis: "ES training", block1: "GTM / ICS", block2: "SUI prep", closing: "Announcements" },
        { uniform: "Blues", opening: "Call to order", emphasis: "AE night", block1: "AEX", block2: "STEM planning", closing: "Announcements" },
        { uniform: "Blues", opening: "Call to order", emphasis: "BFR / staff", block1: "Department reviews", block2: "Open forum", closing: "Announcements" },
      ],
    },
    ae: {
      name: "Aerospace Education Month",
      weeks: [
        { uniform: "ABU", opening: "Anthem", emphasis: "AE theme intro", block1: "AEX module", block2: "Model rocketry", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "STEM night", block1: "Hands-on lab", block2: "Guest aerospace speaker", closing: "Announcements" },
        { uniform: "ABU", opening: "Anthem", emphasis: "Cyber / drones", block1: "sUAS safety", block2: "Planning field trip", closing: "Announcements" },
        { uniform: "Blues", opening: "Anthem", emphasis: "AE awards", block1: "Quiz bowl", block2: "Showcase projects", closing: "Announcements" },
      ],
    },
  };

  let state = {
    step: 0,
    monthKey: new Date().toISOString().slice(0, 7),
    templateKey: "senior",
    weeks: [],
    extras: "",
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

  function defaultWeeks(key) {
    return JSON.parse(JSON.stringify(TEMPLATES[key]?.weeks || TEMPLATES.senior.weeks));
  }

  async function loadSchedule(monthKey) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return null;
    const { data } = await sb.from("schedules").select("*").eq("month_key", monthKey).maybeSingle();
    return data;
  }

  async function saveSchedule() {
    const sb = global.SMTN170Supabase?.getClient?.();
    const uid = global.SMTN170Auth?.actorId?.();
    const now = new Date().toISOString();
    const payload = {
      weeks: state.weeks,
      extras: state.extras,
      templateKey: state.templateKey,
    };
    const row = {
      month_key: state.monthKey,
      template_name: TEMPLATES[state.templateKey]?.name || "Custom",
      payload,
      updated_at: now,
      last_worked_at: now,
      last_worked_by: uid,
      updated_by: uid,
    };
    if (!sb) {
      localStorage.setItem("smtn170_schedule_" + state.monthKey, JSON.stringify(row));
      alert("Schedule saved locally (connect Supabase for squadron workspace).");
      return;
    }
    const { error } = await sb.from("schedules").upsert(row, { onConflict: "month_key" });
    if (error) throw error;
    alert("Meeting schedule saved for " + monthLabel(state.monthKey) + ".");
  }

  function renderPreviewHtml() {
    const w = state.weeks;
    const rows = [
      ["Uniform", ...w.map((x) => x.uniform)],
      ["Opening", ...w.map((x) => x.opening)],
      ["Emphasis", ...w.map((x) => x.emphasis)],
      ["Block 1", ...w.map((x) => x.block1)],
      ["Block 2", ...w.map((x) => x.block2)],
      ["Closing", ...w.map((x) => x.closing)],
    ];
    const head = w.map((_, i) => `<th>Week ${i + 1}</th>`).join("");
    const body = rows
      .map((r) => `<tr><td><strong>${escapeHtml(r[0])}</strong></td>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    return `
      <div class="sched-preview-doc print-card" id="schedulePrintArea">
        <h2>TN-170 · ${escapeHtml(monthLabel(state.monthKey))}</h2>
        <p>${escapeHtml(TEMPLATES[state.templateKey]?.name || "Schedule")}</p>
        <table class="sched-preview-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>
        ${state.extras ? `<p><strong>Notes:</strong> ${escapeHtml(state.extras)}</p>` : ""}
      </div>`;
  }

  function renderStepContent() {
    const step = STEPS[state.step];
    if (step === "month") {
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Which month are you planning?</h3>
          <label for="schedMonthPick">Meeting month</label>
          <input type="month" id="schedMonthPick" value="${escapeHtml(state.monthKey)}" />
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
          <h4>Week ${i + 1}</h4>
          <label>Uniform</label><input data-week="${i}" data-field="uniform" value="${escapeHtml(wk.uniform)}" />
          <label>Opening</label><input data-week="${i}" data-field="opening" value="${escapeHtml(wk.opening)}" />
          <label>Main emphasis</label><input data-week="${i}" data-field="emphasis" value="${escapeHtml(wk.emphasis)}" />
          <label>Activity block 1</label><input data-week="${i}" data-field="block1" value="${escapeHtml(wk.block1)}" />
          <label>Activity block 2</label><input data-week="${i}" data-field="block2" value="${escapeHtml(wk.block2)}" />
          <label>Closing</label><input data-week="${i}" data-field="closing" value="${escapeHtml(wk.closing)}" />
        </div>`
        )
        .join("");
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Fill in each meeting week</h3>
          <p class="page-intro">Large fields — adjust uniforms, training, and special nights.</p>
          <label for="schedExtras">Extra activities this month</label>
          <textarea id="schedExtras" rows="3">${escapeHtml(state.extras)}</textarea>
        </div>
        <div class="sched-week-grid">${cards}</div>`;
    }
    if (step === "preview") return `<div class="sched-step-card">${renderPreviewHtml()}</div>`;
    if (step === "save") {
      return `
        <div class="sched-step-card card-info">
          <h3 class="card-info-title">Save to squadron workspace</h3>
          <p>Everyone approved can view this schedule after you save.</p>
          <button type="button" class="btn-gold btn-lg" data-sched-action="save">Save schedule</button>
          <button type="button" class="btn-outline btn-lg" data-sched-action="print">Print preview</button>
        </div>
        ${renderPreviewHtml()}`;
    }
    return "";
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
    });
    root.querySelectorAll("[name=schedTpl]").forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) {
          state.templateKey = r.value;
          state.weeks = defaultWeeks(state.templateKey);
        }
      });
    });
    root.querySelector("#schedExtras")?.addEventListener("input", (e) => {
      state.extras = e.target.value;
    });
    root.querySelectorAll("[data-week]").forEach((inp) => {
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
      if (act?.dataset.schedAction === "save") saveSchedule().catch((err) => alert(err.message));
      if (act?.dataset.schedAction === "print") {
        const w = window.open("", "_blank");
        w.document.write(document.getElementById("schedulePrintArea")?.outerHTML || "");
        w.print();
      }
    });
  }

  async function init() {
    state.weeks = defaultWeeks(state.templateKey);
    const saved = await loadSchedule(state.monthKey);
    if (saved?.payload) {
      state.weeks = saved.payload.weeks || state.weeks;
      state.extras = saved.payload.extras || "";
      state.templateKey = saved.payload.templateKey || state.templateKey;
      state.scheduleId = saved.id;
    }
    render();
    global.SMTN170Supabase?.subscribeTable?.("schedules", null, async () => {
      const s = await loadSchedule(state.monthKey);
      if (s?.payload) {
        state.weeks = s.payload.weeks || state.weeks;
        render();
      }
    });
  }

  global.SMTN170ScheduleBuilder = { init, render };
  if (document.getElementById("scheduleBuilderRoot")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
