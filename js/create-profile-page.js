/**
 * TN-170 create-profile page — invite-based signup (no public registration).
 */
(function initCreateProfilePage(global) {
  const INVALID_MSG = "This invite link is invalid or no longer available.";

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getInviteToken() {
    return new URLSearchParams(global.location.search).get("invite")?.trim() || "";
  }

  function client() {
    return global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
  }

  function isExpired(invite) {
    const exp = invite?.expires_at || invite?.expiresAt;
    if (!exp) return false;
    return new Date(exp).getTime() < Date.now();
  }

  async function loadInvite(token) {
    const sb = client();
    if (!sb || !token) return null;
    const { data, error } = await sb.from("invite_links").select("*").eq("id", token).maybeSingle();
    if (error || !data) return null;
    if (data.status !== "unused") return null;
    if (isExpired(data)) return null;
    return data;
  }

  function showInvalid(root, msg) {
    root.innerHTML = `
      <section class="panel" style="text-align:center">
        <h2>Invite link unavailable</h2>
        <p>${escapeHtml(msg || INVALID_MSG)}</p>
        <p class="page-intro">Contact squadron leadership for a new invite link.</p>
        <a class="btn-gold" href="login.html">Sign in</a>
      </section>`;
  }

  function renderForm(root, invite) {
    root.innerHTML = `
      <section class="panel">
        <h2>Create your profile</h2>
        <p class="page-intro">Complete the form below using the details from your invite. Your profile will be reviewed before portal access is granted.</p>
        <form id="createProfileForm" class="login-form-v2" style="max-width:480px">
          <label for="cpEmail">Email</label>
          <input id="cpEmail" name="email" type="email" value="${escapeHtml(invite.email)}" readonly required />

          <label for="cpFirstName">First name</label>
          <input id="cpFirstName" name="firstName" type="text" value="${escapeHtml(invite.first_name || "")}" readonly />

          <label for="cpLastName">Last name</label>
          <input id="cpLastName" name="lastName" type="text" value="${escapeHtml(invite.last_name || "")}" readonly />

          <label for="cpRank">Rank</label>
          <input id="cpRank" name="rank" type="text" value="${escapeHtml(invite.rank || "")}" readonly />

          <label for="cpCapId">CAPID</label>
          <input id="cpCapId" name="capId" type="text" value="${escapeHtml(invite.cap_id || "")}" readonly />

          <label for="cpDuty">Duty position</label>
          <input id="cpDuty" name="dutyPosition" type="text" value="${escapeHtml(invite.duty_position || "")}" readonly />

          <label for="cpPreferred">Preferred name (optional)</label>
          <input id="cpPreferred" name="preferredName" type="text" autocomplete="nickname" placeholder="How you prefer to be addressed" />

          <label for="cpPhone">Phone (optional)</label>
          <input id="cpPhone" name="phone" type="tel" autocomplete="tel" />

          <label for="cpPassword">Password</label>
          <input id="cpPassword" name="password" type="password" autocomplete="new-password" minlength="8" required />

          <label for="cpPasswordConfirm">Confirm password</label>
          <input id="cpPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" required />

          <p id="createProfileError" class="login-error" hidden role="alert"></p>
          <button type="submit" class="btn-gold btn-lg" id="createProfileSubmit">Create profile</button>
        </form>
      </section>`;

    const form = document.getElementById("createProfileForm");
    const errEl = document.getElementById("createProfileError");
    const btn = document.getElementById("createProfileSubmit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const password = document.getElementById("cpPassword").value;
      const confirm = document.getElementById("cpPasswordConfirm").value;
      if (password !== confirm) {
        errEl.textContent = "Passwords do not match.";
        errEl.hidden = false;
        return;
      }
      if (password.length < 8) {
        errEl.textContent = "Password must be at least 8 characters.";
        errEl.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating profile…";

      try {
        const sb = client();
        if (!sb) throw new Error("Firebase is not configured.");

        const email = invite.email;
        const token = invite.token || invite.id;
        const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
        if (authErr) throw authErr;
        const uid = authData?.user?.uid || authData?.session?.user?.id;
        if (!uid) throw new Error("Account was created but no user id was returned.");

        const now = new Date().toISOString();
        const profilePayload = {
          id: uid,
          email,
          first_name: invite.first_name || "",
          last_name: invite.last_name || "",
          preferred_name: document.getElementById("cpPreferred").value.trim() || null,
          rank: invite.rank || "",
          cap_id: invite.cap_id || "",
          phone: document.getElementById("cpPhone").value.trim() || null,
          duty_position: invite.duty_position || "",
          role: invite.role_default || "senior_member",
          status: "pending",
          created_at: now,
          updated_at: now,
          created_from_invite_id: token,
        };

        const { error: profileErr } = await sb.from("profiles").insert(profilePayload);
        if (profileErr) throw profileErr;

        const { error: inviteErr } = await sb
          .from("invite_links")
          .update({ status: "used", used_at: now, used_by: uid })
          .eq("id", token);
        if (inviteErr) throw inviteErr;

        global.location.href = "pending-approval.html";
      } catch (err) {
        errEl.textContent =
          global.SMTN170FirebaseAuth?.mapFirebaseAuthError?.(err) || err.message || "Could not create profile.";
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = "Create profile";
      }
    });
  }

  async function init() {
    const root = document.getElementById("createProfilePage");
    if (!root) return;

    await global.SMTN170Firebase?.whenReady?.();
    if (!global.FIREBASE_CONFIG?.isConfigured?.()) {
      showInvalid(root, "Firebase is not configured yet. Contact the portal administrator.");
      return;
    }

    const token = getInviteToken();
    if (!token) {
      showInvalid(root);
      return;
    }

    const invite = await loadInvite(token);
    if (!invite) {
      showInvalid(root);
      return;
    }

    renderForm(root, invite);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
