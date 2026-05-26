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
    ADMIN: { id: "admin", label: "Admin" },
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

  const ADMIN_ROLES = [ROLES.COMMANDER.id, ROLES.ADMIN.id];
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

  function clearStaleProfileCache() {
    try {
      const localKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const lower = key.toLowerCase();
        if (
          lower.includes("supabase") ||
          lower.includes("account_status") ||
          lower.includes("accountstatus") ||
          lower.includes("awaiting_verification") ||
          lower.includes("awaitingapproval") ||
          lower.includes("isadmin") ||
          key === "capId" ||
          key === "profile.id" ||
          key === "smtn170_logged_in" ||
          key.startsWith("smtn170_profile_cache")
        ) {
          localKeys.push(key);
        }
      }
      localKeys.forEach((k) => localStorage.removeItem(k));

      const sessionKeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        const lower = key.toLowerCase();
        if (
          lower.includes("supabase") ||
          lower.includes("account_status") ||
          lower.includes("accountstatus") ||
          lower.includes("awaiting_verification") ||
          lower.includes("awaitingapproval") ||
          lower.includes("isadmin") ||
          key === "capId" ||
          key === "profile.id"
        ) {
          sessionKeys.push(key);
        }
      }
      sessionKeys.forEach((k) => sessionStorage.removeItem(k));
      sessionStorage.removeItem("smtn170_profile_banner_dismissed");
    } catch {
      /* ignore */
    }
    global.TN170_CURRENT_USER = null;
    global.TN170_CURRENT_PROFILE = null;
  }

  function computeAllowAdmin(p) {
    if (!p) return false;
    const status = Profile()?.getProfileStatus?.(p) || String(p.status || p.account_status || "").toLowerCase().trim();
    const approved = status === "active" || status === "approved";
    const role = String(p.role || "").toLowerCase().trim();
    const admin = role === "admin" || role === "commander";
    return approved && admin;
  }

  async function fetchProfile(userId) {
    const fb = global.SMTN170Firebase;
    if (!fb || !userId) return null;

    await fb.ensureFullClient?.();
    const mod = fb.getFirestoreModule?.();
    const db = fb.getFirestore?.();
    const dataLayer = global.SMTN170FirebaseData;

    if (mod && db) {
      console.log("PROFILE_PATH_CHECKED", `profiles/${userId}`);
      const snap = await mod.getDoc(mod.doc(db, "profiles", userId));
      console.log("PROFILE_EXISTS", snap.exists());
      if (!snap.exists()) return null;
      return dataLayer?.fromFirestore?.(snap.data(), snap.id) || { id: snap.id, ...snap.data() };
    }

    const sb = global.TN170FirebaseClient || fb.getClient?.();
    if (!sb?.from) return null;
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.warn("[TN-170] profile fetch", error.message);
      return null;
    }
    return data;
  }

  async function getCurrentUserProfile() {
    const fb = global.SMTN170Firebase;
    if (!fb) {
      global.TN170_CURRENT_USER = null;
      global.TN170_CURRENT_PROFILE = null;
      return null;
    }

    await fb.whenReady?.({ authOnly: false });
    await fb.ensureFullClient?.();
    const authInstance = fb.getAuth?.();
    const user = authInstance?.currentUser;
    if (!user?.uid) {
      global.TN170_CURRENT_USER = null;
      global.TN170_CURRENT_PROFILE = null;
      session = null;
      profile = null;
      return null;
    }

    const currentUser = { uid: user.uid, email: user.email || "" };
    global.TN170_CURRENT_USER = currentUser;

    const row = await fetchProfile(user.uid);
    if (!row) {
      global.TN170_CURRENT_PROFILE = null;
      profile = null;
      session = {
        userId: user.uid,
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
      return null;
    }

    profile = row;
    session = mapProfile(row) || session;
    const profileOut = {
      uid: user.uid,
      email: user.email || row.email || "",
      ...row,
      id: user.uid,
    };
    global.TN170_CURRENT_PROFILE = profileOut;
    return profileOut;
  }

  async function syncSessionFromFirebase() {
    const fb = global.SMTN170Firebase;
    if (!fb) {
      session = null;
      profile = null;
      global.TN170_CURRENT_USER = null;
      global.TN170_CURRENT_PROFILE = null;
      return null;
    }

    await fb.whenReady?.({ authOnly: false });
    const authInstance = fb.getAuth?.();
    const user = authInstance?.currentUser;
    if (!user?.uid) {
      console.log("No session found");
      session = null;
      profile = null;
      global.TN170_CURRENT_USER = null;
      global.TN170_CURRENT_PROFILE = null;
      return null;
    }

    console.log("SESSION_FOUND");
    console.log("AUTH_UID", user.uid);
    console.log("AUTH_EMAIL", user.email || "");
    const profileOut = await getCurrentUserProfile();
    if (profileOut) {
      console.log("PROFILE_LOAD_OK");
      console.log("PROFILE_STATUS", Profile()?.getProfileStatus?.(profile) || "(none)");
      console.log("PROFILE_ROLE", String(profile?.role || "").toLowerCase().trim() || "(none)");
    } else {
      console.log("PROFILE_LOAD_ERROR", "no profiles row for uid");
    }
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
    const x = s || profile || session || global.TN170_CURRENT_PROFILE;
    return computeAllowAdmin(x);
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
    await global.SMTN170Firebase?.whenReady?.({ authOnly: true });
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) {
      throw new Error(
        global.FIREBASE_CONFIG?.adminMessage?.() ||
          "Firebase is not configured. Please contact the portal administrator."
      );
    }
    clearStaleProfileCache();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const formatted = global.SMTN170FirebaseAuth?.formatAuthError?.(error);
      if (formatted && formatted !== error.message) {
        const err = new Error(formatted);
        err.code = error.code;
        throw err;
      }
      throw error;
    }
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
    clearStaleProfileCache();
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
    global.StewardSiteIndex?.clearCache?.();
    clearStaleProfileCache();
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (sb) await sb.auth.signOut();
    session = null;
    profile = null;
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
    getCurrentUserProfile,
    computeAllowAdmin,
    clearStaleProfileCache,
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
