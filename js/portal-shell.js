/**
 * TN-170 portal shell — layout, mobile menu, footer, simplified home dashboard.
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

  function renderDashboardV2() {
    const root = document.getElementById("dashboardV2");
    if (!root || !global.SMTN170_DATA) return;

    const d = global.SMTN170_DATA;
    const nextMeeting = d.UPCOMING_MEETINGS?.[0];
    const attention = getAttentionItems(d);
    const thisWeek = d.THIS_WEEK || [];

    const nextMeetingBlock = nextMeeting
      ? `<p class="dash-hero-lead">${escapeHtml(nextMeeting.title)}</p>
         <p class="dash-hero-meta">${escapeHtml(formatDateFriendly(nextMeeting.date))} · ${escapeHtml(nextMeeting.time)}<br>${escapeHtml(nextMeeting.loc)}</p>`
      : `<p class="dash-hero-lead">No meetings posted yet.</p>
         <p class="dash-hero-meta">Check the calendar for the latest schedule.</p>`;

    const dueLead =
      attention.length === 0
        ? "Nothing urgent right now."
        : attention.length === 1
          ? "1 item needs your attention."
          : `${attention.length} items need your attention.`;

    root.innerHTML = `
      <section class="dash-welcome" aria-labelledby="dashWelcomeTitle">
        <h2 id="dashWelcomeTitle" class="dash-welcome-title">Welcome back.</h2>
        <p class="dash-welcome-sub">Here is what needs attention this week.</p>
      </section>

      <section class="dash-hero-cards" aria-label="Main actions">
        <article class="dash-hero-card">
          <h3 class="dash-hero-card-title">Next Meeting</h3>
          ${nextMeetingBlock}
          <a class="btn-primary-lg" href="calendar.html">View Calendar</a>
        </article>

        <article class="dash-hero-card">
          <h3 class="dash-hero-card-title">Items Due Soon</h3>
          <p class="dash-hero-lead">${escapeHtml(dueLead)}</p>
          <p class="dash-hero-meta">Monthly reports, safety items, and inspection prep.</p>
          <a class="btn-primary-lg" href="readiness.html">Review Due Items</a>
        </article>

        <article class="dash-hero-card dash-hero-card--steward">
          <h3 class="dash-hero-card-title">Need help finding something?</h3>
          <p class="dash-hero-lead">Ask Steward for CAP standards, meeting prep, files, flight reviews, and inspection prep.</p>
          <button type="button" class="btn-primary-lg btn-steward-lg" data-steward-open>Open Steward Chat</button>
        </article>
      </section>

      <section class="dash-section" aria-labelledby="dashThisWeek">
        <h2 id="dashThisWeek" class="dash-section-title">Today / This Week</h2>
        <ul class="dash-simple-list">
          ${thisWeek
            .map(
              (item) =>
                `<li><span class="dash-list-icon" aria-hidden="true">•</span><span>${escapeHtml(item)}</span></li>`
            )
            .join("")}
        </ul>
      </section>

      <section class="dash-section" aria-labelledby="dashMeetings">
        <h2 id="dashMeetings" class="dash-section-title">Upcoming Meetings</h2>
        <ul class="dash-meeting-list">
          ${(d.UPCOMING_MEETINGS || [])
            .slice(0, 4)
            .map(
              (ev) => `
            <li class="dash-meeting-item">
              <div class="dash-meeting-date">${escapeHtml(formatDateFriendly(ev.date))}</div>
              <div class="dash-meeting-body">
                <strong>${escapeHtml(ev.title)}</strong>
                ${ev.tag ? `<span class="tag-bfr">${escapeHtml(ev.tag)}</span>` : ""}
                <span class="dash-meeting-meta">${escapeHtml(ev.time)} · ${escapeHtml(ev.loc)}</span>
              </div>
            </li>`
            )
            .join("")}
        </ul>
        <a class="btn-secondary-lg" href="calendar.html">See full calendar</a>
      </section>

      <section class="dash-section" aria-labelledby="dashAttention">
        <h2 id="dashAttention" class="dash-section-title">Things That Need Attention</h2>
        ${
          attention.length
            ? `<ul class="dash-attention-list">
          ${attention
            .map(
              (t) => `
            <li class="dash-attention-item">
              ${renderChip(t.status)}
              <span class="dash-attention-label">${escapeHtml(t.label)}</span>
            </li>`
            )
            .join("")}
        </ul>`
            : `<p class="dash-empty-note">You are caught up on the items we track here. Check back after the next meeting.</p>`
        }
        <a class="btn-secondary-lg" href="readiness.html">Open squadron overview</a>
      </section>

      <section class="dash-section" aria-labelledby="dashQuick">
        <h2 id="dashQuick" class="dash-section-title">Quick Actions</h2>
        <div class="dash-quick-grid">
          <a class="dash-quick-btn" href="schedule.html"><span class="dash-quick-label">Meeting schedule</span></a>
          <a class="dash-quick-btn" href="documents.html"><span class="dash-quick-label">Files &amp; forms</span></a>
          <a class="dash-quick-btn" href="flight-review.html"><span class="dash-quick-label">Flight reviews</span></a>
          <a class="dash-quick-btn" href="sui-readiness.html"><span class="dash-quick-label">Inspection prep</span></a>
          <a class="dash-quick-btn" href="senior-member.html"><span class="dash-quick-label">Senior members</span></a>
          <a class="dash-quick-btn" href="cadet.html"><span class="dash-quick-label">Cadets</span></a>
        </div>
        <details class="dash-staff-tools">
          <summary>More tools for staff</summary>
          <div class="dash-quick-grid dash-quick-grid--staff">
            <a class="dash-quick-btn dash-quick-btn--muted" href="exports.html">Print &amp; export</a>
            <a class="dash-quick-btn dash-quick-btn--muted" href="resources.html">CAP references</a>
            <a class="dash-quick-btn dash-quick-btn--muted" href="operations.html">Operations</a>
            <a class="dash-quick-btn dash-quick-btn--muted" href="safety.html">Safety</a>
            <a class="dash-quick-btn dash-quick-btn--muted" href="training.html">Training</a>
          </div>
        </details>
        <div class="dash-discord-wrap" data-portal-discord></div>
      </section>`;
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
    ensureSteward(() => {
      global.SMTN170PortalNav?.renderDiscordPlacements?.();
      global.SMTN170Steward?.rebind?.();
    });
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
