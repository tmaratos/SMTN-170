/**
 * My Profile — editable form (own profile only).
 *
 * Load flow:
 *   1. Wait for Firebase Auth to resolve.
 *   2. No user → redirect to login.html.
 *   3. Load profiles/{auth.currentUser.uid} via getDoc directly.
 *      Does NOT wait forever on global events / SMTN170Auth init.
 *   4. 6-second timeout → swap the loader for a visible error + Retry button.
 *   5. Profile exists → render form with values populated; no "Complete your
 *      profile" banner is rendered by this page.
 *   6. Profile missing → render completion form (same form, empty values).
 *
 * Save flow:
 *   Writes ONLY firstName, lastName, preferredName, rank, capId, phone,
 *   dutyPosition and updatedAt. role/status/approved/isAdmin/accountStatus/
 *   portalRole are filtered out before write (Firestore rules also enforce).
 */
(function initProfilePage(global) {
  const LOAD_TIMEOUT_MS = 6000;

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function formatUpdated(iso) {
    if (!iso) return "—";
    try {
      const d = iso?.toDate ? iso.toDate() : new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return String(iso);
    }
  }

  function trim(v) {
    return v == null ? "" : String(v).trim();
  }

  function readProfile(data, user) {
    if (!data) {
      return user ? { email: user.email || "" } : null;
    }
    const svc = global.SMTN170Profile;
    return {
      firstName: svc?.getFirstName?.(data) || trim(data.firstName ?? data.first_name),
      lastName: svc?.getLastName?.(data) || trim(data.lastName ?? data.last_name),
      preferredName: svc?.getPreferredName?.(data) || trim(data.preferredName ?? data.preferred_name),
      rank: svc?.getRank?.(data) || trim(data.rank),
      capId: svc?.getCapId?.(data) || trim(data.capId ?? data.cap_id),
      phone: svc?.getPhone?.(data) || trim(data.phone),
      dutyPosition: svc?.getDutyPosition?.(data) || trim(data.dutyPosition ?? data.duty_position),
      profilePhotoUrl: svc?.getProfilePhotoUrl?.(data) || trim(data.profilePhotoUrl ?? data.profile_photo_url),
      role: data.role || "",
      status: data.status || data.accountStatus || data.account_status || "",
      email: trim(data.email) || (user?.email || ""),
      updatedAt: data.updatedAt || data.updated_at || null,
    };
  }

  function getStatusLabel(status) {
    const s = String(status || "").toLowerCase().trim();
    if (!s) return "—";
    if (s === "active" || s === "approved") return "Active";
    if (s === "pending" || s === "awaiting_approval" || s === "awaiting_verification") return "Awaiting approval";
    if (s === "denied") return "Denied";
    return s.replace(/_/g, " ");
  }

  function getRoleLabel(role) {
    return global.SMTN170Auth?.getRoleLabel?.(role) || role || "—";
  }

  function setRoot(html) {
    const root = document.getElementById("profilePage");
    if (root) root.innerHTML = html;
  }

  function showLoader() {
    setRoot('<p class="page-intro" id="profileLoader">Loading your profile…</p>');
  }

  function showError(message) {
    setRoot(`
      <div class="profile-alert profile-alert--error card-warning" id="profileErrorBox" role="alert">
        <p>${escapeHtml(message)}</p>
        <button type="button" class="btn-gold btn-lg" id="profileRetryBtn">Retry</button>
      </div>`);
    document.getElementById("profileRetryBtn")?.addEventListener("click", () => {
      rendered = false;
      init();
    });
  }

  function renderForm(profile, user, banner) {
    console.log("[profile] render profile form");
    const data = profile || {};
    const root = document.getElementById("profilePage");
    if (!root) return;

    const message = banner?.message;
    const messageType = banner?.type;
    const alertClass =
      messageType === "error"
        ? "profile-alert profile-alert--error card-warning"
        : messageType === "success"
          ? "profile-alert profile-alert--success card-info"
          : "profile-alert card-warning";

    root.innerHTML = `
      ${message ? `<div class="${alertClass}" role="alert">${escapeHtml(message)}</div>` : ""}
      <form id="profileForm" class="profile-form card-info" novalidate>
        <h2 class="profile-form-title">Your information</h2>
        <p class="page-intro">Update how your name appears in the portal. Your login email does not change here.</p>

        <div class="profile-grid">
          <div>
            <label for="profileFirst">First name</label>
            <input type="text" id="profileFirst" name="firstName" required value="${escapeHtml(data.firstName || "")}" autocomplete="given-name" />
          </div>
          <div>
            <label for="profileLast">Last name</label>
            <input type="text" id="profileLast" name="lastName" required value="${escapeHtml(data.lastName || "")}" autocomplete="family-name" />
          </div>
        </div>

        <label for="profilePreferred">Preferred name <span class="profile-optional">(optional)</span></label>
        <input type="text" id="profilePreferred" name="preferredName" value="${escapeHtml(data.preferredName || "")}" placeholder="What should we call you?" />

        <div class="profile-grid">
          <div>
            <label for="profileRank">Rank</label>
            <input type="text" id="profileRank" name="rank" value="${escapeHtml(data.rank || "")}" placeholder="e.g. Capt, 1st Lt, Maj" />
          </div>
          <div>
            <label for="profileCapId">CAP ID</label>
            <input type="text" id="profileCapId" name="capId" value="${escapeHtml(data.capId || "")}" placeholder="Your CAP member number" />
          </div>
        </div>

        <label for="profilePhone">Phone</label>
        <input type="tel" id="profilePhone" name="phone" value="${escapeHtml(data.phone || "")}" autocomplete="tel" />

        <label for="profileDuty">Duty position</label>
        <input type="text" id="profileDuty" name="dutyPosition" value="${escapeHtml(data.dutyPosition || "")}" placeholder="e.g. Operations Officer" />

        <fieldset class="profile-readonly">
          <legend>Account (read-only)</legend>
          <p><strong>Email</strong><br>${escapeHtml(data.email || user?.email || "—")}</p>
          <p><strong>Portal role</strong><br>${escapeHtml(getRoleLabel(data.role))}</p>
          <p><strong>Access status</strong><br>${escapeHtml(getStatusLabel(data.status))}</p>
          <p><strong>Last updated</strong><br>${escapeHtml(formatUpdated(data.updatedAt))}</p>
        </fieldset>

        <div class="profile-actions">
          <button type="submit" class="btn-gold btn-lg" id="profileSaveBtn">Save profile</button>
        </div>
      </form>

      <section class="profile-security card-info" aria-labelledby="securityTitle">
        <h2 id="securityTitle" class="card-info-title">Security</h2>
        <p class="page-intro">Need to change your password? Click below and we will email you a secure link. Open the link on any device to choose a new password.</p>
        <p id="securityNotice" class="reset-notice" hidden role="status"></p>
        <p id="securityError" class="reset-error" hidden role="alert"></p>
        <div class="profile-actions">
          <button type="button" class="btn-gold btn-lg" id="securityResetBtn">Send password reset email</button>
        </div>
      </section>

      <button type="button" class="steward-launch-strip" data-steward-open style="margin-top:20px">
        <span class="steward-launch-icon" aria-hidden="true">💬</span>
        <span><strong>Open Steward</strong> Questions about the portal or your squadron duties.</span>
      </button>`;

    document.getElementById("profileForm")?.addEventListener("submit", (e) => onSubmit(e, user));
    document.getElementById("securityResetBtn")?.addEventListener("click", () => onSendResetEmail(user));
    global.SMTN170StewardLauncher?.rebind?.();
    global.SMTN170ProfileBanner?.refresh?.();
  }

  async function onSendResetEmail(user) {
    const btn = document.getElementById("securityResetBtn");
    const notice = document.getElementById("securityNotice");
    const errEl = document.getElementById("securityError");
    if (!notice || !errEl) return;

    const email = (user?.email || "").trim();
    notice.hidden = true;
    notice.textContent = "";
    notice.classList.remove("reset-notice--success");
    errEl.hidden = true;
    errEl.textContent = "";

    if (!email) {
      errEl.textContent = "We could not find an email on your account. Please sign out and sign back in.";
      errEl.hidden = false;
      return;
    }

    const helper = global.SMTN170PasswordReset;
    if (!helper?.requestPasswordReset) {
      errEl.textContent = "Password reset is not available right now. Please refresh the page and try again.";
      errEl.hidden = false;
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending…";
    }

    try {
      await helper.requestPasswordReset(email);
      notice.textContent = helper.buildProfileSuccessMessage(email);
      notice.classList.add("reset-notice--success");
      notice.hidden = false;
    } catch (err) {
      console.log("PROFILE_PASSWORD_RESET_ERROR", err?.code || "", err?.message || err);
      errEl.textContent = err?.message || "Could not send the reset email. Please try again.";
      errEl.hidden = false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Send password reset email";
      }
    }
  }

  async function onSubmit(e, user) {
    e.preventDefault();
    const btn = document.getElementById("profileSaveBtn");
    if (!user?.uid) {
      renderForm(null, user, { message: "Sign-in expired. Refresh and sign in again.", type: "error" });
      return;
    }
    const form = e.target;
    const fd = new FormData(form);
    const raw = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      preferredName: fd.get("preferredName"),
      rank: fd.get("rank"),
      capId: fd.get("capId"),
      phone: fd.get("phone"),
      dutyPosition: fd.get("dutyPosition"),
    };
    const patch =
      global.SMTN170Profile?.pickEditablePayload?.(raw) ||
      Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? null : String(v).trim() || null]));
    patch.updatedAt = new Date().toISOString();

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }

    try {
      const fb = global.SMTN170Firebase;
      const mod = fb?.getFirestoreModule?.();
      const db = fb?.getFirestore?.();
      if (!mod || !db) throw new Error("Firestore is not ready. Refresh and try again.");

      await mod.updateDoc(mod.doc(db, "profiles", user.uid), patch);

      const snap = await mod.getDoc(mod.doc(db, "profiles", user.uid));
      const profile = snap.exists() ? readProfile(snap.data(), user) : readProfile(null, user);
      global.TN170_CURRENT_USER = { uid: user.uid, email: user.email || "" };
      global.TN170_CURRENT_PROFILE = snap.exists() ? { uid: user.uid, email: user.email || "", ...snap.data() } : null;

      try {
        await global.SMTN170Auth?.syncSessionFromFirebase?.();
      } catch (err) {
        console.warn("[profile] session resync after save", err?.message || err);
      }

      rendered = true;
      renderForm(profile, user, { message: "Your profile was saved.", type: "success" });
      global.SMTN170ProfileBanner?.refresh?.();
      global.SMTN170PortalNav?.init?.();
      global.dispatchEvent(new CustomEvent("smtn170:profile-updated", { detail: { profile } }));
    } catch (err) {
      const msg = err?.message || err?.details || String(err) || "Could not save profile.";
      console.warn("[profile] save error", msg);
      const fallback =
        readProfile(global.TN170_CURRENT_PROFILE, user) || readProfile(null, user);
      renderForm(fallback, user, { message: msg, type: "error" });
    }
  }

  /**
   * Resolve the signed-in user without depending on SMTN170Auth or portal
   * bootstrap globals. Resolves immediately when Firebase Auth already has a
   * currentUser; otherwise subscribes to one onAuthStateChange event.
   */
  async function resolveAuthUser() {
    const fb = global.SMTN170Firebase;
    if (!fb) throw new Error("Firebase is not configured.");
    await fb.whenReady?.({ authOnly: false });
    await fb.ensureFullClient?.();
    const authInstance = fb.getAuth?.();
    if (!authInstance) throw new Error("Firebase auth is not available.");
    if (authInstance.currentUser) return authInstance.currentUser;

    return new Promise((resolve) => {
      let settled = false;
      const handle = fb.onAuthStateChange?.((_event, session) => {
        if (settled) return;
        settled = true;
        handle?.data?.subscription?.unsubscribe?.();
        if (!session?.user?.id) {
          resolve(null);
          return;
        }
        resolve(authInstance.currentUser || { uid: session.user.id, email: session.user.email || "" });
      });
      if (!handle) {
        resolve(authInstance.currentUser || null);
      }
    });
  }

  let rendered = false;
  let initInFlight = false;

  async function init() {
    const root = document.getElementById("profilePage");
    if (!root || rendered || initInFlight) return;
    initInFlight = true;

    console.log("[profile] boot start");
    showLoader();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      initInFlight = false;
      showError("Profile load timed out. Refresh the page or sign out and sign back in.");
    }, LOAD_TIMEOUT_MS);

    try {
      const fb = global.SMTN170Firebase;
      if (!fb) throw new Error("Firebase is not available.");

      const user = await resolveAuthUser();
      if (timedOut) return;

      console.log("[profile] auth user", user?.uid || null, user?.email || null);
      if (!user?.uid) {
        clearTimeout(timer);
        console.log("[profile] no auth user, redirecting to login.html");
        global.location.href = "login.html";
        return;
      }

      const path = `profiles/${user.uid}`;
      console.log("[profile] profile path", path);

      const mod = fb.getFirestoreModule?.();
      const db = fb.getFirestore?.();
      if (!mod || !db) throw new Error("Firestore is not ready.");

      const snap = await mod.getDoc(mod.doc(db, "profiles", user.uid));
      if (timedOut) return;
      const exists = snap.exists();
      console.log("[profile] profile exists", exists);

      clearTimeout(timer);

      const data = exists ? snap.data() : null;
      const profile = readProfile(data, user);

      if (exists) {
        global.TN170_CURRENT_USER = { uid: user.uid, email: user.email || "" };
        global.TN170_CURRENT_PROFILE = { uid: user.uid, email: user.email || "", ...data };
        console.log("[profile] loaded fields", {
          firstName: profile.firstName,
          lastName: profile.lastName,
          preferredName: profile.preferredName,
          rank: profile.rank,
          capId: profile.capId,
          dutyPosition: profile.dutyPosition,
          role: profile.role,
          status: profile.status,
        });
      } else {
        global.TN170_CURRENT_USER = { uid: user.uid, email: user.email || "" };
        global.TN170_CURRENT_PROFILE = null;
        console.log("[profile] no profile doc — rendering empty completion form");
      }

      rendered = true;
      renderForm(profile, user);
      global.SMTN170ProfileBanner?.refresh?.();
    } catch (err) {
      if (timedOut) return;
      clearTimeout(timer);
      console.warn("[profile] load error", err?.message || err);
      showError(err?.message || "Could not load your profile.");
    } finally {
      initInFlight = false;
    }
  }

  global.SMTN170ProfilePage = { init };

  function start() {
    if (document.getElementById("profilePage")) init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
