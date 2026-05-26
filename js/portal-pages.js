/**
 * TN-170 — Steward workflow panels on operational pages.
 */
(function initPortalPages(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  const STEWARD_CONTEXTS = {
    schedule: {
      title: "Meeting planning help",
      body: "Ask Steward about CAP meeting standards, weekly templates, uniforms, and training blocks for your squadron meeting plan.",
      prompts: ["Help prepare a senior member meeting agenda.", "What should our monthly meeting schedule include?"],
    },
    calendar: {
      title: "Squadron calendar",
      body: "Steward can help plan meeting nights, safety briefings, and special activities on the calendar.",
      prompts: ["Summarize upcoming meeting nights.", "What should we post on the squadron calendar this month?"],
    },
    bfr: {
      title: "Flight review guidance",
      body: "Ask Steward about Biannual Flight Review packets, due items, and what to prepare before review night.",
      prompts: ["Show overdue flight reviews.", "What should a flight review packet include?"],
    },
    sui: {
      title: "Inspection prep help",
      body: "Steward can walk through unit inspection checklist items and supporting documentation.",
      prompts: ["What inspection items should we check this month?", "Show open inspection items."],
    },
    files: {
      title: "Files & Resources",
      body: "Ask Steward to help find squadron resource links for schedules, forms, safety materials, and CAP references.",
      prompts: ["Find squadron resource links.", "Where should meeting minutes be linked?"],
    },
    senior: {
      title: "Senior Member Workspace",
      body: "Use Steward for staff planning, flight reviews, inspection prep, and meeting preparation.",
      prompts: ["Help prepare a senior member meeting agenda."],
    },
    orgchart: {
      title: "Organization chart",
      body: "Steward can suggest typical CAP billets, highlight vacancies, and help with staff assignments.",
      prompts: [
        "Help build the squadron org chart.",
        "Show vacant operational positions.",
        "What positions are normally present in a CAP squadron?",
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

    return `<aside class="steward-context card-assistant">
      <div class="steward-context-head">
        <span class="steward-context-icon" aria-hidden="true">S</span>
        <div>
          <h3 class="steward-context-title">${escapeHtml(ctx.title)}</h3>
          <p class="steward-context-body">${escapeHtml(ctx.body)}</p>
        </div>
      </div>
      <div class="steward-context-actions">
        <button type="button" class="btn-primary-lg btn-steward-lg" data-steward-ask>Open Steward</button>
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
        if (typeof global.openSteward === "function") global.openSteward(text);
        else global.SMTN170Steward?.askFromDashboard?.(text);
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

  function init() {
    injectStewardContexts();
    bindStewardContextActions();
  }

  global.SMTN170Pages = { STEWARD_CONTEXTS, init, injectStewardContexts, bindStewardContextActions };
})(window);
