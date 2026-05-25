/**
 * TN-170 portal navigation — v2 operational structure.
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

  const NAV_PRIMARY = [
    { key: "home", href: "dashboard.html", label: "Squadron Home" },
    { key: "readiness", href: "readiness.html", label: "Mission Readiness" },
    { key: "schedule", href: "schedule.html", label: "Monthly Schedule" },
    { key: "calendar", href: "calendar.html", label: "Squadron Calendar" },
    { key: "senior", href: "senior-member.html", label: "Senior Member" },
    { key: "cadet", href: "cadet.html", label: "Cadet Area" },
    { key: "parent", href: "parent.html", label: "Parent / Observer" },
    { key: "files", href: "documents.html", label: "File Library" },
    { key: "profile", href: "profile.html", label: "My Profile" },
  ];

  const NAV_STAFF = [
    { key: "bfr", href: "flight-review.html", label: "Biannual Flight Reviews" },
    { key: "sui", href: "sui-readiness.html", label: "SUI Readiness" },
    { key: "admin", href: "admin.html", label: "Admin & Settings" },
  ];

  const NAV_TOOLS = [
    { href: "exports.html", label: "Print & Export" },
    { href: "resources.html", label: "Reference Shelf" },
    { href: "operations.html", label: "Operations hub" },
    { href: "safety.html", label: "Safety hub" },
    { href: "training.html", label: "Training hub" },
  ];

  function currentKey() {
    const path = (global.location.pathname || "").split("/").pop() || "dashboard.html";
    const all = [...NAV_PRIMARY, ...NAV_STAFF, ...NAV_TOOLS.map((t) => ({ key: t.href, href: t.href }))];
    const found = all.find((n) => n.href === path);
    if (found) return found.key;
    if (path === "administration.html") return "admin";
    if (path === "index.html") return "home";
    return document.body?.dataset?.portalPage || "";
  }

  function renderNav(active) {
    const primary = NAV_PRIMARY.map(
      (n) => `<a href="${n.href}" class="${active === n.key ? "active" : ""}">${escapeHtml(n.label)}</a>`
    ).join("");
    const staff = NAV_STAFF.map(
      (n) => `<a href="${n.href}" class="portal-nav-staff ${active === n.key ? "active" : ""}">${escapeHtml(n.label)}</a>`
    ).join("");
    const tools = NAV_TOOLS.map((t) => `<a href="${t.href}" class="portal-nav-tool">${escapeHtml(t.label)}</a>`).join("");
    const comms = `<div class="portal-nav-comms"><span class="portal-nav-comms-label">Squadron comms</span>${renderDiscordLink("portal-nav-discord")}</div>`;
    return `${primary}<div class="portal-nav-section"><span>Staff &amp; compliance</span>${staff}</div><div class="portal-nav-tools">${tools}</div>${comms}`;
  }

  function renderDiscordPlacements() {
    const cfg = getConfig();
    const url = discordUrl();
    const label = cfg.discordLabel || "Squadron Discord";
    const hint = cfg.discordHint || "Member chat · announcements";

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
    NAV_STAFF,
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
