/**
 * TN-170 portal navigation — simplified for all members.
 */
(function initPortalNav(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getConfig() {
    return global.SMTN170_CONFIG || {};
  }

  function discordUrl() {
    const url = (getConfig().discordInviteUrl || "").trim();
    return url.length > 0 ? url : null;
  }

  function renderDiscordLink(className) {
    const cfg = getConfig();
    const url = discordUrl();
    const label = cfg.discordLabel || "Squadron Discord";
    const hint = cfg.discordHint || "";
    const cls = className || "portal-nav-discord";

    if (!url) {
      return `<span class="${cls} portal-nav-discord--pending">${escapeHtml(label)}<small>Link coming soon</small></span>`;
    }
    return `<a href="${escapeHtml(url)}" class="${cls}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</a>`;
  }

  /** Main sidebar — plain labels, no staff/tools clutter */
  const NAV_PRIMARY = [
    { key: "home", href: "dashboard.html", label: "Home" },
    { key: "calendar", href: "calendar.html", label: "Calendar" },
    { key: "schedule", href: "schedule.html", label: "Meetings" },
    { key: "files", href: "documents.html", label: "Files & Forms" },
    { key: "bfr", href: "flight-review.html", label: "Flight Reviews" },
    { key: "sui", href: "sui-readiness.html", label: "Inspection Prep" },
    { key: "senior", href: "senior-member.html", label: "Senior Members" },
    { key: "cadet", href: "cadet.html", label: "Cadets" },
    { key: "parent", href: "parent.html", label: "Parents" },
    { key: "profile", href: "profile.html", label: "My Profile" },
    { key: "admin", href: "admin.html", label: "Admin" },
  ];

  /** Hidden from sidebar — still routable (Quick Actions, bookmarks) */
  const NAV_HIDDEN = [
    { key: "readiness", href: "readiness.html" },
    { key: "exports", href: "exports.html" },
    { key: "resources", href: "resources.html" },
    { key: "operations", href: "operations.html" },
    { key: "safety", href: "safety.html" },
    { key: "training", href: "training.html" },
  ];

  function currentKey() {
    const path = (global.location.pathname || "").split("/").pop() || "dashboard.html";
    const all = [...NAV_PRIMARY, ...NAV_HIDDEN];
    const found = all.find((n) => n.href === path);
    if (found) return found.key;
    if (path === "administration.html") return "admin";
    if (path === "index.html") return "home";
    return document.body?.dataset?.portalPage || "";
  }

  function renderNav(active) {
    const primary = NAV_PRIMARY.map(
      (n) =>
        `<a href="${n.href}" class="portal-nav-link ${active === n.key ? "active" : ""}">${escapeHtml(n.label)}</a>`
    ).join("");
    const comms = `<div class="portal-nav-comms"><span class="portal-nav-comms-label">Stay connected</span>${renderDiscordLink("portal-nav-discord")}</div>`;
    return `${primary}${comms}`;
  }

  function renderDiscordPlacements() {
    const cfg = getConfig();
    const url = discordUrl();
    const label = cfg.discordLabel || "Squadron Discord";
    const hint = cfg.discordHint || "Member chat and announcements";

    document.querySelectorAll("[data-portal-discord]").forEach((el) => {
      if (!url) {
        el.innerHTML = `<p class="portal-discord-pending"><strong>${escapeHtml(label)}</strong><br>Discord invite for squadron members.</p>`;
        return;
      }
      el.innerHTML = `<a class="portal-discord-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="portal-discord-icon" aria-hidden="true">◇</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></span></a>`;
    });
  }

  function init() {
    const active = currentKey();
    const nav = document.getElementById("portalNav");
    if (nav) nav.innerHTML = renderNav(active);
    document.querySelectorAll("[data-portal-nav]").forEach((el) => {
      el.innerHTML = renderNav(active);
    });
    renderDiscordPlacements();
  }

  global.SMTN170PortalNav = {
    NAV_PRIMARY,
    NAV_HIDDEN,
    currentKey,
    renderDiscordPlacements,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
