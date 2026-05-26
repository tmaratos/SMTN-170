/**
 * TN-170 portal navigation — private Senior Member operations workspace only.
 */
(function initPortalNav(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  const NAV_SECTIONS = [
    {
      id: "main",
      label: "Main",
      items: [
        { key: "home", href: "dashboard.html", label: "Home" },
        { key: "calendar", href: "calendar.html", label: "Calendar" },
        { key: "schedule", href: "schedule.html", label: "Meetings" },
        { key: "files", href: "documents.html", label: "Files & Resources" },
        { key: "orgchart", href: "orgchart.html", label: "Organization Chart" },
      ],
    },
    {
      id: "readiness",
      label: "Readiness",
      items: [
        { key: "bfr", href: "flight-review.html", label: "Flight Reviews" },
        { key: "sui", href: "sui-readiness.html", label: "Inspection Prep" },
        { key: "tasks", href: "tasks.html", label: "Tasks" },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      items: [
        { key: "senior", href: "senior-member.html", label: "Senior Member Workspace" },
        { key: "resources", href: "resources.html", label: "CAP References" },
      ],
    },
    {
      id: "account",
      label: "Account",
      items: [
        { key: "profile", href: "profile.html", label: "My Profile" },
        { key: "admin", href: "admin.html", label: "Admin", requireAdmin: true },
      ],
    },
  ];

  const NAV_HIDDEN = [
    { key: "readiness", href: "readiness.html" },
    { key: "exports", href: "exports.html" },
    { key: "operations", href: "operations.html" },
    { key: "safety", href: "safety.html" },
    { key: "training", href: "training.html" },
  ];

  function allNavItems() {
    return NAV_SECTIONS.flatMap((s) => s.items);
  }

  function currentKey() {
    const path = (global.location.pathname || "").split("/").pop() || "dashboard.html";
    const all = [...allNavItems(), ...NAV_HIDDEN];
    const found = all.find((n) => n.href === path);
    if (found) return found.key;
    if (path === "administration.html") return "admin";
    if (path === "index.html") return "home";
    return document.body?.dataset?.portalPage || "";
  }

  function renderAccountBlock() {
    const session = global.SMTN170Auth?.loadSession?.();
    if (!session) return "";
    const lines =
      global.SMTN170AuthSession?.getAccountCardLines?.() ||
      (() => {
        const profile = global.SMTN170Auth?.getProfile?.();
        const name =
          global.SMTN170Profile?.computeDisplayName?.(profile || session) || session.email || "Member";
        const approved = global.SMTN170Profile?.isProfileStatusApproved?.(profile || session);
        return {
          name,
          rankLine: "",
          email: session.email || "",
          roleLabel: global.SMTN170Auth?.getRoleLabel?.(session.role) || session.role,
          statusLabel: approved ? "" : "Awaiting approval",
          statusClass: approved ? "active" : "pending",
        };
      })();

    const statusClass =
      lines.statusClass === "pending" ? "portal-nav-status--pending" : "portal-nav-status--active";
    const statusBadge = lines.statusLabel
      ? `<span class="portal-nav-status ${statusClass}" title="${escapeHtml(lines.statusLabel)}">${escapeHtml(lines.statusLabel)}</span>`
      : "";

    return `<div class="portal-nav-account-card">
      <div class="portal-nav-account-head">
        <span class="portal-nav-account-name">${escapeHtml(lines.name)}</span>
        ${statusBadge}
      </div>
      ${lines.rankLine ? `<span class="portal-nav-account-rank">${escapeHtml(lines.rankLine)}</span>` : ""}
      <span class="portal-nav-account-role">${escapeHtml(lines.roleLabel)}</span>
      <span class="portal-nav-account-email">${escapeHtml(lines.email)}</span>
      <div class="portal-nav-account-actions">
        <a href="profile.html" class="portal-nav-account-btn" data-steward-action="navigate" data-steward-label="My Profile" data-steward-target="profile.html" data-steward-help="View and edit your portal profile">My Profile</a>
        <button type="button" class="portal-nav-account-btn portal-nav-account-btn--logout" id="portalNavLogout" data-steward-action="logout" data-steward-label="Log Out" data-steward-help="Sign out of the TN-170 portal">Log Out</button>
      </div>
    </div>`;
  }

  const NAV_STEWARD = {
    home: { action: "navigate", label: "Home", target: "dashboard.html", help: "Return to the squadron dashboard" },
    calendar: { action: "navigate", label: "Calendar", target: "calendar.html", help: "View and add squadron calendar events" },
    schedule: { action: "navigate", label: "Meetings", target: "schedule.html", help: "Build the monthly meeting schedule" },
    files: { action: "navigate", label: "Files & Resources", target: "documents.html", help: "Browse squadron resource links" },
    orgchart: { action: "navigate", label: "Organization Chart", target: "orgchart.html", help: "Review staff structure and vacancies" },
    bfr: { action: "navigate", label: "Flight Reviews", target: "flight-review.html", help: "Track BFR status and review nights" },
    sui: { action: "navigate", label: "Inspection Prep", target: "sui-readiness.html", help: "Work through inspection checklist items" },
    tasks: { action: "navigate", label: "Tasks", target: "tasks.html", help: "View squadron tasks and follow-ups" },
    senior: { action: "navigate", label: "Senior Member Workspace", target: "senior-member.html", help: "Open the senior member operations hub" },
    profile: { action: "navigate", label: "My Profile", target: "profile.html", help: "View and edit your portal profile" },
    admin: { action: "navigate", label: "Admin", target: "admin.html", help: "Approve users and manage roles (command staff only)" },
  };

  function stewardAttrs(key) {
    const s = NAV_STEWARD[key];
    if (!s) return "";
    return ` data-steward-action="${escapeHtml(s.action)}" data-steward-label="${escapeHtml(s.label)}" data-steward-target="${escapeHtml(s.target)}" data-steward-help="${escapeHtml(s.help)}"`;
  }

  function renderNavLink(n, active) {
    if (n.stewardOpen) {
      return `<button type="button" class="portal-nav-link portal-nav-link--steward ${active === n.key ? "active" : ""}" data-steward-open${stewardAttrs(n.key)}>${escapeHtml(n.label)}</button>`;
    }
    const featured = n.highlight ? " portal-nav-link--featured" : "";
    return `<a href="${n.href}" class="portal-nav-link${featured} ${active === n.key ? "active" : ""}"${n.requireAdmin ? ' data-require-admin="true"' : ""}${stewardAttrs(n.key)}>${escapeHtml(n.label)}</a>`;
  }

  function canShowAdminNav() {
    const profile = global.TN170_CURRENT_PROFILE || global.SMTN170Auth?.getProfile?.();
    if (global.SMTN170Auth?.computeAllowAdmin) {
      return global.SMTN170Auth.computeAllowAdmin(profile);
    }
    return global.SMTN170Auth?.isAdmin?.() ?? false;
  }

  function renderNav(active) {
    const isAdmin = canShowAdminNav();

    return NAV_SECTIONS.map((section) => {
      const links = section.items
        .filter((n) => !n.requireAdmin || isAdmin)
        .map((n) => renderNavLink(n, active))
        .join("");
      if (!links) return "";
      return `<div class="portal-nav-group"><span class="portal-nav-group-label">${escapeHtml(section.label)}</span>${links}</div>`;
    }).join("");
  }

  function bindLogout() {
    document.querySelectorAll("#portalNavLogout").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          if (global.TN170AuthGuard?.logout) {
            await global.TN170AuthGuard.logout();
          } else if (global.SMTN170AuthSession?.signOut) {
            await global.SMTN170AuthSession.signOut();
          } else if (typeof global.logout === "function") {
            await global.logout();
          }
        } catch (err) {
          console.error("[TN-170] sign out", err);
          global.location.href = "login.html";
        }
      });
    });
  }

  function bindStewardNav() {
    document.querySelectorAll(".portal-nav-link[data-steward-open]").forEach((btn) => {
      if (btn.dataset.stewardNavBound === "1") return;
      btn.dataset.stewardNavBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof global.openSteward === "function") {
          global.openSteward();
        } else if (global.SMTN170Steward?.openSteward) {
          global.SMTN170Steward.openSteward();
        } else if (global.SMTN170Steward?.openPanel) {
          global.SMTN170Steward.openPanel();
        }
        if (global.matchMedia("(max-width: 900px)").matches) {
          document.getElementById("portalSidebar")?.classList.remove("open");
          document.getElementById("portalBackdrop")?.classList.remove("open");
          document.body.classList.remove("menu-open");
        }
      });
    });
  }

  function updateBrandSubtitle() {
    document.querySelectorAll(".portal-brand span").forEach((el) => {
      el.textContent = "Senior Member operations";
    });
  }

  function injectAccountBlock() {
    const sidebar = document.getElementById("portalSidebar");
    if (!sidebar || !global.SMTN170Auth?.loadSession?.()) return;
    let slot = document.getElementById("portalNavAccount");
    if (!slot) {
      slot = document.createElement("div");
      slot.id = "portalNavAccount";
      slot.className = "portal-nav-account-slot";
      sidebar.appendChild(slot);
    }
    const html = renderAccountBlock();
    if (html) slot.innerHTML = html;
    bindLogout();
  }

  function init() {
    const active = currentKey();
    const nav = document.getElementById("portalNav");
    if (nav) nav.innerHTML = renderNav(active);
    document.querySelectorAll("[data-portal-nav]").forEach((el) => {
      el.innerHTML = renderNav(active);
    });
    updateBrandSubtitle();
    injectAccountBlock();
    global.SMTN170Auth?.applyNavVisibility?.();
    global.SMTN170StewardLauncher?.rebind?.();
  }

  global.SMTN170PortalNav = {
    NAV_SECTIONS,
    NAV_HIDDEN,
    allNavItems,
    currentKey,
    renderAccountBlock,
    bindLogout,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.addEventListener("smtn170:auth-changed", init);
  global.addEventListener("smtn170:auth-ready", init);
})(window);
