/**
 * TN-170 auth session — centralized helpers for pages and components.
 * Wraps SMTN170Auth + Supabase; use this instead of duplicating auth logic.
 */
(function initAuthSession(global) {
  const LOGIN = "login.html";

  function auth() {
    return global.SMTN170Auth;
  }

  function profileSvc() {
    return global.SMTN170Profile;
  }

  async function ensureReady() {
    await global.SMTN170Supabase?.whenReady?.();
    await auth()?.init?.();
  }

  async function getCurrentUser() {
    await ensureReady();
    return auth()?.loadSession?.() || null;
  }

  async function loadProfile() {
    await ensureReady();
    return auth()?.getProfile?.() || null;
  }

  async function syncProfile() {
    await auth()?.syncSessionFromSupabase?.();
    return loadProfile();
  }

  function isAuthenticated() {
    return !!auth()?.loadSession?.();
  }

  function isApproved() {
    return auth()?.isApproved?.() ?? false;
  }

  /**
   * Redirect to login if no session. Call on protected pages after bootstrap.
   */
  async function requireAuth() {
    await ensureReady();
    const sb = global.SMTN170Supabase?.getClient?.();
    const { data: authData, error } = sb
      ? await sb.auth.getSession()
      : { data: { session: null }, error: null };
    if (error) {
      console.error("Session check error:", error);
    }
    if (!authData?.session) {
      console.log("No session found");
      console.log("Redirecting to login");
      global.location.replace(LOGIN + "?expired=1");
      return null;
    }
    await auth()?.syncSessionFromSupabase?.();
    const session = auth()?.loadSession?.();
    if (!session) {
      console.log("Redirecting to login");
      global.location.replace(LOGIN + "?expired=1");
      return null;
    }
    if (session.accountStatus === auth().ACCOUNT_STATUS.AWAITING) {
      if (!global.location.pathname.endsWith("pending-approval.html")) {
        global.location.replace("pending-approval.html");
      }
      return session;
    }
    return session;
  }

  async function signOut() {
    try {
      if (typeof global.logout === "function") {
        await global.logout();
      } else {
        await auth()?.logout?.();
      }
    } finally {
      sessionStorage.removeItem("smtn170_profile_banner_dismissed");
      global.location.href = LOGIN + "?signed_out=1";
    }
  }

  function getDisplayName() {
    const profile = auth()?.getProfile?.();
    const session = auth()?.loadSession?.();
    return profileSvc()?.computeDisplayName?.(profile || session) || session?.email || "";
  }

  function getAccountCardLines() {
    const profile = auth()?.getProfile?.();
    const session = auth()?.loadSession?.();
    const authApi = auth();
    if (!session) return null;

    const name = profileSvc()?.computeDisplayName?.(profile || session) || session.email;
    const preferred = (profile?.preferred_name || session?.preferredName || "").trim();
    const rank = profileSvc()?.normalizeRank?.(profile?.rank || session?.rank) || "";
    const showRankLine = rank && preferred;

    const approved = session.accountStatus === authApi?.ACCOUNT_STATUS?.APPROVED;
    return {
      name,
      rankLine: showRankLine ? rank : "",
      email: session.email || profile?.email || "",
      roleLabel: authApi?.getRoleLabel?.(session.role) || session.role || "Member",
      statusLabel: approved ? "Active" : "Awaiting approval",
      statusClass: approved ? "active" : "pending",
    };
  }

  global.SMTN170AuthSession = {
    LOGIN_PATH: LOGIN,
    ensureReady,
    getCurrentUser,
    loadProfile,
    syncProfile,
    isAuthenticated,
    isApproved,
    requireAuth,
    signOut,
    getDisplayName,
    getAccountCardLines,
    getWelcomeGreeting: () => auth()?.getWelcomeGreeting?.(),
    isProfileIncomplete: () => auth()?.isProfileIncomplete?.(),
    updateOwnProfile: (data) => auth()?.updateOwnProfile?.(data),
  };
})(window);
