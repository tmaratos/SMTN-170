/**
 * My Profile — editable form (own profile only).
 */
(function initProfilePage(global) {
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

  function getProfileRow() {
    return global.SMTN170Auth?.getProfile?.() || null;
  }

  function renderForm(row, message) {
    const root = document.getElementById("profilePage");
    if (!root) return;

    const auth = global.SMTN170Auth;
    const roleLabel = auth?.getRoleLabel?.(row?.role) || row?.role || "—";
    const statusLabel =
      row?.account_status === auth?.ACCOUNT_STATUS?.APPROVED ? "Approved" : "Awaiting approval";

    root.innerHTML = `
      ${message ? `<div class="profile-alert card-warning" role="status">${escapeHtml(message)}</div>` : ""}
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
    global.SMTN170Steward?.rebind?.();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("profileSaveBtn");
    const form = e.target;
    const fd = new FormData(form);
    const payload = {};
    global.SMTN170Profile.EDITABLE_FIELDS.forEach((key) => {
      payload[key] = fd.get(key);
    });

    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      await global.SMTN170Auth.updateOwnProfile(payload);
      const row = getProfileRow();
      renderForm(row, "Your profile was saved.");
      global.SMTN170ProfileBanner?.refresh?.();
    } catch (err) {
      alert(err.message || "Could not save profile. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save profile";
    }
  }

  async function init() {
    await global.SMTN170Supabase?.whenReady?.();
    await global.SMTN170Auth?.syncSessionFromSupabase?.();
    const row = getProfileRow();
    if (!row) {
      document.getElementById("profilePage").innerHTML =
        '<p class="page-intro">Sign in to view your profile.</p>';
      return;
    }
    renderForm(row);
  }

  if (document.getElementById("profilePage")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  global.SMTN170ProfilePage = { init, renderForm };
})(window);
