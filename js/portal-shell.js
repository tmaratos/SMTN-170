/**
 * TN-170 portal shell — layout, mobile menu, footer, workspace home dashboard.
 * Roles do not filter operational pages — see portal-auth.js.
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
      current: "On track",
      due_soon: "Due soon",
      overdue: "Overdue",
      needs_review: "Needs review",
      scheduled: "Scheduled",
      completed: "Done",
    };
    return map[status] || status;
  }

  function renderChip(status) {
    return `<span class="status-chip ${statusClass(status)}" role="status">${escapeHtml(statusLabel(status))}</span>`;
  }

  function formatDateFriendly(iso) {
    try {
      const d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function emptyList(message, link) {
    const linkHtml = link ? `<a class="card-link" href="${link.href}">${escapeHtml(link.label)} →</a>` : "";
    return `<p class="dash-empty">${escapeHtml(message)}</p>${linkHtml}`;
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
          <p>TN-170 Oak Ridge Composite Squadron</p>
          <p class="portal-fbi">Steward for CAP · Built by <strong>Faith Based Innovations</strong></p>
        </footer>`;
    });
  }

  function bindDashboardSteward() {
    global.SMTN170Steward?.rebind?.();
  }

  async function renderDashboardV2() {
    const root = document.getElementById("dashboardV2");
    if (!root) return;

    const auth = global.SMTN170Auth;
    const session = auth?.loadSession?.();
    const welcome = auth?.getWelcomeGreeting?.() || {
      full: session?.email ? `Welcome back, ${session.email.split("@")[0]}.` : "Welcome back.",
    };
    const welcomeTitle = welcome.full || "Welcome back.";

    const summary = (await global.SMTN170Dashboard?.fetchSummary?.()) || {
      configured: false,
      meetings: [],
      attention: [],
      flightReviews: { current: 0, dueSoon: 0, overdue: 0, total: 0 },
      inspection: { open: 0, total: 0 },
    };

    const nextMeeting = summary.meetings[0];
    const fr = summary.flightReviews;

    const summaryItems = [
      nextMeeting
        ? `<li><strong>Next meeting:</strong> ${escapeHtml(nextMeeting.title)} · ${escapeHtml(formatDateFriendly(nextMeeting.date))}</li>`
        : `<li><strong>Next meeting:</strong> No meetings saved yet.</li>`,
      summary.attention.length
        ? `<li><strong>Needs attention:</strong> ${summary.attention.length} open task${summary.attention.length === 1 ? "" : "s"}</li>`
        : `<li><strong>Needs attention:</strong> No tasks saved yet.</li>`,
      fr.total
        ? `<li><strong>Flight reviews:</strong> ${fr.current} on track · ${fr.dueSoon} due soon${fr.overdue ? ` · ${fr.overdue} overdue` : ""}</li>`
        : `<li><strong>Flight reviews:</strong> No flight review records saved yet.</li>`,
    ].join("");

    const meetingsHtml = summary.meetings.length
      ? summary.meetings
          .slice(0, 4)
          .map(
            (ev) => `
          <li>
            <time>${escapeHtml(formatDateFriendly(ev.date))}</time>
            <div>
              <strong>${escapeHtml(ev.title)}</strong>
              ${ev.tag ? `<span class="tag-bfr">${escapeHtml(ev.tag)}</span>` : ""}
              <span>${escapeHtml(ev.time)}${ev.loc ? ` · ${escapeHtml(ev.loc)}` : ""}</span>
            </div>
          </li>`
          )
          .join("")
      : emptyList("No meetings saved yet.", { href: "schedule.html", label: "Create a meeting schedule" });

    const attentionHtml = summary.attention.length
      ? `<ul class="dash-due-list">${summary.attention
          .map(
            (t) => `
          <li class="dash-due-item">
            ${renderChip(t.status)}
            <span>${escapeHtml(t.label)}</span>
          </li>`
          )
          .join("")}</ul>
        <a class="card-link card-link--light" href="tasks.html">Review tasks →</a>`
      : `<p class="dash-caught-up">No tasks saved yet.</p>`;

    root.innerHTML = `
      <div class="dash-workspace">
        <header class="dash-hero-band">
          <div class="card-info dash-hero-welcome">
            <p class="dash-hero-eyebrow">TN-170 Oak Ridge Composite Squadron</p>
            <h2 class="dash-hero-title">${escapeHtml(welcomeTitle)}</h2>
            <p class="dash-hero-lead">Private Senior Member operations workspace for TN-170 — shared with all approved Senior Members.</p>
          </div>
          <div class="card-info dash-hero-summary">
            <h3 class="card-info-title">This week at a glance</h3>
            <ul class="dash-summary-list">${summaryItems}</ul>
          </div>
        </header>

        <section class="card-assistant steward-launch-card" aria-label="Steward for CAP">
          <h2>Steward for CAP</h2>
          <p>Ask Steward for help with meetings, files, flight reviews, inspection prep, org charts, and CAP references.</p>
          <button type="button" class="btn-gold" onclick="openSteward()">Open Steward</button>
        </section>

        <div class="dash-columns">
          <div class="dash-col dash-col--left">
            <section class="card-info dash-block" aria-labelledby="dashMeetings">
              <h3 id="dashMeetings" class="card-info-title">Upcoming Meetings</h3>
              ${summary.meetings.length ? `<ul class="dash-meeting-compact">${meetingsHtml}</ul>` : meetingsHtml}
              <a class="card-link" href="calendar.html">Open calendar →</a>
            </section>

            <section class="card-info dash-block" aria-labelledby="dashOps">
              <h3 id="dashOps" class="card-info-title">Squadron operations</h3>
              <ul class="dash-bullet-list">
                <li>Private Senior Member operations workspace — approved Senior Members only.</li>
                <li>Use <a href="schedule.html">Meeting planning</a>, <a href="documents.html">Files and forms</a>, and <a href="orgchart.html">Organization chart</a> for day-to-day work.</li>
                <li>Ask <strong>Steward for CAP</strong> for meetings, flight reviews, inspection prep, and CAP references.</li>
              </ul>
            </section>
          </div>

          <div class="dash-col dash-col--right">
            <section class="card-warning dash-block" aria-labelledby="dashDue">
              <h3 id="dashDue" class="card-warning-title">Due Soon</h3>
              ${attentionHtml}
            </section>

            <section class="card-action dash-block" aria-labelledby="dashActions">
              <h3 id="dashActions" class="card-action-title">Quick Actions</h3>
              <div class="dash-action-grid">
                <a class="dash-action-tile" href="calendar.html"><span class="dash-action-icon" aria-hidden="true">📅</span><span>Open Calendar</span></a>
                <a class="dash-action-tile" href="documents.html"><span class="dash-action-icon" aria-hidden="true">📁</span><span>Upload Files</span></a>
                <a class="dash-action-tile" href="flight-review.html"><span class="dash-action-icon" aria-hidden="true">✈</span><span>Flight Reviews</span></a>
                <a class="dash-action-tile" href="sui-readiness.html"><span class="dash-action-icon" aria-hidden="true">✓</span><span>Inspection Prep</span></a>
                <a class="dash-action-tile" href="schedule.html"><span class="dash-action-icon" aria-hidden="true">📋</span><span>View Meetings</span></a>
              </div>
            </section>

          </div>
        </div>
      </div>`;

    bindDashboardSteward();
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
    script.src = "./js/steward.js?v=3";
    script.onload = () => {
      global.SMTN170Steward?.rebind?.();
      callback?.();
    };
    document.body.appendChild(script);
  }

  function loadScriptOnce(src, cb) {
    const base = src.split("?")[0];
    if (document.querySelector(`script[src^="${base}"]`)) {
      cb?.();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => cb?.();
    document.body.appendChild(s);
  }

  function bootPortalAssets(done) {
    loadScriptOnce("./js/portal-pages.js?v=1", () => {
      global.SMTN170Pages?.init?.();
      ensureSteward(done);
    });
  }

  const PORTAL_TAGLINE = "Private Senior Member operations workspace for TN-170";
  const LEGACY_TOPBAR = /parent|cadet-only|staff area|stay connected|squadron discord|public access|recruitment/i;

  function normalizeTopbarCopy() {
    document.querySelectorAll(".portal-topbar > div > p").forEach((p) => {
      if (LEGACY_TOPBAR.test(p.textContent || "")) p.textContent = PORTAL_TAGLINE;
    });
    document.querySelectorAll("[data-portal-discord]").forEach((el) => el.remove());
  }

  function injectPortalLayoutCss() {
    if (document.getElementById("portalLayoutCss")) return;
    const link = document.createElement("link");
    link.id = "portalLayoutCss";
    link.rel = "stylesheet";
    link.href = "./css/portal-layout.css?v=2";
    document.head.appendChild(link);
  }

  function init() {
    injectPortalLayoutCss();
    bindMobileNav();
    injectFooter();
    normalizeTopbarCopy();
    renderDashboardV2().catch((e) => console.warn("[TN-170] dashboard", e));
    bootPortalAssets(() => {
      global.SMTN170Steward?.rebind?.();
      bindDashboardSteward();
      global.SMTN170Pages?.bindStewardContextActions?.();
    });
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, init, renderDashboardV2 };

  function onProfileChange() {
    renderDashboardV2().catch((e) => console.warn("[TN-170] dashboard", e));
    global.SMTN170PortalNav?.init?.();
  }

  global.addEventListener("smtn170:auth-changed", onProfileChange);
  global.addEventListener("smtn170:profile-updated", onProfileChange);
  global.addEventListener("smtn170:auth-ready", onProfileChange);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
