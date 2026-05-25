/**
 * TN-170 — shared page UX: Steward workflow panels, layout helpers.
 * Future: Supabase-driven contextual help per role.
 */
(function initPortalPages(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  const STEWARD_CONTEXTS = {
    schedule: {
      title: "Need help building this schedule?",
      body: "Ask Steward about CAP meeting standards, weekly templates, uniforms, and training blocks for your squadron meeting plan.",
      prompts: [
        "Help prepare a senior member meeting agenda.",
        "What should our monthly meeting schedule include?",
      ],
      showGenerate: true,
    },
    calendar: {
      title: "Questions about squadron events?",
      body: "Steward can help you plan meeting nights, safety briefings, and special activities on the calendar.",
      prompts: ["What monthly tasks should our squadron complete?", "Summarize upcoming meeting nights."],
    },
    bfr: {
      title: "Flight review guidance",
      body: "Ask Steward about Biannual Flight Review packets, due items, and what to prepare before review night.",
      prompts: [
        "Find Biannual Flight Review readiness items.",
        "What inspection items should we check this month?",
      ],
    },
    sui: {
      title: "Inspection prep help",
      body: "Steward can walk through unit inspection checklist items and what documentation wing staff typically expect.",
      prompts: [
        "What inspection items should we check this month?",
        "What should we file before a unit inspection?",
      ],
    },
    files: {
      title: "Filing and uploads",
      body: "Steward will suggest file categories when uploads connect. For now, ask how to organize squadron documents.",
      prompts: ["Help categorize uploaded files.", "Where should meeting minutes be filed?"],
    },
    senior: {
      title: "Senior member workspace",
      body: "Open Steward for staff planning, flight reviews, inspection prep, and training file questions.",
      prompts: ["Help prepare a senior member meeting agenda."],
    },
    orgchart: {
      title: "Need help organizing the squadron structure?",
      body: "Steward can suggest typical CAP billets, highlight vacancies, and help you think through staff assignments — not a corporate HR tool, just squadron ops guidance.",
      prompts: [
        "Help build the squadron org chart.",
        "Show vacant operational positions.",
        "Recommend org chart improvements.",
        "What positions are normally present in a CAP squadron?",
        "Help reorganize staff assignments.",
      ],
    },
  };

  function renderStewardContext(ctx) {
    const chips = (ctx.prompts || [])
      .map(
        (p) =>
          `<button type="button" class="steward-context-chip" data-steward-ask="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      )
      .join("");
    const generateBtn = ctx.showGenerate
      ? `<button type="button" class="btn-outline btn-lg" disabled title="Planned for Supabase + AI">Generate with Steward</button>`
      : "";

    return `<aside class="steward-context card-assistant">
      <div class="steward-context-head">
        <span class="steward-context-icon" aria-hidden="true">S</span>
        <div>
          <h3 class="steward-context-title">${escapeHtml(ctx.title)}</h3>
          <p class="steward-context-body">${escapeHtml(ctx.body)}</p>
        </div>
      </div>
      <div class="steward-context-actions">
        <button type="button" class="btn-primary-lg btn-steward-lg" data-steward-ask>Ask Steward</button>
        ${generateBtn}
      </div>
      ${chips ? `<div class="steward-context-prompts">${chips}</div>` : ""}
    </aside>`;
  }

  function bindStewardContextActions() {
    document.querySelectorAll("[data-steward-ask]").forEach((btn) => {
      if (btn.dataset.stewardBound === "1") return;
      btn.dataset.stewardBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const text = btn.dataset.stewardAsk || "";
        global.SMTN170Steward?.askFromDashboard?.(text);
      });
    });
  }

  function injectStewardContexts() {
    document.querySelectorAll("[data-steward-context]").forEach((el) => {
      const key = el.dataset.stewardContext;
      const ctx = STEWARD_CONTEXTS[key];
      if (!ctx) return;
      const aside = document.createElement("div");
      aside.innerHTML = renderStewardContext(ctx);
      el.replaceWith(aside.firstElementChild);
    });
    bindStewardContextActions();
  }

  function wrapPageFrames() {
    document.querySelectorAll(".portal-content--wide > :not(.page-frame)").forEach(() => {});
    const content = document.querySelector(".portal-content--wide:not(:has(.page-frame))");
    if (!content || content.querySelector(".page-frame")) return;
    const children = Array.from(content.childNodes).filter(
      (n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())
    );
    if (!children.length) return;
    const frame = document.createElement("div");
    frame.className = "page-frame";
    children.forEach((c) => frame.appendChild(c));
    content.appendChild(frame);
  }

  function init() {
    injectStewardContexts();
    bindStewardContextActions();
  }

  global.SMTN170Pages = { STEWARD_CONTEXTS, init, injectStewardContexts, bindStewardContextActions };
})(window);
