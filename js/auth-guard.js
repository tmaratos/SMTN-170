/**
 * TN-170 — single Supabase client + page auth gate (no redirect listeners).
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
    if (global.TN170SupabaseClient) {
      client = global.TN170SupabaseClient;
      return client;
    }
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

  function waitForSupabaseSdk(maxMs) {
    return new Promise((resolve) => {
      if (global.supabase?.createClient) {
        resolve(getSupabase());
        return;
      }
      const start = Date.now();
      const t = setInterval(() => {
        if (global.supabase?.createClient) {
          clearInterval(t);
          resolve(getSupabase());
        } else if (Date.now() - start > (maxMs || 8000)) {
          clearInterval(t);
          resolve(null);
        }
      }, 50);
    });
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
    const app = document.getElementById("portalApp");
    if (app) app.hidden = true;
  }

  function hideLoading() {
    const el = document.getElementById("portalSessionLoading");
    if (el) el.hidden = true;
    const app = document.getElementById("portalApp");
    if (app) app.hidden = false;
  }

  async function ensureProtectedSession() {
    if (authChecked && global.TN170_AUTH_SESSION_OK) return true;
    if (!authChecked) showLoading("Loading workspace…");
    const sb = (await waitForSupabaseSdk()) || getSupabase();
    if (!sb) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("REDIRECT REASON: Supabase client not available");
      authChecked = true;
      global.location.href = LOGIN;
      return false;
    }
    const { data, error } = await sb.auth.getSession();
    if (error) console.log("PROFILE_LOAD_ERROR", error.message);
    authChecked = true;
    if (!data?.session) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("REDIRECT REASON: no Supabase session on protected page");
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
    const sb = (await waitForSupabaseSdk()) || getSupabase();
    if (!sb) {
      authChecked = true;
      return;
    }
    const { data, error } = await sb.auth.getSession();
    if (error) console.log("PROFILE_LOAD_ERROR", error.message);
    const hasSession = !!data?.session;
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
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.TN170_AUTH_SESSION_OK = false;
    global.location.href = LOGIN;
  }

  function loadPortalScripts(page) {
    const s = document.createElement("script");
    s.src = "./js/portal-scripts.js?v=7";
    if (page) s.dataset.page = page;
    document.body.appendChild(s);
  }

  global.TN170AuthGuard = {
    getSupabase,
    waitForSupabaseSdk,
    ensureProtectedSession,
    runLoginPage,
    runDashboardPage,
    logout,
    loadPortalScripts,
    showLoading,
    hideLoading,
    isAuthChecked: () => authChecked,
  };
})(window);
