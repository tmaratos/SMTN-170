/**
 * TN-170 — Firebase auth gate with profile status routing (no redirect loops).
 */
(function initAuthGuard(global) {
  const LOGIN = "login.html";
  const DASHBOARD = "dashboard.html";
  const PENDING = "pending-approval.html";
  const DENIED = "access-denied.html";
  const ADMIN = "admin.html";

  const PUBLIC_PAGES = new Set([
    LOGIN,
    "create-profile.html",
    PENDING,
    DENIED,
  ]);

  const PROTECTED_PAGES = new Set([
    DASHBOARD,
    "profile.html",
    "calendar.html",
    "schedule.html",
    "orgchart.html",
    "tasks.html",
    "documents.html",
    "sui-readiness.html",
    "flight-review.html",
    ADMIN,
    "resources.html",
    "senior-member.html",
  ]);

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

  function isLoginPage() {
    return currentPage() === LOGIN;
  }

  function isPublicPage(page) {
    return PUBLIC_PAGES.has(page || currentPage());
  }

  function isProtectedPage(page) {
    return PROTECTED_PAGES.has(page || currentPage());
  }

  async function waitForFirebase(maxMs, options) {
    const authOnly = options?.authOnly ?? isLoginPage();
    const start = Date.now();
    while (Date.now() - start < (maxMs || 10000)) {
      await global.SMTN170Firebase?.whenReady?.({ authOnly });
      const client = global.SMTN170Firebase?.getClient?.();
      if (client) return client;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async function waitForAuthState(maxMs) {
    await waitForFirebase(maxMs, { authOnly: false });
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
    await fb?.ensureFullClient?.();
    const mod = fb?.getFirestoreModule?.();
    const db = fb?.getFirestore?.();
    if (!mod || !db || !userId) return null;
    const { doc, getDoc } = mod;
    const path = `profiles/${userId}`;
    console.log("PROFILE_PATH_CHECKED", path);
    const snap = await getDoc(doc(db, "profiles", userId));
    console.log("PROFILE_EXISTS", snap.exists());
    if (!snap.exists()) return null;
    return snap.data();
  }

  function normalizeStatus(profile) {
    const raw = profile?.status ?? profile?.accountStatus ?? "";
    return String(raw).toLowerCase().trim();
  }

  function profileRole(profile) {
    return String(profile?.role || "").toLowerCase().trim();
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
    if (!profile) return `${PENDING}?reason=no-profile`;
    const status = normalizeStatus(profile);
    if (isDeniedStatus(status)) return DENIED;
    if (isActiveStatus(status)) return DASHBOARD;
    if (isPendingStatus(status)) return PENDING;
    return PENDING;
  }

  function logRouteDecision(userId, email, profile, dest) {
    console.log("AUTH_UID", userId || "(none)");
    console.log("AUTH_EMAIL", email || "(none)");
    console.log("PROFILE_STATUS", profile ? normalizeStatus(profile) : "(none)");
    console.log("PROFILE_ROLE", profile ? profileRole(profile) : "(none)");
    console.log("ROUTE_DECISION", dest);
  }

  async function resolvePostLoginUrl(userId, email) {
    const profile = await fetchProfileDoc(userId);
    const dest = destinationForProfile(profile);
    logRouteDecision(userId, email, profile, dest);
    return dest;
  }

  function isAdminPage(page) {
    return page === ADMIN;
  }

  function canAccessAdmin(profile) {
    if (!profile) return false;
    const status = normalizeStatus(profile);
    if (!isActiveStatus(status)) return false;
    const role = profileRole(profile);
    return role === "admin" || role === "commander";
  }

  async function enforceProfileAccess(userId, email) {
    const page = currentPage();
    const profile = await fetchProfileDoc(userId);
    const dest = destinationForProfile(profile);
    logRouteDecision(userId, email, profile, dest);

    if (isAdminPage(page) && !canAccessAdmin(profile)) {
      global.location.href = DASHBOARD;
      return false;
    }

    if (dest === DASHBOARD) {
      return true;
    }

    if (page !== dest.split("?")[0]) {
      global.location.href = dest;
      return false;
    }
    return true;
  }

  async function ensureProtectedSession() {
    const page = currentPage();
    if (isPublicPage(page) || !isProtectedPage(page)) {
      return true;
    }

    if (authChecked && global.TN170_AUTH_SESSION_OK) return true;
    if (!authChecked) showLoading("Loading workspace…");

    const client = await waitForFirebase(undefined, { authOnly: false });
    if (!client) {
      console.log("SESSION_MISSING_REDIRECT");
      console.log("ROUTE_DECISION", LOGIN);
      authChecked = true;
      global.location.href = LOGIN;
      return false;
    }

    const session = await waitForAuthState();
    authChecked = true;

    if (!session?.user?.id) {
      console.log("AUTH_UID", "(none)");
      console.log("AUTH_EMAIL", "(none)");
      console.log("ROUTE_DECISION", LOGIN);
      global.location.href = LOGIN;
      return false;
    }

    const allowed = await enforceProfileAccess(session.user.id, session.user.email);
    if (!allowed) return false;

    console.log("SESSION_FOUND");
    console.log("AUTH_INIT_OK");
    global.TN170_AUTH_SESSION_OK = true;
    hideLoading();
    return true;
  }

  async function runLoginPage() {
    if (authChecked) return;
    const client = await waitForFirebase(10000, { authOnly: true });
    if (!client) {
      authChecked = true;
      return;
    }
    const session = await waitForAuthState();
    const hasSession = !!session?.user?.id;
    console.log("LOGIN PAGE SESSION:", hasSession ? "yes" : "no");
    authChecked = true;
    if (hasSession) {
      const dest = await resolvePostLoginUrl(session.user.id, session.user.email);
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
    if (client?.auth) await client.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.TN170_AUTH_SESSION_OK = false;
    global.location.href = LOGIN;
  }

  function loadPortalScripts(page) {
    const s = document.createElement("script");
    s.src = "./js/portal-scripts.js?v=10";
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
    isPublicPage,
    isProtectedPage,
  };
})(window);
