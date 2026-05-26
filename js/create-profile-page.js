/**
 * TN-170 create-profile page — PUBLIC account request flow.
 *
 * Anyone can request an account. The submit handler:
 *   1. Validates the form (required fields, email format, password match)
 *   2. Creates the Firebase Auth user via createUserWithEmailAndPassword()
 *   3. Writes profiles/{uid} with status="awaiting_approval", role="senior_member"
 *   4. Redirects to pending-approval.html
 *
 * The page also tolerates an optional ?invite=token query parameter for the
 * legacy invite-link flow: if present and valid, the invite details (email,
 * name, rank, CAPID, duty position) are pre-filled and the createdFromInviteId
 * is recorded on the profile. The page works WITHOUT an invite token as the
 * default public path.
 *
 * NEVER reads role/status/approved/isAdmin from the form — those are server-
 * managed and hardcoded here.
 */
(function initCreateProfilePage(global) {
  const SENIOR_RANKS = [
    "2d Lt", "1st Lt", "Capt", "Maj", "Lt Col", "Col",
    "C/2d Lt", "C/1st Lt", "C/Capt", "C/Maj", "C/Lt Col", "C/Col",
    "SM", "FO", "TFO", "SFO",
  ];

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getInviteToken() {
    return new URLSearchParams(global.location.search).get("invite")?.trim() || "";
  }

  function getFirebase() {
    return global.SMTN170Firebase || null;
  }

  function isExpired(invite) {
    const exp = invite?.expiresAt || invite?.expires_at;
    if (!exp) return false;
    const t = typeof exp?.toMillis === "function" ? exp.toMillis() : new Date(exp).getTime();
    return Number.isFinite(t) && t < Date.now();
  }

  async function loadInvite(token) {
    const fb = getFirebase();
    if (!fb || !token) return null;
    try {
      await fb.ensureFullClient?.();
      const mod = fb.getFirestoreModule?.();
      const db = fb.getFirestore?.();
      if (!mod || !db) return null;
      const snap = await mod.getDoc(mod.doc(db, "inviteLinks", token));
      if (!snap.exists()) return null;
      const data = snap.data() || {};
      if (data.status !== "unused") return null;
      if (isExpired(data)) return null;
      return { id: snap.id, ...data };
    } catch (err) {
      console.warn("[create-profile] invite lookup failed", err);
      return null;
    }
  }

  function rankOptions(selected) {
    const opts = SENIOR_RANKS.map(
      (r) => `<option value="${escapeHtml(r)}"${r === selected ? " selected" : ""}>${escapeHtml(r)}</option>`
    ).join("");
    return `<option value="">— Select rank —</option>${opts}`;
  }

  function renderForm(root, invite) {
    const inviteBanner = invite
      ? `<p class="login-notice" style="background:rgba(212,162,38,.12);border:1px solid var(--tn-line);padding:10px;border-radius:8px;margin-bottom:12px">Invite recognized — fields below pre-filled from your invite.</p>`
      : "";

    root.innerHTML = `
      ${inviteBanner}
      <form id="createProfileForm" class="login-form-v2" style="max-width:560px" novalidate>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label for="cpFirstName">First name <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <input id="cpFirstName" name="firstName" type="text" autocomplete="given-name" value="${escapeHtml(invite?.firstName || invite?.first_name || "")}" required />
          </div>
          <div>
            <label for="cpLastName">Last name <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <input id="cpLastName" name="lastName" type="text" autocomplete="family-name" value="${escapeHtml(invite?.lastName || invite?.last_name || "")}" required />
          </div>
        </div>

        <label for="cpPreferred">Preferred name (optional)</label>
        <input id="cpPreferred" name="preferredName" type="text" autocomplete="nickname" placeholder="How you prefer to be addressed" />

        <label for="cpEmail">Email <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
        <input id="cpEmail" name="email" type="email" autocomplete="email" value="${escapeHtml(invite?.email || "")}" ${invite?.email ? "readonly" : ""} required />

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label for="cpPassword">Password <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <input id="cpPassword" name="password" type="password" autocomplete="new-password" minlength="8" required />
          </div>
          <div>
            <label for="cpPasswordConfirm">Confirm password <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <input id="cpPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" required />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label for="cpCapId">CAP ID <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <input id="cpCapId" name="capId" type="text" autocomplete="off" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(invite?.capId || invite?.cap_id || "")}" required />
          </div>
          <div>
            <label for="cpRank">Rank <span aria-hidden="true" style="color:#f6a4a4">*</span></label>
            <select id="cpRank" name="rank" required>${rankOptions(invite?.rank || "")}</select>
          </div>
        </div>

        <label for="cpPhone">Phone (optional)</label>
        <input id="cpPhone" name="phone" type="tel" autocomplete="tel" placeholder="(555) 555-1234" />

        <label for="cpDuty">Duty position (optional)</label>
        <input id="cpDuty" name="dutyPosition" type="text" autocomplete="off" value="${escapeHtml(invite?.dutyPosition || invite?.duty_position || "")}" placeholder="e.g., Personnel Officer" />

        <label for="cpAccessNote">Access note / reason (optional)</label>
        <textarea id="cpAccessNote" name="accessNote" rows="3" placeholder="Anything squadron leadership should know about your request"></textarea>

        <label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-weight:500;line-height:1.4">
          <input type="checkbox" id="cpAcknowledge" name="acknowledge" required style="margin-top:4px" />
          <span>I understand this account must be reviewed and approved by squadron leadership before I can access the portal.</span>
        </label>

        <p id="createProfileError" class="login-error" hidden role="alert"></p>
        <p id="createProfileNotice" class="login-notice" hidden role="status"></p>

        <button type="submit" class="btn-gold btn-lg" id="createProfileSubmit" style="margin-top:14px">Create Account</button>
      </form>
    `;

    bindSubmit(invite);
  }

  function showError(msg) {
    const el = document.getElementById("createProfileError");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError() {
    const el = document.getElementById("createProfileError");
    if (el) el.hidden = true;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function readFormValues() {
    return {
      firstName: document.getElementById("cpFirstName").value.trim(),
      lastName: document.getElementById("cpLastName").value.trim(),
      preferredName: document.getElementById("cpPreferred").value.trim(),
      email: document.getElementById("cpEmail").value.trim(),
      password: document.getElementById("cpPassword").value,
      passwordConfirm: document.getElementById("cpPasswordConfirm").value,
      capId: document.getElementById("cpCapId").value.trim(),
      rank: document.getElementById("cpRank").value.trim(),
      phone: document.getElementById("cpPhone").value.trim(),
      dutyPosition: document.getElementById("cpDuty").value.trim(),
      accessNote: document.getElementById("cpAccessNote").value.trim(),
      acknowledge: document.getElementById("cpAcknowledge").checked,
    };
  }

  function validate(values) {
    if (!values.firstName) return "First name is required.";
    if (!values.lastName) return "Last name is required.";
    if (!values.email) return "Email is required.";
    if (!isValidEmail(values.email)) return "Enter a valid email address.";
    if (!values.password || values.password.length < 8) return "Password must be at least 8 characters.";
    if (values.password !== values.passwordConfirm) return "Passwords do not match.";
    if (!values.capId) return "CAP ID is required.";
    if (!values.rank) return "Rank is required.";
    if (!values.acknowledge) return "Please acknowledge the approval requirement to continue.";
    return null;
  }

  async function submitSignup(values, invite) {
    const fb = getFirebase();
    if (!fb) throw new Error("Firebase is not configured.");

    await fb.whenReady?.({ authOnly: false });
    await fb.ensureFullClient?.();

    const auth = fb.getAuth?.();
    if (!auth) throw new Error("Firebase Auth is not initialized.");
    const mod = fb.getFirestoreModule?.();
    const db = fb.getFirestore?.();
    if (!mod || !db) throw new Error("Firestore is not ready.");

    let createUserWithEmailAndPassword =
      global.__TN170_FIREBASE_MODULES__?.authMod?.createUserWithEmailAndPassword;
    if (!createUserWithEmailAndPassword) {
      const authModImport = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      createUserWithEmailAndPassword = authModImport.createUserWithEmailAndPassword;
    }

    const cred = await createUserWithEmailAndPassword(auth, values.email, values.password);
    const uid = cred?.user?.uid;
    if (!uid) throw new Error("Account was created but no user id was returned.");
    const canonicalEmail = cred.user.email || values.email;

    const { doc, setDoc, updateDoc, serverTimestamp } = mod;

    const profilePayload = {
      email: canonicalEmail,
      firstName: values.firstName,
      lastName: values.lastName,
      preferredName: values.preferredName || "",
      capId: values.capId,
      rank: values.rank,
      phone: values.phone || "",
      dutyPosition: values.dutyPosition || "",
      accessNote: values.accessNote || "",
      role: "senior_member",
      status: "awaiting_approval",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (invite?.id) {
      profilePayload.createdFromInviteId = invite.id;
    }

    await setDoc(doc(db, "profiles", uid), profilePayload);

    if (invite?.id) {
      try {
        await updateDoc(doc(db, "inviteLinks", invite.id), {
          status: "used",
          usedAt: serverTimestamp(),
          usedBy: uid,
        });
      } catch (err) {
        console.warn("[create-profile] invite mark-used failed (non-fatal)", err);
      }
    }

    return uid;
  }

  function bindSubmit(invite) {
    const form = document.getElementById("createProfileForm");
    const btn = document.getElementById("createProfileSubmit");
    if (!form || !btn) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();

      const values = readFormValues();
      const validationError = validate(values);
      if (validationError) {
        showError(validationError);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating account…";

      try {
        await submitSignup(values, invite);
        global.location.href = "pending-approval.html";
      } catch (err) {
        const formatted =
          global.SMTN170FirebaseAuth?.formatAuthError?.(err) ||
          err?.message ||
          "Could not create account.";
        showError(formatted);
        btn.disabled = false;
        btn.textContent = "Create Account";
      }
    });
  }

  async function maybeRedirectSignedIn() {
    const fb = getFirebase();
    if (!fb) return false;
    try {
      const session = await new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            resolve(null);
          }
        }, 4000);
        const { data } = fb.onAuthStateChange((_event, s) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          data?.subscription?.unsubscribe?.();
          resolve(s);
        });
      });
      if (!session?.user?.id) return false;
      const dest =
        (await global.TN170AuthGuard?.resolvePostLoginUrl?.(session.user.id, session.user.email)) ||
        "pending-approval.html";
      global.location.href = dest;
      return true;
    } catch {
      return false;
    }
  }

  async function init() {
    const root = document.getElementById("createProfilePage");
    if (!root) return;

    root.innerHTML = `<p class="login-unit">Loading…</p>`;

    const fb = getFirebase();
    if (!fb || !global.FIREBASE_CONFIG?.isConfigured?.()) {
      root.innerHTML = `<section class="panel"><p>Firebase is not configured yet. Contact the portal administrator.</p></section>`;
      return;
    }

    await fb.whenReady?.({ authOnly: false });

    if (global.TN170AuthGuard && (await maybeRedirectSignedIn())) return;

    const token = getInviteToken();
    const invite = token ? await loadInvite(token) : null;
    renderForm(root, invite);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
