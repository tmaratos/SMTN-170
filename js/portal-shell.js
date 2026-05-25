/**
 * TN-170 portal shell — layout, mobile menu, footer, page helpers.
 * Future: Supabase session + role-based nav filtering.
 */
(function initPortalShell(global) {
  const MOTTO = "Not Without Effort.";

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function statusClass(status) {
    const map = {
      current: "chip--current",
      due_soon: "chip--due-soon",
      overdue: "chip--overdue",
      needs_review: "chip--needs-review",
      scheduled: "chip--scheduled",
      completed: "chip--completed",
    };
    return map[status] || "chip--muted";
  }

  function statusLabel(status) {
    const map = {
      current: "Current",
      due_soon: "Due Soon",
      overdue: "Overdue",
      needs_review: "Needs Review",
      scheduled: "Scheduled",
      completed: "Completed",
    };
    return map[status] || status;
  }

  function renderChip(status) {
    return `<span class="status-chip ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function bindMobileNav() {
    const toggle = document.getElementById("portalMenuToggle");
    const close = document.getElementById("portalMenuClose");
    const sidebar = document.getElementById("portalSidebar");
    const backdrop = document.getElementById("portalBackdrop");

    function openMenu() {
      sidebar?.classList.add("open");
      backdrop?.classList.add("open");
      document.body.classList.add("menu-open");
      toggle?.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
      sidebar?.classList.remove("open");
      backdrop?.classList.remove("open");
      document.body.classList.remove("menu-open");
      toggle?.setAttribute("aria-expanded", "false");
    }

    toggle?.addEventListener("click", () => {
      if (sidebar?.classList.contains("open")) closeMenu();
      else openMenu();
    });
    close?.addEventListener("click", closeMenu);
    backdrop?.addEventListener("click", closeMenu);

    sidebar?.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        if (global.matchMedia("(max-width: 900px)").matches) closeMenu();
      });
    });
  }

  function injectFooter() {
    document.querySelectorAll("[data-portal-footer]").forEach((el) => {
      el.innerHTML = `
        <footer class="portal-footer">
          <p class="portal-motto">${escapeHtml(MOTTO)}</p>
          <p>TN-170 Oak Ridge Composite Squadron · Squadron Operations Desk</p>
          <p class="portal-fbi">Steward for CAP · Built by <strong>Faith Based Innovations</strong></p>
        </footer>`;
    });
  }

  function renderDashboardV2() {
    const root = document.getElementById("dashboardV2");
    if (!root || !global.SMTN170_DATA) return;

    const d = global.SMTN170_DATA;
    const m = d.MISSION_READINESS;

    root.innerHTML = `
      <section class="mission-hero panel">
        <p class="kicker">Mission Readiness</p>
        <div class="mission-hero-row">
          <div>
            <h2>Squadron status</h2>
            <p class="mission-copy">Operations desk overview — monthly tasks, annual requirements, and directorate readiness.</p>
          </div>
          <div class="mission-ring" aria-label="Mission readiness ${m.percent} percent">
            <strong>${m.percent}%</strong>
            <span>Ready</span>
          </div>
        </div>
        <div class="mission-stats">
          <div><strong>${m.bfr.current}</strong><span>BFR current</span></div>
          <div><strong>${m.bfr.dueSoon}</strong><span>BFR due soon</span></div>
          <div><strong class="text-warn">${m.bfr.overdue}</strong><span>BFR overdue</span></div>
          <div><strong>${m.sui.percent}%</strong><span>SUI prepared</span></div>
        </div>
      </section>

      <div class="dash-grid-v2">
        <article class="panel">
          <div class="panel-head-inline">
            <h2>Upcoming meetings</h2>
            <a class="btn-ghost-sm" href="calendar.html">Squadron calendar</a>
          </div>
          <ul class="meeting-list">
            ${d.UPCOMING_MEETINGS.map(
              (ev) =>
                `<li><span class="meeting-date">${escapeHtml(ev.date.slice(5))}</span><div><strong>${escapeHtml(ev.title)}</strong>${ev.tag ? `<span class="tag-bfr">${ev.tag}</span>` : ""}<br><small>${escapeHtml(ev.time)} · ${escapeHtml(ev.loc)}</small></div></li>`
            ).join("")}
          </ul>
        </article>

        <article class="panel">
          <h2>Monthly task checklist</h2>
          <ul class="task-list">
            ${d.READINESS_TASKS.monthly
              .map((t) => `<li>${renderChip(t.status)}<span>${escapeHtml(t.label)}</span></li>`)
              .join("")}
          </ul>
          <a class="btn-ghost-sm" href="readiness.html">Full readiness board</a>
        </article>

        <article class="panel">
          <h2>Annual requirements</h2>
          <ul class="task-list">
            ${d.READINESS_TASKS.annual
              .map((t) => `<li>${renderChip(t.status)}<span>${escapeHtml(t.label)}</span></li>`)
              .join("")}
          </ul>
        </article>

        <button type="button" class="steward-launch-strip" data-steward-open>
          <span class="steward-launch-icon" aria-hidden="true">💬</span>
          <span><strong>Steward for CAP</strong>Open assistant chat — meetings, inspections, BFR, files</span>
        </button>

        <article class="panel" id="frDashboardCard"></article>
        <article class="panel" id="suiDashboardCard"></article>
        <article class="panel" id="diDashboardRecent"></article>
        <article class="panel" data-portal-discord></article>
      </div>`;
  }

  function ensureSteward(callback) {
    if (global.SMTN170Steward) {
      global.SMTN170Steward.rebind?.();
      callback?.();
      return;
    }
    if (document.querySelector('script[src*="steward.js"]')) {
      const wait = setInterval(() => {
        if (global.SMTN170Steward) {
          clearInterval(wait);
          global.SMTN170Steward.rebind?.();
          callback?.();
        }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.src = "./js/steward.js?v=2";
    script.onload = () => {
      global.SMTN170Steward?.rebind?.();
      callback?.();
    };
    document.body.appendChild(script);
  }

  function init() {
    bindMobileNav();
    injectFooter();
    renderDashboardV2();
    ensureSteward();
    // Re-run module dashboard hooks after v2 layout injects target nodes
    setTimeout(() => {
      global.SMTN170FlightReview?.renderDashboardCard?.(document.getElementById("frDashboardCard"));
      global.SMTN170SuiReadiness?.render?.();
      global.SMTN170DocumentIntake?.renderDashboardWidgets?.();
      global.SMTN170PortalNav?.renderDiscordPlacements?.();
      global.SMTN170Steward?.rebind?.();
    }, 0);
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
