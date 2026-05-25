/**
 * Portal bootstrap — session restore loading gate, standard init order.
 */
(function initPortalBootstrap(global) {
  const LOGIN_PAGES = ["login.html", "index.html", "pending-approval.html", ""];

  function currentPage() {
    return (global.location.pathname || "").split("/").pop() || "";
  }

  function isLoginPage() {
    return LOGIN_PAGES.includes(currentPage());
  }

  function showLoading(msg) {
    let el = document.getElementById("portalSessionLoading");
    if (!el) {
      el = document.createElement("div");
      el.id = "portalSessionLoading";
      el.className = "portal-session-loading";
      el.innerHTML = `<div class="portal-session-loading-card"><div class="portal-session-spinner" aria-hidden="true"></div><p class="portal-session-loading-text">${msg || "Loading workspace…"}</p></div>`;
      document.body.appendChild(el);
    }
    el.hidden = false;
  }

  function hideLoading() {
    const el = document.getElementById("portalSessionLoading");
    if (el) el.hidden = true;
  }

  async function bootstrap() {
    if (isLoginPage()) {
      hideLoading();
      return global.SMTN170Auth?.init?.();
    }
    showLoading("Loading workspace…");
    try {
      await global.SMTN170Supabase?.whenReady?.();
      await global.SMTN170Auth?.init?.();
    } finally {
      hideLoading();
    }
  }

  function start() {
    bootstrap();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  global.SMTN170Bootstrap = { showLoading, hideLoading, bootstrap };
})(window);
