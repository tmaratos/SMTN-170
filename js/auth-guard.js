/**
 * TN-170 — Firebase auth gate for protected portal pages (no redirect loops).
 */
(function initAuthGuard(global) {
  const LOGIN = "login.html";
  const DASHBOARD = "dashboard.html";

  let authChecked = false;

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
    const app = document.getElementById("portalApp");
    if (app) app.hidden = true;
  }

  function hideLoading() {
    const el = document.getElementById("portalSessionLoading");
    if (el) el.hidden = true;
    const app = document.getElementById("portalApp");
    if (app) app.hidden = false;
  }

  async function waitForFirebase(maxMs) {
    const start = Date.now();
    while (Date.now() - start < (maxMs || 10000)) {
      await global.SMTN170Firebase?.whenReady?.();
      const client = global.SMTN170Firebase?.getClient?.();
      if (client) return client;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async function waitForAuthState(maxMs) {
    await waitForFirebase(maxMs);
    const fb = global.SMTN170Firebase;
    if (!fb) return null;
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, maxMs || 10000);
      const { data } = fb.onAuthStateChange((_event, session) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        data?.subscription?.unsubscribe?.();
        resolve(session);
      });
    });
  }

  async function ensureProtectedSession() {
    if (authChecked && global.TN170_AUTH_SESSION_OK) return true;
    if (!authChecked) showLoading("Loading workspace…");
    const client = await waitForFirebase();
    if (!client) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("REDIRECT REASON: Firebase client not available");
      authChecked = true;
      global.location.href = LOGIN;
      return false;
    }
    const session = await waitForAuthState();
    authChecked = true;
    if (!session) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("REDIRECT REASON: no Firebase session on protected page");
      global.location.href = LOGIN;
      return false;
    }
    console.log("SESSION_FOUND");
    console.log("AUTH_INIT_OK");
    global.TN170_AUTH_SESSION_OK = true;
    hideLoading();
    return true;
  }

  async function runLoginPage() {
    if (authChecked) return;
    const client = await waitForFirebase();
    if (!client) {
      authChecked = true;
      return;
    }
    const session = await waitForAuthState();
    const hasSession = !!session;
    console.log("LOGIN PAGE SESSION:", hasSession ? "yes" : "no");
    authChecked = true;
    if (hasSession) {
      console.log("REDIRECT REASON: login page found existing session");
      global.location.href = DASHBOARD;
    }
  }

  async function runDashboardPage() {
    if (authChecked && global.TN170_PAGE_AUTH_HANDLED) return global.TN170_AUTH_SESSION_OK !== false;
    showLoading("Loading workspace…");
    const ok = await ensureProtectedSession();
    if (!ok) {
      console.log("DASHBOARD_NO_SESSION_REDIRECT");
      return false;
    }
    console.log("DASHBOARD_SESSION_FOUND");
    global.TN170_PAGE_AUTH_HANDLED = true;
    return true;
  }

  async function logout() {
    console.log("LOGOUT_CLICKED");
    const client = global.SMTN170Firebase?.getClient?.();
    if (client) await client.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.TN170_AUTH_SESSION_OK = false;
    global.location.href = LOGIN;
  }

  function loadPortalScripts(page) {
    const s = document.createElement("script");
    s.src = "./js/portal-scripts.js?v=8";
    if (page) s.dataset.page = page;
    document.body.appendChild(s);
  }

  function getFirebaseClient() {
    return global.SMTN170Firebase?.getClient?.() || null;
  }

  global.TN170AuthGuard = {
    waitForFirebase,
    waitForAuthState,
    ensureProtectedSession,
    runLoginPage,
    runDashboardPage,
    logout,
    loadPortalScripts,
    showLoading,
    hideLoading,
    isAuthChecked: () => authChecked,
    getFirebaseClient,
  };
})(window);
