/**
 * TN-170 auth — Firebase session + profiles (login entry: js/auth.js).
 * Requires: firebase-config.js, firebase-client.js, firebase-data.js, profile-service.js
 */
(function initPortalAuth(global) {
  const LOGIN_PATH = "login.html";
  const PENDING_PATH = "pending-approval.html";
  const DENIED_PATH = "access-denied.html";

  const ROLES = {
    COMMANDER: { id: "commander", label: "Commander" },
    COMMAND_STAFF: { id: "command_staff", label: "Command Staff" },
    SENIOR_MEMBER: { id: "senior_member", label: "Senior Member" },
    SENIOR_MEMBER_LIMITED: { id: "senior_member_limited", label: "Senior Member Limited" },
  };

  const ACCOUNT_STATUS = {
    PENDING: "pending",
    AWAITING: "awaiting_approval",
    APPROVED: "approved",
    ACTIVE: "active",
    DENIED: "denied",
  };

  const ADMIN_ROLES = [ROLES.COMMANDER.id, ROLES.COMMAND_STAFF.id, "admin", "Admin"];
  const ADMIN_ACTIONS = new Set([
    "approve_users",
    "change_roles",
    "delete_records",
    "global_settings",
    "firebase_config",
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
      status: Profile()?.getProfileStatus?.(row) || ACCOUNT_STATUS.AWAITING,
      accountStatus: Profile()?.getProfileStatus?.(row) || ACCOUNT_STATUS.AWAITING,
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
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb || !userId) return null;
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.warn("[TN-170] profile fetch", error.message);
      return null;
    }
    return data;
  }

  async function syncSessionFromFirebase() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) {
      session = null;
      profile = null;
      return null;
    }
    const { data: authData, error } = await sb.auth.getSession();
    if (error) {
      console.error("Session check error:", error);
    }
    const user = authData?.session?.user;
    if (!user) {
      console.log("No session found");
      session = null;
      profile = null;
      return null;
    }
    console.log("SESSION_FOUND");
    const row = await fetchProfile(user.id);
    if (row) console.log("PROFILE_LOAD_OK");
    else console.log("PROFILE_LOAD_ERROR", "no profiles row — using session fallback");
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
      status: ACCOUNT_STATUS.AWAITING,
      accountStatus: ACCOUNT_STATUS.AWAITING,
      unit: "TN-170 Oak Ridge Composite Squadron",
    };
    return session;
  }

  async function updateOwnProfile(formData) {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    const uid = session?.userId;
    if (!sb || !uid) throw new Error("You must be signed in to update your profile.");

    const patch = Profile()?.pickEditablePayload?.(formData) || {};

    const { error } = await sb.from("profiles").update(patch).eq("id", uid);
    if (error) throw new Error(error.message || "Could not save profile.");

    await syncSessionFromFirebase();
    global.dispatchEvent(new CustomEvent("smtn170:profile-updated", { detail: { profile } }));
    global.dispatchEvent(new CustomEvent("smtn170:auth-changed", { detail: { session } }));
    return profile;
  }

  function getRoleLabel(roleId) {
    if (!roleId) return "—";
    const id = String(roleId);
    const normalized = id.toLowerCase().replace(/\s+/g, "_");
    const found = Object.values(ROLES).find((r) => r.id === normalized || r.id === id);
    if (found) return found.label;
    if (normalized === "admin") return "Admin";
    return id;
  }

  function isAdminRole(roleId) {
    const r = String(roleId || "").toLowerCase();
    return ADMIN_ROLES.some((a) => String(a).toLowerCase() === r) || r === "admin";
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
    const x = s || profile || session;
    return Profile()?.isProfileStatusApproved?.(x) ?? false;
  }

  function isPending(s) {
    const x = s || profile || session;
    return Profile()?.isProfileStatusAwaiting?.(x) ?? false;
  }

  function isDenied(s) {
    const x = s || profile || session;
    return Profile()?.isProfileStatusDenied?.(x) ?? false;
  }

  function getPostLoginPath() {
    if (!session && !profile) return PENDING_PATH;
    if (isDenied()) return DENIED_PATH;
    if (isPending()) return PENDING_PATH;
    if (isApproved()) return "dashboard.html";
    return PENDING_PATH;
  }

  function isAdmin(s) {
    const x = s || profile || session;
    return x && isApproved(x) && isAdminRole(x.role);
  }

  function can(action, s) {
    const x = s || session;
    if (!x) return false;
    if (ADMIN_ACTIONS.has(action)) return isAdmin(x);
    if (action === "view_portal") return isApproved(x);
    if (action === "view_pending") return isPending(x);
    return isApproved(x);
  }

  async function signIn(email, password) {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) {
      throw new Error(
        global.FIREBASE_CONFIG?.adminMessage?.() ||
          "Firebase is not configured. Please contact the portal administrator."
      );
    }
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await syncSessionFromFirebase();
    return session;
  }

  async function signUp(email, password) {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) {
      throw new Error(
        global.FIREBASE_CONFIG?.adminMessage?.() ||
          "Firebase is not configured. Please contact the portal administrator."
      );
    }
    const { error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: email.split("@")[0] },
      },
    });
    if (error) throw error;
    await syncSessionFromFirebase();
    return { session };
  }

  async function logout() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (sb) await sb.auth.signOut();
    session = null;
    profile = null;
    try {
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

  /** Page routing disabled — login/dashboard use js/auth-guard.js only. */
  async function guardPage() {}

  function applyNavVisibility() {
    document.querySelectorAll('[data-require-admin="true"]').forEach((el) => {
      el.hidden = !isAdmin();
    });
  }

  async function init() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb && global.SMTN170Firebase?.whenReady) {
      await global.SMTN170Firebase.whenReady();
    }
    await syncSessionFromFirebase();
    initialized = true;
    applyNavVisibility();
    global.dispatchEvent(new CustomEvent("smtn170:auth-ready", { detail: { session } }));
  }

  /** Local-only fallback when Firebase is not configured (development). */
  function login(email, accountStatus, role) {
    profile = {
      id: "local-user",
      email: email || "member@example.com",
      first_name: "",
      last_name: "",
      preferred_name: "",
      rank: "",
      role: role || ROLES.SENIOR_MEMBER.id,
      status: accountStatus || ACCOUNT_STATUS.APPROVED,
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
    syncSessionFromFirebase,
    syncSessionFromSupabase: syncSessionFromFirebase,
    updateOwnProfile,
    getRoleLabel,
    getWelcomeGreeting,
    isProfileIncomplete,
    isAuthenticated,
    isApproved,
    isPending,
    isDenied,
    getPostLoginPath,
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
