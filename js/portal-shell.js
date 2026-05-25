/**
 * TN-170 portal shell — layout, mobile menu, footer, workspace home dashboard.
 * Future: Supabase session. Roles do not filter operational pages — see portal-auth.js.
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

  function getAttentionItems(d) {
    const all = [...(d.READINESS_TASKS?.monthly || []), ...(d.READINESS_TASKS?.annual || [])];
    return all.filter((t) => ["due_soon", "overdue", "needs_review"].includes(t.status));
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

  function renderDashboardV2() {
    const root = document.getElementById("dashboardV2");
    if (!root || !global.SMTN170_DATA || !global.SMTN170Auth?.loadSession?.()) return;

    const d = global.SMTN170_DATA;
    const user = d.MOCK_USER;
    const nextMeeting = d.UPCOMING_MEETINGS?.[0];
    const attention = getAttentionItems(d);
    const m = d.MISSION_READINESS || {};

    const welcome =
      global.SMTN170Auth?.getWelcomeGreeting?.() ||
      (user ? { full: `Welcome back, ${user.displayName || user.name || ""}.` } : { full: "Welcome back." });
    const welcomeTitle = welcome.full;

    const summaryItems = [
      nextMeeting
        ? `<li><strong>Next meeting:</strong> ${escapeHtml(nextMeeting.title)} · ${escapeHtml(formatDateFriendly(nextMeeting.date))}</li>`
        : `<li><strong>Next meeting:</strong> See the calendar</li>`,
      attention.length
        ? `<li><strong>Needs attention:</strong> ${attention.length} item${attention.length === 1 ? "" : "s"} due or waiting on review</li>`
        : `<li><strong>Needs attention:</strong> Nothing urgent right now</li>`,
      `<li><strong>Flight reviews:</strong> ${m.bfr?.current ?? 0} on track · ${m.bfr?.dueSoon ?? 0} due soon</li>`,
    ].join("");

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
          <button type="button" class="btn-gold" data-steward-open>Open Steward</button>
        </section>

        <div class="dash-columns">
          <div class="dash-col dash-col--left">
            <section class="card-info dash-block" aria-labelledby="dashWeek">
              <h3 id="dashWeek" class="card-info-title">Today / This Week</h3>
              <ul class="dash-bullet-list">
                ${(d.THIS_WEEK || [])
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}
              </ul>
            </section>

            <section class="card-info dash-block" aria-labelledby="dashMeetings">
              <h3 id="dashMeetings" class="card-info-title">Upcoming Meetings</h3>
              <ul class="dash-meeting-compact">
                ${(d.UPCOMING_MEETINGS || [])
                  .slice(0, 4)
                  .map(
                    (ev) => `
                  <li>
                    <time>${escapeHtml(formatDateFriendly(ev.date))}</time>
                    <div>
                      <strong>${escapeHtml(ev.title)}</strong>
                      ${ev.tag ? `<span class="tag-bfr">${escapeHtml(ev.tag)}</span>` : ""}
                      <span>${escapeHtml(ev.time)} · ${escapeHtml(ev.loc)}</span>
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>
              <a class="card-link" href="calendar.html">Open calendar →</a>
            </section>

            <section class="card-info dash-block" aria-labelledby="dashAnnounce">
              <h3 id="dashAnnounce" class="card-info-title">Announcements</h3>
              <ul class="dash-announce-list">
                ${(d.ANNOUNCEMENTS || [])
                  .map(
                    (a) => `
                  <li class="dash-announce-item">
                    <time>${escapeHtml(formatDateFriendly(a.date))}</time>
                    <strong>${escapeHtml(a.title)}</strong>
                    <p>${escapeHtml(a.body)}</p>
                    ${global.SMTN170Auth?.renderAuditHtml?.(a) || ""}
                  </li>`
                  )
                  .join("")}
              </ul>
            </section>
          </div>

          <div class="dash-col dash-col--right">
            <section class="card-warning dash-block" aria-labelledby="dashDue">
              <h3 id="dashDue" class="card-warning-title">Due Soon</h3>
              ${
                attention.length
                  ? `<ul class="dash-due-list">
                ${attention
                  .map(
                    (t) => `
                  <li class="dash-due-item">
                    ${renderChip(t.status)}
                    <span>${escapeHtml(t.label)}</span>
                    ${global.SMTN170Auth?.renderAuditHtml?.(t) || ""}
                  </li>`
                  )
                  .join("")}
              </ul>
              <a class="card-link card-link--light" href="tasks.html">Review tasks →</a>`
                  : `<p class="dash-caught-up">You are caught up. Nice work.</p>`
              }
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

  function init() {
    bindMobileNav();
    injectFooter();
    normalizeTopbarCopy();
    renderDashboardV2();
    bootPortalAssets(() => {
      global.SMTN170Steward?.rebind?.();
      bindDashboardSteward();
      global.SMTN170Pages?.bindStewardContextActions?.();
    });
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, init };

  function onProfileChange() {
    renderDashboardV2();
    global.SMTN170PortalNav?.init?.();
  }

  global.addEventListener("smtn170:auth-changed", onProfileChange);
  global.addEventListener("smtn170:profile-updated", onProfileChange);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
