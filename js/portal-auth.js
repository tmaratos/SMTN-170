/**
 * TN-170 portal auth — Supabase session + profiles.
 * Login: email + password only. Display via SMTN170Profile helpers.
 */
(function initPortalAuth(global) {
  const LOGIN_PATH = "login.html";
  const PENDING_PATH = "pending-approval.html";

  const ROLES = {
    COMMANDER: { id: "commander", label: "Commander" },
    COMMAND_STAFF: { id: "command_staff", label: "Command Staff" },
    SENIOR_MEMBER: { id: "senior_member", label: "Senior Member" },
    SENIOR_MEMBER_LIMITED: { id: "senior_member_limited", label: "Senior Member Limited" },
  };

  const ACCOUNT_STATUS = {
    AWAITING: "awaiting_verification",
    APPROVED: "approved",
  };

  const ADMIN_ROLES = [ROLES.COMMANDER.id, ROLES.COMMAND_STAFF.id];
  const ADMIN_ACTIONS = new Set([
    "approve_users",
    "change_roles",
    "delete_records",
    "global_settings",
    "supabase_config",
  ]);

  let session = null;
  let profile = null;
  let initialized = false;

  const Profile = () => global.SMTN170Profile;

  function mapProfile(row) {
    if (!row) return null;
    const mapped = Profile()?.mapSessionFromProfile?.(row);
    if (mapped) {
      mapped.roleLabel = getRoleLabel(mapped.role);
      return mapped;
    }
    return {
      userId: row.id,
      email: row.email,
      displayName: row.email,
      role: row.role || ROLES.SENIOR_MEMBER.id,
      accountStatus: row.account_status || ACCOUNT_STATUS.AWAITING,
      unit: "TN-170 Oak Ridge Composite Squadron",
    };
  }

  function loadSession() {
    return session;
  }

  function getProfile() {
    return profile;
  }

  async function fetchProfile(userId) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb || !userId) return null;
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.warn("[TN-170] profile fetch", error.message);
      return null;
    }
    return data;
  }

  async function syncSessionFromSupabase() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) {
      session = null;
      profile = null;
      return null;
    }
    const { data: authData } = await sb.auth.getSession();
    const user = authData?.session?.user;
    if (!user) {
      session = null;
      profile = null;
      return null;
    }
    const row = await fetchProfile(user.id);
    profile = row;
    session = mapProfile(row) || {
      userId: user.id,
      email: user.email || "",
      displayName: user.email?.split("@")[0] || "",
      firstName: "",
      lastName: "",
      preferredName: "",
      rank: "",
      role: ROLES.SENIOR_MEMBER.id,
      roleLabel: getRoleLabel(ROLES.SENIOR_MEMBER.id),
      accountStatus: ACCOUNT_STATUS.AWAITING,
      unit: "TN-170 Oak Ridge Composite Squadron",
    };
    return session;
  }

  async function updateOwnProfile(formData) {
    const sb = global.SMTN170Supabase?.getClient?.();
    const uid = session?.userId;
    if (!sb || !uid) throw new Error("You must be signed in to update your profile.");

    const patch = Profile()?.pickEditablePayload?.(formData) || {};
    const merged = { ...profile, ...patch, email: profile?.email || session?.email };
    patch.display_name = Profile()?.computeDisplayName?.(merged) || merged.email;
    patch.updated_at = new Date().toISOString();

    const { error } = await sb.from("profiles").update(patch).eq("id", uid);
    if (error) throw error;

    await syncSessionFromSupabase();
    global.dispatchEvent(new CustomEvent("smtn170:profile-updated", { detail: { profile } }));
    global.dispatchEvent(new CustomEvent("smtn170:auth-changed", { detail: { session } }));
    return profile;
  }

  function getRoleLabel(roleId) {
    return Object.values(ROLES).find((r) => r.id === roleId)?.label || roleId;
  }

  function getWelcomeGreeting() {
    return Profile()?.computeWelcomeGreeting?.(profile || session) || { label: "", full: "Welcome back." };
  }

  function isProfileIncomplete() {
    return Profile()?.isProfileIncomplete?.(profile) ?? false;
  }

  function isAuthenticated() {
    return !!session;
  }

  function isApproved(s) {
    const x = s || session;
    return x && x.accountStatus === ACCOUNT_STATUS.APPROVED;
  }

  function isAdmin(s) {
    const x = s || session;
    return x && isApproved(x) && ADMIN_ROLES.includes(x.role);
  }

  function can(action, s) {
    const x = s || session;
    if (!x) return false;
    if (ADMIN_ACTIONS.has(action)) return isAdmin(x);
    if (action === "view_portal") return isApproved(x);
    if (action === "view_pending") return x.accountStatus === ACCOUNT_STATUS.AWAITING;
    return isApproved(x);
  }

  async function signIn(email, password) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) throw new Error("Supabase is not configured. Set SUPABASE_URL in js/supabase-config.js");
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await syncSessionFromSupabase();
    return session;
  }

  async function signUp(email, password) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) throw new Error("Supabase is not configured");
    const { error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: email.split("@")[0] },
      },
    });
    if (error) throw error;
    await syncSessionFromSupabase();
    return { session };
  }

  async function logout() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (sb) await sb.auth.signOut();
    session = null;
    profile = null;
    try {
      sessionStorage.removeItem("smtn170_had_session");
      sessionStorage.removeItem("smtn170_profile_banner_dismissed");
    } catch {
      /* ignore */
    }
  }

  function formatAuditLine(meta) {
    if (!meta) return "";
    const who =
      meta.last_worked_by_name ||
      meta.last_worked_by_display ||
      meta.uploaded_by_name ||
      meta.updated_by_name ||
      "—";
    const when = meta.last_worked_at || meta.updated_at;
    let whenStr = "";
    if (when) {
      try {
        whenStr = new Date(when).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } catch {
        whenStr = when;
      }
    }
    return whenStr ? `Last worked by ${who} · ${whenStr}` : `Last worked by ${who}`;
  }

  function renderAuditHtml(meta) {
    const line = formatAuditLine(meta);
    if (!line) return "";
    const d = document.createElement("div");
    d.textContent = line;
    return `<p class="record-audit" role="note">${d.innerHTML}</p>`;
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  /** Audit attribution — single display name, no duplicate rank. */
  function actorDisplay() {
    if (!session && !profile) return "Member";
    return Profile()?.computeDisplayName?.(profile || session) || session?.email || "Member";
  }

  function actorId() {
    return session?.userId || null;
  }

  /** Pages removed from the Senior Member portal — redirect authenticated users home, others to login. */
  const DEPRECATED_PAGES = new Set([
    "cadet.html",
    "parent.html",
    "operations.html",
    "safety.html",
    "training.html",
    "exports.html",
    "readiness.html",
    "exports.html",
    "administration.html",
    "styles.html",
  ]);

  function guardPage() {
    const path = (global.location.pathname || "").split("/").pop() || "";
    const loginOnlyPages = ["", "index.html", LOGIN_PATH, "login.html"];

    if (!initialized) return;

    if (DEPRECATED_PAGES.has(path)) {
      global.location.replace(session ? "dashboard.html" : LOGIN_PATH);
      return;
    }

    if (loginOnlyPages.includes(path)) {
      if (session && isApproved()) {
        global.location.replace("dashboard.html");
      }
      return;
    }

    if (!session) {
      const hadAttempt = sessionStorage.getItem("smtn170_had_session") === "1";
      const q = hadAttempt ? "?expired=1" : "";
      global.location.replace(LOGIN_PATH + q);
      return;
    }

    sessionStorage.setItem("smtn170_had_session", "1");

    if (session.accountStatus === ACCOUNT_STATUS.AWAITING) {
      if (path !== PENDING_PATH) global.location.replace(PENDING_PATH);
      return;
    }

    if (path === PENDING_PATH) {
      global.location.replace("dashboard.html");
      return;
    }

    if (path === "admin.html" && !isAdmin()) {
      global.location.replace("dashboard.html");
    }
  }

  function applyNavVisibility() {
    document.querySelectorAll('[data-require-admin="true"]').forEach((el) => {
      el.hidden = !isAdmin();
    });
  }

  async function init() {
    await global.SMTN170Supabase?.whenReady?.();
    await syncSessionFromSupabase();
    initialized = true;
    guardPage();
    applyNavVisibility();

    global.SMTN170Supabase?.onAuthStateChange?.(async () => {
      await syncSessionFromSupabase();
      guardPage();
      applyNavVisibility();
      global.dispatchEvent(new CustomEvent("smtn170:auth-changed", { detail: { session } }));
    });
  }

  /** Local-only fallback when Supabase URL is not configured (development). */
  function login(email, accountStatus, role) {
    profile = {
      id: "local-user",
      email: email || "member@example.com",
      first_name: "",
      last_name: "",
      preferred_name: "",
      rank: "",
      role: role || ROLES.SENIOR_MEMBER.id,
      account_status: accountStatus || ACCOUNT_STATUS.APPROVED,
      updated_at: new Date().toISOString(),
    };
    session = mapProfile(profile);
    return session;
  }

  global.SMTN170Auth = {
    ROLES,
    ACCOUNT_STATUS,
    ADMIN_ROLES,
    ADMIN_ACTIONS,
    init,
    loadSession,
    getProfile,
    syncSessionFromSupabase,
    updateOwnProfile,
    getRoleLabel,
    getWelcomeGreeting,
    isProfileIncomplete,
    isAuthenticated,
    isApproved,
    isAdmin,
    can,
    signIn,
    signUp,
    signOut: logout,
    logout,
    login,
    formatAuditLine,
    renderAuditHtml,
    actorDisplay,
    actorId,
    guardPage,
    applyNavVisibility,
  };
})(window);
