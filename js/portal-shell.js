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
    global.SMTN170StewardLauncher?.rebind?.();
  }

  function renderQuickActionsSection() {
    const tiles = global.SMTN170PortalNav?.renderQuickActionTiles?.() || "";
    return `<section class="card-action dash-quick-actions" aria-labelledby="dashActions">
      <h3 id="dashActions" class="card-action-title">Quick Actions</h3>
      <p class="dash-quick-actions-lead">Tap a button to open a squadron page.</p>
      <div class="dash-quick-actions-grid">${tiles}</div>
    </section>`;
  }

  const DISCORD_INVITE_URL = "https://discord.gg/84TTREgmze";

  function renderDiscordCard() {
    const icon = `<svg class="discord-card-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.075.075 0 0 0-.079.037c-.34.6-.719 1.385-.984 2.002a18.27 18.27 0 0 0-5.487 0 12.51 12.51 0 0 0-.997-2.002.077.077 0 0 0-.08-.037 19.74 19.74 0 0 0-3.76 1.17.07.07 0 0 0-.032.027C2.2 7.97 1.62 11.46 1.905 14.91a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.13 13.13 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.075.075 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.336-3.99-.564-7.451-2.388-10.514a.061.061 0 0 0-.031-.028zM8.02 12.811c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.419-2.157 2.419zm7.974 0c-1.182 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z"/></svg>`;
    return `<section class="discord-card" aria-labelledby="discordCardTitle">
      <div class="discord-card-body">
        ${icon}
        <div class="discord-card-text">
          <h3 id="discordCardTitle" class="discord-card-title">Join Squadron Discord</h3>
          <p class="discord-card-lead">Real-time chat with squadron members and command staff.</p>
        </div>
      </div>
      <a class="discord-card-btn" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener noreferrer">Join TN-170 Discord</a>
    </section>`;
  }

  function renderDashboardSkeleton(root, welcomeTitle, accountBlock) {
    root.innerHTML = `
      <div class="dash-workspace dash-workspace--simple">
        <header class="dash-hero-band">
          <div class="card-info dash-hero-welcome">
            <p class="dash-hero-eyebrow">TN-170 Oak Ridge Composite Squadron</p>
            <h2 class="dash-hero-title">${escapeHtml(welcomeTitle)}</h2>
            <p class="dash-hero-lead">Your squadron portal for meetings, tasks, and readiness.</p>
            ${accountBlock}
          </div>
          <div class="card-info dash-hero-summary">
            <h3 class="card-info-title">This week at a glance</h3>
            <p class="dash-empty">Loading…</p>
          </div>
        </header>
        ${renderDiscordCard()}
        ${renderQuickActionsSection()}
      </div>`;
    bindDashboardSteward();
    global.SMTN170PortalNav?.bindLogout?.();
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
    const accountBlock = global.SMTN170PortalNav?.renderAccountBlock?.() || "";

    renderDashboardSkeleton(root, welcomeTitle, accountBlock);

    const loadSummary = () => global.SMTN170Dashboard?.fetchSummary?.() || Promise.resolve({
      configured: false,
      meetings: [],
      attention: [],
      flightReviews: { current: 0, dueSoon: 0, overdue: 0, total: 0 },
      inspection: { open: 0, total: 0 },
    });

    const summary = await (typeof requestIdleCallback === "function"
      ? new Promise((resolve) => {
          requestIdleCallback(() => loadSummary().then(resolve), { timeout: 1200 });
        })
      : loadSummary());

    const nextMeeting = summary.meetings[0];
    const fr = summary.flightReviews;

    const summaryItems = [
      nextMeeting
        ? `<li><strong>Next meeting:</strong> ${escapeHtml(nextMeeting.title)} — ${escapeHtml(formatDateFriendly(nextMeeting.date))}</li>`
        : `<li><strong>Next meeting:</strong> None scheduled yet.</li>`,
      summary.attention.length
        ? `<li><strong>Open tasks:</strong> ${summary.attention.length}</li>`
        : `<li><strong>Open tasks:</strong> None right now.</li>`,
      fr.total
        ? `<li><strong>Flight reviews:</strong> ${fr.current} current${fr.dueSoon ? `, ${fr.dueSoon} due soon` : ""}${fr.overdue ? `, ${fr.overdue} overdue` : ""}</li>`
        : `<li><strong>Flight reviews:</strong> None on file yet.</li>`,
    ].join("");

    root.innerHTML = `
      <div class="dash-workspace dash-workspace--simple">
        <header class="dash-hero-band">
          <div class="card-info dash-hero-welcome">
            <p class="dash-hero-eyebrow">TN-170 Oak Ridge Composite Squadron</p>
            <h2 class="dash-hero-title">${escapeHtml(welcomeTitle)}</h2>
            <p class="dash-hero-lead">Your squadron portal for meetings, tasks, and readiness.</p>
            ${accountBlock}
          </div>
          <div class="card-info dash-hero-summary">
            <h3 class="card-info-title">This week at a glance</h3>
            <ul class="dash-summary-list">${summaryItems}</ul>
          </div>
        </header>
        ${renderDiscordCard()}
        ${renderQuickActionsSection()}
      </div>`;

    bindDashboardSteward();
    global.SMTN170PortalNav?.bindLogout?.();
  }

  const PORTAL_TAGLINE = "Private Senior Member operations workspace for TN-170";
  const LEGACY_TOPBAR = /parent|cadet-only|staff area|stay connected|squadron discord|public access|recruitment/i;

  function normalizeTopbarCopy() {
    document.querySelectorAll(".portal-topbar > div > p").forEach((p) => {
      if (LEGACY_TOPBAR.test(p.textContent || "")) p.textContent = PORTAL_TAGLINE;
    });
    document.querySelectorAll("[data-portal-discord]").forEach((el) => el.remove());
  }

  let shellChromeReady = false;

  function initShellChrome() {
    if (shellChromeReady) return;
    shellChromeReady = true;
    bindMobileNav();
    injectFooter();
    normalizeTopbarCopy();
  }

  global.SMTN170Shell = { renderChip, statusClass, statusLabel, initShellChrome, renderDashboardV2 };

  function onProfileChange() {
    if (!document.getElementById("dashboardV2")) return;
    renderDashboardV2().catch((e) => console.warn("[TN-170] dashboard", e));
  }

  global.addEventListener("smtn170:profile-updated", onProfileChange);
})(window);
