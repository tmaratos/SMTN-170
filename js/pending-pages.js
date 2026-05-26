/**
 * TN-170 — public auth-status pages (pending-approval, access-denied).
 * Loads Firebase, shows signed-in user info, and handles logout without redirect loops.
 */
(function initPendingPages(global) {
  const LOGIN = "login.html";
  const DASHBOARD = "dashboard.html";
  const PENDING = "pending-approval.html";
  const DENIED = "access-denied.html";

  function currentPage() {
    return (global.location.pathname || "").split("/").pop() || "";
  }

  function normalizeStatus(profile) {
    const raw = profile?.status ?? profile?.account_status ?? profile?.accountStatus ?? "";
    return String(raw).toLowerCase().trim();
  }

  async function fetchProfileByUid(uid) {
    await global.SMTN170Firebase?.ensureFullClient?.();
    const mod = global.SMTN170Firebase?.getFirestoreModule?.();
    const db = global.SMTN170Firebase?.getFirestore?.();
    if (!mod || !db || !uid) return null;

    const path = `profiles/${uid}`;
    console.log("PROFILE_PATH_CHECKED", path);
    const snap = await mod.getDoc(mod.doc(db, "profiles", uid));
    console.log("PROFILE_EXISTS", snap.exists());
    if (!snap.exists()) return null;

    const mapped = global.SMTN170FirebaseData?.fromFirestore?.(snap.data(), snap.id);
    return mapped || { id: snap.id, ...snap.data() };
  }

  async function logout(event) {
    if (event) event.preventDefault();
    console.log("LOGOUT_CLICKED");
    await global.SMTN170Firebase?.whenReady?.({ authOnly: true });
    const client = global.SMTN170Firebase?.getClient?.();
    if (client?.auth) await client.auth.signOut();
    console.log("SIGNOUT_COMPLETE");
    global.location.href = LOGIN;
  }

  function bindLogoutButton() {
    const btn = document.getElementById("pendingLogoutBtn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", logout);
  }

  function renderIdentity(page, profile, email) {
    const name = global.SMTN170Profile?.computeDisplayName?.(profile || { email }) || email || "Signed in";

    if (page === DENIED) {
      const el = document.getElementById("deniedIdentity");
      if (el) el.textContent = email ? `${name} · ${email}` : name;
      return;
    }

    const nameEl = document.getElementById("pendingIdentity");
    const emailEl = document.getElementById("pendingEmail");
    if (nameEl) nameEl.textContent = name;
    if (emailEl && email) emailEl.textContent = `Email: ${email}`;
  }

  async function init() {
    bindLogoutButton();
    await global.SMTN170Firebase?.whenReady?.({ authOnly: true });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        fn();
        resolve();
      };

      const { data } = global.SMTN170Firebase.onAuthStateChange(async (_event, session) => {
        data?.subscription?.unsubscribe?.();

        if (!session?.user?.id) {
          console.log("AUTH_UID", "(none)");
          console.log("AUTH_EMAIL", "(none)");
          console.log("ROUTE_DECISION", LOGIN);
          finish(() => {
            global.location.href = LOGIN;
          });
          return;
        }

        const uid = session.user.id;
        const email = session.user.email || "";
        const page = currentPage();
        const isDeniedPage = page === DENIED;

        console.log("AUTH_UID", uid);
        console.log("AUTH_EMAIL", email);

        const profile = await fetchProfileByUid(uid);
        const status = normalizeStatus(profile);
        const role = String(profile?.role || "").toLowerCase().trim();

        console.log("PROFILE_STATUS", status || "(none)");
        console.log("PROFILE_ROLE", role || "(none)");

        if (status === "active" || status === "approved") {
          console.log("ROUTE_DECISION", DASHBOARD);
          finish(() => {
            global.location.href = DASHBOARD;
          });
          return;
        }

        if (!isDeniedPage && status === "denied") {
          console.log("ROUTE_DECISION", DENIED);
          finish(() => {
            global.location.href = DENIED;
          });
          return;
        }

        if (isDeniedPage && (status === "pending" || status === "awaiting_approval" || status === "awaiting_verification")) {
          console.log("ROUTE_DECISION", PENDING);
          finish(() => {
            global.location.href = PENDING;
          });
          return;
        }

        console.log("ROUTE_DECISION", "stay");
        renderIdentity(page, profile, email);
        bindLogoutButton();
        finish(() => {});
      });
    });
  }

  global.TN170PendingPages = { init, logout };
})(window);
