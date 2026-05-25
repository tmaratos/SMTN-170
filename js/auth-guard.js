/**
 * TN-170 — single page auth gate (login + dashboard only). No redirects from listeners.
 */
(function initAuthGuard(global) {
  const SUPABASE_URL = "https://hmfbeqnlcchkjyzqnlni.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_4xtWm2-5zUTdvKaJBsEPtQ_0rDyyRai";
  const LOGIN = "login.html";
  const DASHBOARD = "dashboard.html";

  let authChecked = false;
  let client = null;

  function getSupabase() {
    if (client) return client;
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      return null;
    }
    client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
      },
    });
    global.TN170SupabaseClient = client;
    if (global.SMTN170Supabase) {
      global.SMTN170Supabase.getClient = () => client;
    }
    return client;
  }

  function showDashboardLoading() {
    let el = document.getElementById("portalSessionLoading");
    if (!el) {
      el = document.createElement("div");
      el.id = "portalSessionLoading";
      el.className = "portal-session-loading";
      el.innerHTML =
        '<div class="portal-session-loading-card"><div class="portal-session-spinner" aria-hidden="true"></div><p class="portal-session-loading-text">Loading workspace…</p></div>';
      document.body.appendChild(el);
    }
    el.hidden = false;
    const app = document.getElementById("portalApp");
    if (app) app.hidden = true;
  }

  function revealDashboard() {
    const el = document.getElementById("portalSessionLoading");
    if (el) el.hidden = true;
    const app = document.getElementById("portalApp");
    if (app) app.hidden = false;
  }

  async function runLoginPage() {
    if (authChecked) return;
    const sb = getSupabase();
    if (!sb) {
      console.log("LOGIN PAGE SESSION: no client");
      authChecked = true;
      return;
    }
    const { data, error } = await sb.auth.getSession();
    if (error) console.log("LOGIN_ERROR", error.message);
    const hasSession = !!data?.session;
    console.log("LOGIN PAGE SESSION:", hasSession ? "yes" : "no");
    authChecked = true;
    if (hasSession) {
      console.log("REDIRECT REASON: login page found existing session");
      global.location.href = DASHBOARD;
    }
  }

  async function runDashboardPage() {
    if (authChecked) return false;
    showDashboardLoading();
    const sb = getSupabase();
    if (!sb) {
      console.log("DASHBOARD PAGE SESSION: no client");
      console.log("REDIRECT REASON: supabase client missing");
      console.log("DASHBOARD_NO_SESSION_REDIRECT");
      authChecked = true;
      global.location.href = LOGIN;
      return false;
    }
    const { data, error } = await sb.auth.getSession();
    if (error) console.log("LOGIN_ERROR", error.message);
    const hasSession = !!data?.session;
    console.log("DASHBOARD PAGE SESSION:", hasSession ? "yes" : "no");
    authChecked = true;
    if (!hasSession) {
      console.log("REDIRECT REASON: dashboard has no session");
      console.log("DASHBOARD_NO_SESSION_REDIRECT");
      global.location.href = LOGIN;
      return false;
    }
    console.log("DASHBOARD_SESSION_FOUND");
    global.TN170_PAGE_AUTH_HANDLED = true;
    revealDashboard();
    return true;
  }

  async function logout() {
    console.log("LOGOUT_CLICKED");
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.location.href = LOGIN;
  }

  function loadPortalScripts(page) {
    const s = document.createElement("script");
    s.src = "./js/portal-scripts.js?v=6";
    if (page) s.dataset.page = page;
    document.body.appendChild(s);
  }

  global.TN170AuthGuard = {
    getSupabase,
    runLoginPage,
    runDashboardPage,
    logout,
    loadPortalScripts,
    isAuthChecked: () => authChecked,
  };
})(window);
