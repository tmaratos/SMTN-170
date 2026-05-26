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
        <a href="profile.html" class="portal-nav-account-btn">My Profile</a>
        <button type="button" class="portal-nav-account-btn portal-nav-account-btn--logout" id="portalNavLogout">Log Out</button>
      </div>
    </div>`;
  }

  function renderNavLink(n, active) {
    if (n.stewardOpen) {
      return `<button type="button" class="portal-nav-link portal-nav-link--steward ${active === n.key ? "active" : ""}" data-steward-open>${escapeHtml(n.label)}</button>`;
    }
    const featured = n.highlight ? " portal-nav-link--featured" : "";
    return `<a href="${n.href}" class="portal-nav-link${featured} ${active === n.key ? "active" : ""}"${n.requireAdmin ? ' data-require-admin="true"' : ""}>${escapeHtml(n.label)}</a>`;
  }

  function renderNav(active) {
    const isAdmin = global.SMTN170Auth?.isAdmin?.() ?? false;

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

  function init() {
    const active = currentKey();
    const nav = document.getElementById("portalNav");
    if (nav) nav.innerHTML = renderNav(active);
    document.querySelectorAll("[data-portal-nav]").forEach((el) => {
      el.innerHTML = renderNav(active);
    });
    updateBrandSubtitle();
    bindLogout();
    global.SMTN170Auth?.applyNavVisibility?.();
    global.SMTN170Steward?.rebind?.();
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
})(window);
