/**
 * Shared squadron portal navigation — CAP operational terminology.
 */
(function initPortalNav(global) {
  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text == null ? "" : String(text);
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
      return `<span class="${cls} portal-nav-discord--pending" title="Add invite URL in portal-config.js">${label}<small>Link coming soon</small></span>`;
    }

    return `<a href="${escapeHtml(url)}" class="${cls}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</a>`;
  }

  const NAV = [
    { key: "home", href: "dashboard.html", label: "Squadron Home", icon: "⌂" },
    { key: "schedule", href: "schedule.html", label: "Monthly Schedule", icon: "▣" },
    { key: "bfr", href: "flight-review.html", label: "Biannual Flight Reviews", icon: "✈" },
    { key: "sui", href: "sui-readiness.html", label: "SUI Readiness", icon: "◆" },
    { key: "operations", href: "operations.html", label: "Operations", icon: "⬡" },
    { key: "safety", href: "safety.html", label: "Safety", icon: "⚠" },
    { key: "training", href: "training.html", label: "Training", icon: "▤" },
    { key: "files", href: "documents.html", label: "File Library", icon: "□" },
    { key: "admin", href: "administration.html", label: "Squadron Administration", icon: "⚙" },
  ];

  const TOOLS = [
    { href: "calendar.html", label: "Squadron Calendar" },
    { href: "exports.html", label: "Print & Export" },
    { href: "resources.html", label: "Reference Shelf" },
  ];

  function currentKey() {
    const path = (global.location.pathname || "").split("/").pop() || "dashboard.html";
    const found = NAV.find((n) => n.href === path);
    if (found) return found.key;
    if (path === "calendar.html") return "schedule";
    if (path === "exports.html") return "schedule";
    if (path === "resources.html") return "files";
    if (path === "index.html") return "home";
    return document.body?.dataset?.portalPage || "";
  }

  function renderShellNav(active) {
    const main = NAV.map(
      (n) =>
        `<a href="${n.href}" class="${active === n.key ? "active" : ""}">${n.label}</a>`
    ).join("");
    const tools = TOOLS.map((t) => `<a href="${t.href}" class="portal-nav-tool">${t.label}</a>`).join("");
    const comms = `<div class="portal-nav-comms"><span class="portal-nav-comms-label">Squadron comms</span>${renderDiscordLink("portal-nav-discord")}</div>`;
    return `${main}<div class="portal-nav-tools">${tools}</div>${comms}`;
  }

  function renderDashboardNav(active) {
    return NAV.map(
      (n) =>
        `<a href="${n.href}" class="${active === n.key ? "active" : ""}"><span>${n.icon}</span> ${n.label}</a>`
    ).join("");
  }

  function renderDiscordPlacements() {
    const cfg = getConfig();
    const url = discordUrl();
    const label = cfg.discordLabel || "Squadron Discord";
    const hint = cfg.discordHint || "Member chat · announcements · coordination";

    document.querySelectorAll("[data-portal-discord]").forEach((el) => {
      if (!url) {
        el.innerHTML = `<p class="portal-discord-pending"><strong>${label}</strong><br>Discord invite will be posted here for squadron members.</p>`;
        return;
      }
      el.innerHTML = `<a class="portal-discord-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="portal-discord-icon" aria-hidden="true">◇</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></span></a>`;
    });
  }

  function init() {
    const active = currentKey();
    document.querySelectorAll("[data-portal-nav]").forEach((el) => {
      const mode = el.dataset.portalNav;
      if (mode === "dashboard") el.innerHTML = renderDashboardNav(active);
      else el.innerHTML = renderShellNav(active);
    });
    renderDiscordPlacements();
  }

  global.SMTN170PortalNav = { NAV, TOOLS, currentKey, renderDiscordLink, discordUrl, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
