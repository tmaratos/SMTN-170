/**
 * TN-170 portal shell — layout, mobile menu, footer, workspace home dashboard.
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

  function bindDashboardSteward() {
    const workspace = document.querySelector(".dash-workspace");
    if (!workspace || workspace.dataset.stewardBound === "1") return;
    workspace.dataset.stewardBound = "1";

    const form = document.getElementById("dashStewardForm");
    const input = document.getElementById("dashStewardInput");
    const prompts = document.getElementById("dashStewardPrompts");

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input?.value || "";
      global.SMTN170Steward?.askFromDashboard?.(text);
      if (input) input.value = "";
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        global.SMTN170Steward?.askFromDashboard?.(input.value);
        input.value = "";
      }
    });

    prompts?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-dash-prompt]");
      if (!chip) return;
      global.SMTN170Steward?.askFromDashboard?.(chip.dataset.dashPrompt || "");
    });

    document.querySelectorAll("[data-steward-ask]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const text = btn.dataset.stewardAsk || "";
        global.SMTN170Steward?.askFromDashboard?.(text);
      });
    });
  }

  function renderDashboardV2() {
    const root = document.getElementById("dashboardV2");
    if (!root || !global.SMTN170_DATA) return;

    const d = global.SMTN170_DATA;
    const user = d.MOCK_USER || {};
    const nextMeeting = d.UPCOMING_MEETINGS?.[0];
    const attention = getAttentionItems(d);
    const prompts = (d.STEWARD_PROMPTS || []).slice(0, 5);
    const m = d.MISSION_READINESS || {};

    const welcomeName = user.rank && user.name ? `${user.rank} ${user.name}` : "member";

    const summaryItems = [
      nextMeeting
        ? `<li><strong>Next meeting:</strong> ${escapeHtml(nextMeeting.title)} · ${escapeHtml(formatDateFriendly(nextMeeting.date))}</li>`
        : `<li><strong>Next meeting:</strong> See the calendar</li>`,
      attention.length
        ? `<li><strong>Needs attention:</strong> ${attention.length} item${attention.length === 1 ? "" : "s"} due or waiting on review</li>`
        : `<li><strong>Needs attention:</strong> Nothing urgent right now</li>`,
      `<li><strong>Flight reviews:</strong> ${m.bfr?.current ?? 0} on track · ${m.bfr?.dueSoon ?? 0} due soon</li>`,
    ].join("");

    const promptChips = prompts
      .map(
        (p) =>
          `<button type="button" class="dash-steward-chip" data-dash-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      )
      .join("");

    const stewardShortcuts = prompts
      .slice(0, 4)
      .map(
        (p) =>
          `<button type="button" class="dash-shortcut-btn" data-steward-ask="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      )
      .join("");

    root.innerHTML = `
      <div class="dash-workspace">
        <header class="dash-hero-band">
          <div class="card-info dash-hero-welcome">
            <p class="dash-hero-eyebrow">TN-170 Oak Ridge Composite Squadron</p>
            <h2 class="dash-hero-title">Welcome back, ${escapeHtml(welcomeName)}.</h2>
            <p class="dash-hero-lead">Here is what is happening and what may need your attention this week.</p>
          </div>
          <div class="card-info dash-hero-summary">
            <h3 class="card-info-title">This week at a glance</h3>
            <ul class="dash-summary-list">${summaryItems}</ul>
          </div>
        </header>

        <section class="card-assistant dash-steward-hub" aria-label="Steward for CAP">
          <div class="dash-steward-head">
            <div class="dash-steward-avatar" aria-hidden="true">S</div>
            <div class="dash-steward-intro">
              <h2 class="dash-steward-title">Steward for CAP</h2>
              <p class="dash-steward-tagline">Your squadron guide · Built by Faith Based Innovations</p>
            </div>
            <span class="dash-steward-badge">Ask anything</span>
          </div>
          <p class="dash-steward-hint">Meeting prep, files, flight reviews, inspection items, and CAP references — type a question or pick a suggestion below.</p>
          <form class="dash-steward-form" id="dashStewardForm">
            <label class="visually-hidden" for="dashStewardInput">Ask Steward anything</label>
            <input type="text" id="dashStewardInput" class="dash-steward-input" placeholder="Ask Steward anything…" autocomplete="off" />
            <button type="submit" class="dash-steward-submit">Ask Steward</button>
          </form>
          <div class="dash-steward-prompts" id="dashStewardPrompts">${promptChips}</div>
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
                  </li>`
                  )
                  .join("")}
              </ul>
              <a class="card-link card-link--light" href="readiness.html">Review all items →</a>`
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
                <button type="button" class="dash-action-tile dash-action-tile--steward" data-steward-ask><span class="dash-action-icon" aria-hidden="true">💬</span><span>Ask Steward</span></button>
                <a class="dash-action-tile" href="schedule.html"><span class="dash-action-icon" aria-hidden="true">📋</span><span>View Meetings</span></a>
              </div>
            </section>

            <section class="card-assistant dash-block dash-block--compact" aria-labelledby="dashStewardShortcuts">
              <h3 id="dashStewardShortcuts" class="card-assistant-title">Steward shortcuts</h3>
              <p class="dash-shortcut-note">Tap to open Steward with a ready-made question.</p>
              <div class="dash-shortcut-grid">${stewardShortcuts}</div>
            </section>

            <div class="card-info dash-block dash-block--compact" data-portal-discord></div>
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

  function init() {
    bindMobileNav();
    injectFooter();
    renderDashboardV2();
    bootPortalAssets(() => {
      global.SMTN170PortalNav?.renderDiscordPlacements?.();
      global.SMTN170Steward?.rebind?.();
      bindDashboardSteward();
      global.SMTN170Pages?.bindStewardContextActions?.();
    });
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
