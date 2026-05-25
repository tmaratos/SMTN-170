/**
 * Shared squadron portal navigation — CAP operational terminology.
 */
(function initPortalNav(global) {
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
    return `${main}<div class="portal-nav-tools">${tools}</div>`;
  }

  function renderDashboardNav(active) {
    return NAV.map(
      (n) =>
        `<a href="${n.href}" class="${active === n.key ? "active" : ""}"><span>${n.icon}</span> ${n.label}</a>`
    ).join("");
  }

  function init() {
    const active = currentKey();
    document.querySelectorAll("[data-portal-nav]").forEach((el) => {
      const mode = el.dataset.portalNav;
      if (mode === "dashboard") el.innerHTML = renderDashboardNav(active);
      else el.innerHTML = renderShellNav(active);
    });
  }

  global.SMTN170PortalNav = { NAV, TOOLS, currentKey, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
