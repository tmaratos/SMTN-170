/**
 * My Profile — editable form (own profile only).
 */
(function initProfilePage(global) {
  const LOAD_TIMEOUT_MS = 12000;

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function formatUpdated(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || "Request timed out.")), ms);
      }),
    ]);
  }

  function rowFromSession(session) {
    if (!session) return null;
    return {
      id: session.userId,
      email: session.email,
      first_name: session.firstName || "",
      last_name: session.lastName || "",
      preferred_name: session.preferredName || "",
      rank: session.rank || "",
      cap_id: session.capId || "",
      phone: session.phone || "",
      duty_position: session.dutyPosition || "",
      profile_photo_url: session.profilePhotoUrl || "",
      role: session.role,
      status: session.status || session.accountStatus,
      updated_at: session.updatedAt || null,
    };
  }

  function rowFromProfile(profile) {
    if (!profile) return null;
    return {
      id: profile.id || profile.uid,
      email: profile.email,
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      preferred_name: profile.preferred_name || "",
      rank: profile.rank || "",
      cap_id: profile.cap_id || "",
      phone: profile.phone || "",
      duty_position: profile.duty_position || "",
      profile_photo_url: profile.profile_photo_url || "",
      role: profile.role,
      status: profile.status || profile.account_status || profile.accountStatus,
      updated_at: profile.updated_at || null,
    };
  }

  async function fetchProfileRow() {
    const auth = global.SMTN170Auth;
    const fb = global.SMTN170Firebase;
    await fb?.whenReady?.({ authOnly: false });
    const uid = fb?.getAuth?.()?.currentUser?.uid || global.TN170_CURRENT_USER?.uid || null;
    const path = uid ? `profiles/${uid}` : "(none)";
    console.log("[profile] uid", uid || "(none)");
    console.log("[profile] profile path", path);

    if (!auth?.getCurrentUserProfile) {
      console.log("[profile] snap exists", false);
      return rowFromProfile(auth?.getProfile?.()) || rowFromSession(auth?.loadSession?.());
    }

    const profileOut = await withTimeout(
      auth.getCurrentUserProfile(),
      LOAD_TIMEOUT_MS,
      "Profile load timed out. Check your connection and try again."
    );
    const exists = !!profileOut;
    console.log("[profile] snap exists", exists);

    if (profileOut) return rowFromProfile(profileOut);
    return rowFromProfile(auth.getProfile?.()) || rowFromSession(auth.loadSession?.());
  }

  function showLoadError(message) {
    const root = document.getElementById("profilePage");
    if (!root) return;
    root.innerHTML = `
      <div class="profile-alert profile-alert--error card-warning" role="alert">
        <p>${escapeHtml(message || "Could not load your profile.")}</p>
        <button type="button" class="btn-gold btn-lg" id="profileRetryBtn">Try again</button>
      </div>`;
    document.getElementById("profileRetryBtn")?.addEventListener("click", () => {
      profileRendered = false;
      init();
    });
  }

  function getAccessStatusLabel(row) {
    const svc = global.SMTN170Profile;
    if (svc?.isProfileStatusApproved?.(row)) return "Active";
    if (svc?.isProfileStatusAwaiting?.(row)) return "Awaiting approval";
    const s = svc?.getProfileStatus?.(row) || row?.status || "";
    return s ? s.replace(/_/g, " ") : "—";
  }

  function renderForm(row, message, messageType) {
    const root = document.getElementById("profilePage");
    if (!root) return;
    console.log("[profile] render called");

    const auth = global.SMTN170Auth;
    const roleLabel = auth?.getRoleLabel?.(row?.role) || row?.role || "—";
    const statusLabel = getAccessStatusLabel(row);
    const alertClass =
      messageType === "error"
        ? "profile-alert profile-alert--error card-warning"
        : messageType === "success"
          ? "profile-alert profile-alert--success card-info"
          : "profile-alert card-warning";

    root.innerHTML = `
      ${message ? `<div class="${alertClass}" role="alert">${escapeHtml(message)}</div>` : ""}
      <form id="profileForm" class="profile-form card-info">
        <h2 class="profile-form-title">Your information</h2>
        <p class="page-intro">Update how your name appears in the portal. Your login email does not change here.</p>

        <div class="profile-photo-row">
          <div class="profile-photo-preview" id="profilePhotoPreview">
            ${row?.profile_photo_url ? `<img src="${escapeHtml(row.profile_photo_url)}" alt="" />` : '<span aria-hidden="true">Photo</span>'}
          </div>
          <div>
            <label for="profilePhotoUrl">Profile photo link</label>
            <input type="url" id="profilePhotoUrl" name="profile_photo_url" value="${escapeHtml(row?.profile_photo_url || "")}" placeholder="https://… (optional)" />
            <p class="profile-hint">Optional link to a profile photo hosted elsewhere.</p>
          </div>
        </div>

        <div class="profile-grid">
          <div>
            <label for="profileFirst">First name</label>
            <input type="text" id="profileFirst" name="first_name" required value="${escapeHtml(row?.first_name || "")}" autocomplete="given-name" />
          </div>
          <div>
            <label for="profileLast">Last name</label>
            <input type="text" id="profileLast" name="last_name" required value="${escapeHtml(row?.last_name || "")}" autocomplete="family-name" />
          </div>
        </div>

        <label for="profilePreferred">Preferred name <span class="profile-optional">(optional)</span></label>
        <input type="text" id="profilePreferred" name="preferred_name" value="${escapeHtml(row?.preferred_name || "")}" placeholder="What should we call you?" />

        <div class="profile-grid">
          <div>
            <label for="profileRank">Rank</label>
            <input type="text" id="profileRank" name="rank" value="${escapeHtml(row?.rank || "")}" placeholder="e.g. Capt, 1st Lt, Maj" />
          </div>
          <div>
            <label for="profileCapId">CAP ID</label>
            <input type="text" id="profileCapId" name="cap_id" value="${escapeHtml(row?.cap_id || "")}" placeholder="Your CAP member number" />
          </div>
        </div>

        <label for="profilePhone">Phone</label>
        <input type="tel" id="profilePhone" name="phone" value="${escapeHtml(row?.phone || "")}" autocomplete="tel" />

        <label for="profileDuty">Duty position</label>
        <input type="text" id="profileDuty" name="duty_position" value="${escapeHtml(row?.duty_position || "")}" placeholder="e.g. Operations Officer" />

        <fieldset class="profile-readonly">
          <legend>Account (read-only)</legend>
          <p><strong>Email</strong><br>${escapeHtml(row?.email || "—")}</p>
          <p><strong>Portal role</strong><br>${escapeHtml(roleLabel)}</p>
          <p><strong>Access status</strong><br>${escapeHtml(statusLabel)}</p>
          <p><strong>Last updated</strong><br>${escapeHtml(formatUpdated(row?.updated_at))}</p>
        </fieldset>

        <div class="profile-actions">
          <button type="submit" class="btn-gold btn-lg" id="profileSaveBtn">Save profile</button>
        </div>
      </form>

      <button type="button" class="steward-launch-strip" data-steward-open style="margin-top:20px">
        <span class="steward-launch-icon" aria-hidden="true">💬</span>
        <span><strong>Open Steward</strong> Questions about the portal or your squadron duties.</span>
      </button>`;

    document.getElementById("profileForm")?.addEventListener("submit", onSubmit);
    global.SMTN170StewardLauncher?.rebind?.();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("profileSaveBtn");
    const form = e.target;
    const fd = new FormData(form);
    const payload = global.SMTN170Profile?.pickEditablePayload
      ? global.SMTN170Profile.pickEditablePayload(Object.fromEntries(fd.entries()))
      : Object.fromEntries(
          global.SMTN170Profile.EDITABLE_FIELDS.map((key) => [key, fd.get(key)])
        );

    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      await global.SMTN170Auth.updateOwnProfile(payload);
      await global.SMTN170Auth?.syncSessionFromFirebase?.();
      const row = await fetchProfileRow();
      renderForm(row, "Your profile was saved.", "success");
      global.SMTN170ProfileBanner?.refresh?.();
      global.SMTN170PortalNav?.init?.();
    } catch (err) {
      const msg = err?.message || err?.details || String(err) || "Could not save profile.";
      const row = await fetchProfileRow().catch(() => null);
      renderForm(row || rowFromSession(global.SMTN170Auth?.loadSession?.()), msg, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save profile";
    }
  }

  let profileRendered = false;
  let initInFlight = false;

  async function init() {
    const root = document.getElementById("profilePage");
    if (!root || profileRendered || initInFlight) return;
    initInFlight = true;

    if (!document.getElementById("profileForm")) {
      root.innerHTML = '<p class="page-intro">Loading your profile…</p>';
    }

    try {
      if (!global.SMTN170Auth) {
        showLoadError("Portal auth is not available. Refresh the page.");
        return;
      }

      if (!global.SMTN170Auth.loadSession?.()) {
        await withTimeout(
          global.SMTN170Auth.init?.({ skipEvent: true }),
          LOAD_TIMEOUT_MS,
          "Sign-in check timed out. Refresh and try again."
        );
      }

      const row = await fetchProfileRow();
      if (!row?.id && !row?.email) {
        console.log("[profile] SESSION_MISSING_REDIRECT");
        global.location.href = "login.html";
        return;
      }

      profileRendered = true;
      renderForm(row);
    } catch (err) {
      console.warn("[profile] load error", err?.message || err);
      showLoadError(err?.message || "Could not load your profile.");
    } finally {
      initInFlight = false;
    }
  }

  global.addEventListener("smtn170:auth-ready", () => {
    if (document.getElementById("profilePage") && !document.getElementById("profileForm")) {
      init();
    }
  });

  global.SMTN170ProfilePage = { init, renderForm };

  if (document.getElementById("profilePage")) {
    if (global.TN170_AUTH_SESSION_OK) {
      queueMicrotask(() => init());
    }
  }
})(window);
