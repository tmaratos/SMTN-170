/**
 * SUI Readiness — demo tracker for subordinate unit inspections.
 */
(function initSuiReadiness(global) {
  const STORAGE_KEY = "smtn170_sui_readiness";

  function uid() {
    return global.crypto?.randomUUID?.() || "sui-" + Date.now();
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const data = {
      nextSuiWindow: "2026-09-01",
      overallPercent: 72,
      workUnits: [
        { name: "Command & Admin", status: "On track", lead: "Lt. Col. S. Brennan", open: 2 },
        { name: "Operations", status: "Needs attention", lead: "Maj. J. Whitmore", open: 5 },
        { name: "Emergency Services", status: "On track", lead: "Capt. R. Delgado", open: 1 },
        { name: "Cadet Programs", status: "On track", lead: "Capt. M. Ellis", open: 3 },
        { name: "Aerospace Education", status: "Overdue item", lead: "1st Lt. K. Nguyen", open: 4 },
        { name: "Safety", status: "On track", lead: "Maj. T. Owens", open: 2 },
      ],
      checklist: [
        { item: "CC briefing binder current", done: true },
        { item: "ORMS / safety culture evidence", done: true },
        { item: "Aircraft & vehicle records", done: false },
        { item: "Cadet protection compliance file", done: true },
        { item: "Finance & property accountability", done: false },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function render() {
    const root = document.getElementById("suiMain");
    const dash = document.getElementById("suiDashboardCard");
    if (!root && !dash) return;

    const data = load();
    const openCheck = data.checklist.filter((c) => !c.done).length;

    if (dash) {
      dash.innerHTML = `
        <div class="fr-dash-head">
          <div>
            <p class="kicker" style="margin:0 0 6px">Subordinate Unit Inspection</p>
            <h2 style="margin:0;font-size:1.35rem;text-transform:uppercase">SUI Readiness</h2>
          </div>
          <div class="fr-readiness-ring" aria-label="SUI readiness ${data.overallPercent} percent">
            <strong>${data.overallPercent}%</strong>
            <span>Prepared</span>
          </div>
        </div>
        <div class="fr-dash-stats">
          <div><strong>${openCheck}</strong><span>Open checklist items</span></div>
          <div><strong>${data.workUnits.filter((w) => w.status !== "On track").length}</strong><span>Work units flagged</span></div>
        </div>
        <div class="di-dash-actions">
          <a class="btn gold" href="sui-readiness.html">SUI checklist</a>
        </div>`;
    }

    if (root) {
      root.innerHTML = `
        <article class="panel sui-hero">
          <p class="kicker">Subordinate Unit Inspection</p>
          <h2>SUI Readiness</h2>
          <p>Track inspection prep by work unit — command, operations, ES, cadet programs, AE, and safety — before the wing SUI team arrives.</p>
          <p class="sui-meta">Next inspection window: <strong>${escapeHtml(data.nextSuiWindow)}</strong> · Overall: <strong>${data.overallPercent}%</strong> prepared</p>
        </article>
        <div class="sui-grid">
          ${data.workUnits
            .map(
              (w) =>
                `<article class="panel"><h3>${escapeHtml(w.name)}</h3>
                <span class="fr-status-pill ${w.status === "On track" ? "fr-status--current" : "fr-status--due-soon"}">${escapeHtml(w.status)}</span>
                <p class="sui-meta">Lead: ${escapeHtml(w.lead)} · ${w.open} open action${w.open === 1 ? "" : "s"}</p></article>`
            )
            .join("")}
        </div>
        <article class="panel">
          <h2>Commander's SUI checklist</h2>
          <ul class="sui-checklist">
            ${data.checklist
              .map(
                (c) =>
                  `<li class="${c.done ? "sui-check--done" : ""}">${c.done ? "☑" : "☐"} ${escapeHtml(c.item)}</li>`
              )
              .join("")}
          </ul>
        </article>
        <p class="di-arch-note"><strong>Note:</strong> Live SUI records will sync from Supabase; supporting documents live in the <a href="documents.html" style="color:var(--cyan);font-weight:800">File Library</a>.</p>`;
    }
  }

  global.SMTN170SuiReadiness = { load, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
