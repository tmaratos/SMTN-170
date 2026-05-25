/**
 * Portal bootstrap — profile sync only. Page routing is in js/auth-guard.js (login/dashboard).
 */
(function initPortalBootstrap(global) {
  let authChecked = false;

  function showLoading(msg) {
    if (global.TN170_PAGE_AUTH_HANDLED) return;
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
    if (global.TN170_PAGE_AUTH_HANDLED) {
      try {
        await global.SMTN170Auth?.init?.();
      } finally {
        hideLoading();
      }
      return;
    }

    showLoading("Loading workspace…");
    try {
      const sb = global.TN170SupabaseClient || global.SMTN170Supabase?.getClient?.();
      if (sb) {
        const { data } = await sb.auth.getSession();
        if (!authChecked) {
          authChecked = true;
          if (!data?.session) {
            console.log("REDIRECT REASON: protected page no session");
            global.location.href = "login.html";
            return;
          }
        }
      }
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
