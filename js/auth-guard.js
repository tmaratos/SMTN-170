/**
 * TN-170 — Firebase auth gate with profile status routing (no redirect loops).
 */
(function initAuthGuard(global) {
  const LOGIN = "login.html";
  const DASHBOARD = "dashboard.html";
  const PENDING = "pending-approval.html";
  const DENIED = "access-denied.html";
  const ADMIN = "admin.html";

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

  function currentPage() {
    return (global.location.pathname || "").split("/").pop() || "";
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

  async function fetchProfileDoc(userId) {
    const fb = global.SMTN170Firebase;
    await fb?.whenReady?.();
    const mod = fb?.getFirestoreModule?.();
    const db = fb?.getFirestore?.();
    if (!mod || !db || !userId) return null;
    const { doc, getDoc } = mod;
    const snap = await getDoc(doc(db, "profiles", userId));
    if (!snap.exists()) return null;
    return snap.data();
  }

  function normalizeStatus(profile) {
    return String(profile?.status || "").toLowerCase();
  }

  function isActiveStatus(status) {
    return status === "active" || status === "approved";
  }

  function isPendingStatus(status) {
    return status === "pending" || status === "awaiting_approval" || status === "awaiting_verification";
  }

  function isDeniedStatus(status) {
    return status === "denied";
  }

  function destinationForProfile(profile) {
    if (!profile) return PENDING;
    const status = normalizeStatus(profile);
    if (isDeniedStatus(status)) return DENIED;
    if (isPendingStatus(status)) return PENDING;
    if (isActiveStatus(status)) return DASHBOARD;
    return PENDING;
  }

  async function resolvePostLoginUrl(userId) {
    const profile = await fetchProfileDoc(userId);
    return destinationForProfile(profile);
  }

  function isAdminPage(page) {
    return page === ADMIN;
  }

  function canAccessAdmin(profile) {
    if (!profile) return false;
    const status = normalizeStatus(profile);
    if (!isActiveStatus(status)) return false;
    const role = String(profile.role || "").toLowerCase();
    return role === "admin" || role === "commander";
  }

  async function enforceProfileAccess(userId) {
    const page = currentPage();
    const profile = await fetchProfileDoc(userId);
    const dest = destinationForProfile(profile);

    if (isAdminPage(page) && !canAccessAdmin(profile)) {
      return true;
    }

    if (dest === DASHBOARD) {
      if (page === PENDING || page === DENIED || page === LOGIN) {
        global.location.href = DASHBOARD;
        return false;
      }
      return true;
    }

    if (page !== dest) {
      global.location.href = dest;
      return false;
    }
    return true;
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
    if (!session?.user?.id) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("REDIRECT REASON: no Firebase session on protected page");
      global.location.href = LOGIN;
      return false;
    }
    const allowed = await enforceProfileAccess(session.user.id);
    if (!allowed) return false;
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
    const hasSession = !!session?.user?.id;
    console.log("LOGIN PAGE SESSION:", hasSession ? "yes" : "no");
    authChecked = true;
    if (hasSession) {
      const dest = await resolvePostLoginUrl(session.user.id);
      console.log("REDIRECT REASON: login page found existing session");
      global.location.href = dest;
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
    s.src = "./js/portal-scripts.js?v=9";
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
    resolvePostLoginUrl,
    fetchProfileDoc,
    destinationForProfile,
    canAccessAdmin,
  };
})(window);
