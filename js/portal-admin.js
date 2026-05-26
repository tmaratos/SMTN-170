/**
 * TN-170 admin — invites, pending profiles, website-based approvals (Firebase).
 */
(function initPortalAdmin(global) {
  const APPROVAL_ROLES = [
    { id: "senior_member", label: "Senior Member" },
    { id: "senior_member_limited", label: "Senior Member Limited" },
    { id: "commander", label: "Commander" },
    { id: "admin", label: "Admin" },
  ];

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function displayName(row) {
    return global.SMTN170Profile?.computeDisplayName?.(row) || row.email || "Member";
  }

  function client() {
    return global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
  }

  function firestore() {
    const fb = global.SMTN170Firebase;
    return {
      mod: fb?.getFirestoreModule?.(),
      db: fb?.getFirestore?.(),
    };
  }

  function generateInviteToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function fetchPending() {
    const sb = client();
    if (!sb) return { rows: [], configured: false };
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id, email, first_name, last_name, preferred_name, rank, cap_id, phone, duty_position, role, status, created_at, updated_at, created_from_invite_id, profile_photo_url"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) return { rows: [], configured: true, error: error.message };
    return { rows: data || [], configured: true };
  }

  async function writeAudit(action, targetId, details) {
    const sb = client();
    const actorId = global.SMTN170Auth?.actorId?.();
    if (!sb || !actorId) return;
    await sb.from("audit_log").insert({
      actor_id: actorId,
      action,
      target_table: "profiles",
      target_id: targetId,
      details: details || {},
    });
  }

  async function approveProfile(userId, role, displayLabel) {
    const auth = global.SMTN170Auth;
    const { mod, db } = firestore();
    if (!mod || !db) throw new Error("Firebase is not configured.");
    const adminId = auth?.actorId?.();
    if (!adminId) throw new Error("You must be signed in to approve profiles.");

    const { doc, updateDoc, serverTimestamp } = mod;
    await updateDoc(doc(db, "profiles", userId), {
      status: "active",
      role: role || "senior_member",
      approvedAt: serverTimestamp(),
      approvedBy: adminId,
      updatedAt: serverTimestamp(),
    });

    await writeAudit("approve_profile", userId, {
      status: "active",
      role: role || "senior_member",
      label: displayLabel || userId,
    });
  }

  async function denyProfile(userId, displayLabel) {
    const auth = global.SMTN170Auth;
    const { mod, db } = firestore();
    if (!mod || !db) throw new Error("Firebase is not configured.");
    const adminId = auth?.actorId?.();
    if (!adminId) throw new Error("You must be signed in to deny profiles.");

    const { doc, updateDoc, serverTimestamp } = mod;
    await updateDoc(doc(db, "profiles", userId), {
      status: "denied",
      deniedAt: serverTimestamp(),
      deniedBy: adminId,
      updatedAt: serverTimestamp(),
    });

    await writeAudit("deny_profile", userId, {
      status: "denied",
      label: displayLabel || userId,
    });
  }

  async function createInvite(form) {
    const sb = client();
    const auth = global.SMTN170Auth;
    if (!sb) throw new Error("Firebase is not configured.");
    if (!auth?.isAdmin?.()) throw new Error("Only Commander or Admin can create invite links.");

    const email = String(form.email || "").trim().toLowerCase();
    if (!email) throw new Error("Email is required.");

    const token = generateInviteToken();
    const now = new Date().toISOString();
    const payload = {
      id: token,
      email,
      cap_id: String(form.capId || "").trim(),
      first_name: String(form.firstName || "").trim(),
      last_name: String(form.lastName || "").trim(),
      rank: String(form.rank || "").trim(),
      duty_position: String(form.dutyPosition || "").trim(),
      role_default: form.roleDefault || "senior_member",
      token,
      status: "unused",
      created_at: now,
      created_by: auth.actorId?.() || null,
    };

    const { error } = await sb.from("invite_links").insert(payload);
    if (error) throw error;

    const base = new URL(".", global.location.href);
    const inviteUrl = new URL("create-profile.html", base);
    inviteUrl.searchParams.set("invite", token);
    return { token, url: inviteUrl.pathname + inviteUrl.search };
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return String(value);
    }
  }

  function fieldRow(label, value) {
    return `<div class="admin-pending-field"><span class="admin-pending-label">${escapeHtml(label)}</span><span class="admin-pending-value">${escapeHtml(value || "—")}</span></div>`;
  }

  function roleOptions(selectedRole) {
    const current = selectedRole || "senior_member";
    return APPROVAL_ROLES.map(
      (r) =>
        `<option value="${escapeHtml(r.id)}"${r.id === current ? " selected" : ""}>${escapeHtml(r.label)}</option>`
    ).join("");
  }

  function renderPendingCard(m) {
    const name = displayName(m);
    const defaultRole = m.role || "senior_member";
    return `
      <article class="panel admin-pending-card" data-pending-id="${escapeHtml(m.id)}">
        <div class="admin-pending-grid">
          ${fieldRow("Rank", m.rank)}
          ${fieldRow("First name", m.first_name)}
          ${fieldRow("Last name", m.last_name)}
          ${fieldRow("Preferred name", m.preferred_name)}
          ${fieldRow("Email", m.email)}
          ${fieldRow("CAPID", m.cap_id)}
          ${fieldRow("Phone", m.phone)}
          ${fieldRow("Duty position", m.duty_position)}
          ${fieldRow("Created at", formatDate(m.created_at || m.updated_at))}
          ${fieldRow("Created from invite", m.created_from_invite_id)}
        </div>
        <div class="admin-pending-actions">
          <label for="approveRole-${escapeHtml(m.id)}">Role on approval</label>
          <select id="approveRole-${escapeHtml(m.id)}" data-approve-role="${escapeHtml(m.id)}">${roleOptions(defaultRole)}</select>
          <div class="admin-pending-buttons">
            <button type="button" class="btn-gold btn-sm" data-admin-action="approve" data-user-id="${escapeHtml(m.id)}" data-user-name="${escapeHtml(name)}">Approve</button>
            <button type="button" class="ghost-btn btn-sm" data-admin-action="deny" data-user-id="${escapeHtml(m.id)}" data-user-name="${escapeHtml(name)}">Deny</button>
            <button type="button" class="ghost-btn btn-sm" data-admin-action="details" data-user-id="${escapeHtml(m.id)}">View Details</button>
          </div>
        </div>
      </article>`;
  }

  function profileDetailRows(m) {
    const rows = [
      ["Profile ID", m.id],
      ["Email", m.email],
      ["First name", m.first_name],
      ["Last name", m.last_name],
      ["Preferred name", m.preferred_name],
      ["Rank", m.rank],
      ["CAPID", m.cap_id],
      ["Phone", m.phone],
      ["Duty position", m.duty_position],
      ["Role", m.role],
      ["Status", m.status],
      ["Created at", formatDate(m.created_at)],
      ["Updated at", formatDate(m.updated_at)],
      ["Created from invite", m.created_from_invite_id],
      ["Profile photo URL", m.profile_photo_url],
    ];
    return rows
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`)
      .join("");
  }

  function openDetailsModal(profile) {
    let modal = document.getElementById("adminProfileModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "adminProfileModal";
      modal.className = "admin-profile-modal";
      modal.innerHTML = `<div class="admin-profile-modal-backdrop" data-modal-close></div><div class="admin-profile-modal-panel panel" role="dialog" aria-modal="true" aria-labelledby="adminProfileModalTitle"><button type="button" class="admin-profile-modal-close" data-modal-close aria-label="Close">✕</button><h2 id="adminProfileModalTitle">Profile details</h2><div id="adminProfileModalBody"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-modal-close]").forEach((el) => {
        el.addEventListener("click", () => {
          modal.hidden = true;
        });
      });
    }
    document.getElementById("adminProfileModalBody").innerHTML = `
      <p class="page-intro">${escapeHtml(displayName(profile))}</p>
      <table class="admin-table admin-detail-table"><tbody>${profileDetailRows(profile)}</tbody></table>`;
    modal.hidden = false;
  }

  async function render() {
    const root = document.getElementById("adminPage");
    const auth = global.SMTN170Auth;
    const data = global.SMTN170_DATA;
    if (!root || !auth || !data) return;

    if (!auth.isAdmin?.()) {
      root.innerHTML = `<section class="panel"><h2>Access denied</h2><p>You do not have permission to access this page.</p><a class="btn-gold" href="dashboard.html">Return to Home</a></section>`;
      return;
    }

    const pendingRes = await fetchPending();
    const roles = Object.values(data.ROLES || {});

    const pendingCards = pendingRes.rows.length
      ? pendingRes.rows.map(renderPendingCard).join("")
      : `<p class="dash-empty">No profiles awaiting approval.</p>`;

    const roleOptionsInvite = roles
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`)
      .join("");

    root.innerHTML = `
      <p class="page-intro">Commander and Admin tools for the private Senior Member operations portal.</p>
      <p class="role-banner">Admin-only: create invite links, approve profiles, change roles, and manage squadron settings.</p>

      <section class="card-warning panel">
        <h2>Pending Profile Approvals</h2>
        <p>Review and approve or deny profiles submitted through invite links. All approval happens here — no email or console steps required.</p>
        ${!pendingRes.configured ? '<p class="dash-empty">Connect Firebase to load pending profiles.</p>' : ""}
        ${pendingRes.error ? `<p class="dash-empty">${escapeHtml(pendingRes.error)}</p>` : ""}
        <div class="admin-pending-list">${pendingCards}</div>
      </section>

      <section class="card-info panel">
        <h2>Create profile invite</h2>
        <p>Generate a one-time invite link for a new member. They will create their profile and await your approval before portal access.</p>
        <form id="adminInviteForm" class="admin-invite-form">
          <div class="card-grid-2">
            <div>
              <label for="inviteEmail">Email</label>
              <input id="inviteEmail" name="email" type="email" required autocomplete="off" />
            </div>
            <div>
              <label for="inviteCapId">CAPID</label>
              <input id="inviteCapId" name="capId" type="text" autocomplete="off" />
            </div>
            <div>
              <label for="inviteFirstName">First name</label>
              <input id="inviteFirstName" name="firstName" type="text" required autocomplete="off" />
            </div>
            <div>
              <label for="inviteLastName">Last name</label>
              <input id="inviteLastName" name="lastName" type="text" required autocomplete="off" />
            </div>
            <div>
              <label for="inviteRank">Rank</label>
              <input id="inviteRank" name="rank" type="text" autocomplete="off" />
            </div>
            <div>
              <label for="inviteDuty">Duty position</label>
              <input id="inviteDuty" name="dutyPosition" type="text" autocomplete="off" />
            </div>
            <div>
              <label for="inviteRole">Default role</label>
              <select id="inviteRole" name="roleDefault">${roleOptionsInvite}</select>
            </div>
          </div>
          <p id="inviteFormError" class="login-error" hidden role="alert"></p>
          <button type="submit" class="btn-gold" id="inviteSubmitBtn">Create invite link</button>
        </form>
        <div id="inviteResult" hidden style="margin-top:16px">
          <p><strong>Invite link ready</strong> — copy and send to the member:</p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <input id="inviteUrlField" type="text" readonly style="flex:1;min-width:220px;padding:10px;border-radius:8px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff" />
            <button type="button" class="ghost-btn" id="inviteCopyBtn">Copy link</button>
          </div>
        </div>
      </section>

      <div class="card-grid-2">
        <article class="panel">
          <h2>Change member role</h2>
          <p>Assign Commander, Admin, Senior Member, or Senior Member Limited. Approved Senior Members only.</p>
          <label for="adminRoleSelect">Role</label>
          <select id="adminRoleSelect" style="width:100%;margin:8px 0 12px;padding:12px;border-radius:10px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff">${roleOptionsInvite}</select>
          <p class="page-intro" style="margin:0">Role changes are applied in Firestore when member management is enabled for this squadron.</p>
        </article>
        <article class="panel">
          <h2>Global settings</h2>
          <p>Squadron display options and default filing categories for the operations workspace.</p>
        </article>
        <article class="panel">
          <h2>Firebase configuration</h2>
          <p>Project connection and security rules. Service account keys are never exposed in the browser.</p>
          <p class="page-intro" style="margin-top:8px">Paste web config keys in <code>js/firebase-config.js</code>, then deploy rules and functions.</p>
        </article>
        <article class="panel">
          <h2>File categories</h2>
          <p>Manage filing categories used by the squadron file library.</p>
          <a class="btn-gold" href="documents.html" style="display:inline-block;margin-top:8px">Open Files and forms</a>
        </article>
        <article class="panel">
          <h2>Steward policy</h2>
          <p>CAP reference scope and squadron file context for Steward for CAP on the TN-170 Senior Member operations portal.</p>
        </article>
      </div>

      <article class="card-info panel">
        <h2>Access model</h2>
        <ul class="dash-bullet-list">
          <li>Invite links control who can create a profile — there is no public signup.</li>
          <li>Login controls sign-in; approval on this page controls workspace access.</li>
          <li>All approved Senior Members share the same operational workspace.</li>
          <li>See <code>firestore.rules</code> for security rules reference.</li>
        </ul>
      </article>`;

    const pendingById = Object.fromEntries(pendingRes.rows.map((r) => [r.id, r]));

    root.querySelectorAll("[data-admin-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.adminAction;
        const userId = btn.dataset.userId;
        const userName = btn.dataset.userName || userId;
        if (!userId) return;

        if (action === "details") {
          openDetailsModal(pendingById[userId] || { id: userId });
          return;
        }

        const label = action === "approve" ? `Approve profile for ${userName}?` : `Deny profile for ${userName}?`;
        if (!global.confirm(label)) return;

        try {
          if (action === "approve") {
            const roleSelect = root.querySelector(`[data-approve-role="${userId}"]`);
            const role = roleSelect?.value || pendingById[userId]?.role || "senior_member";
            await approveProfile(userId, role, userName);
            alert("Profile approved. The member can now access the portal.");
          } else if (action === "deny") {
            await denyProfile(userId, userName);
            alert("Profile denied.");
          }
          render();
        } catch (err) {
          alert(err.message || "Could not update profile.");
        }
      });
    });

    const inviteForm = document.getElementById("adminInviteForm");
    const inviteErr = document.getElementById("inviteFormError");
    const inviteResult = document.getElementById("inviteResult");
    inviteForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      inviteErr.hidden = true;
      const btn = document.getElementById("inviteSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Creating…";
      try {
        const fd = new FormData(inviteForm);
        const result = await createInvite(Object.fromEntries(fd.entries()));
        inviteResult.hidden = false;
        const field = document.getElementById("inviteUrlField");
        field.value = result.url;
        document.getElementById("inviteCopyBtn")?.addEventListener(
          "click",
          async () => {
            try {
              await navigator.clipboard.writeText(result.url);
              alert("Invite link copied.");
            } catch {
              field.select();
              document.execCommand("copy");
              alert("Invite link copied.");
            }
          },
          { once: true }
        );
      } catch (err) {
        inviteErr.textContent = err.message || "Could not create invite link.";
        inviteErr.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "Create invite link";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
