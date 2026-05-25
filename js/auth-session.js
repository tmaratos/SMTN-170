/**
 * TN-170 auth session — profile helpers only (no page redirects).
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

  async function requireAuth() {
    await ensureReady();
    return auth()?.loadSession?.() || null;
  }

  async function signOut() {
    if (global.TN170AuthGuard?.logout) {
      await global.TN170AuthGuard.logout();
      return;
    }
    console.log("LOGOUT_CLICKED");
    const sb = global.TN170SupabaseClient || global.SMTN170Supabase?.getClient?.();
    if (sb) await sb.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.location.href = LOGIN;
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

    const approved = profileSvc()?.isProfileStatusApproved?.(profile || session || {});
    return {
      name,
      rankLine: showRankLine ? rank : "",
      email: session.email || profile?.email || "",
      roleLabel: authApi?.getRoleLabel?.(session.role) || session.role || "Member",
      statusLabel: approved ? "" : "Awaiting approval",
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
