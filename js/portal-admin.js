/**
 * TN-170 admin — pending account approvals + role management (Firebase).
 *
 * Account creation is now a fully public self-signup flow (login.html →
 * create-profile.html). New accounts land here in "awaiting_approval" status
 * and an admin/commander approves or denies them from the Pending Account
 * Requests section below.
 */
(function initPortalAdmin(global) {
  const APPROVAL_ROLES = [
    { id: "senior_member", label: "Senior Member" },
    { id: "staff", label: "Staff" },
    { id: "admin", label: "Admin" },
    { id: "commander", label: "Commander" },
  ];

  const PENDING_STATUSES = ["awaiting_approval", "pending"];

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function displayName(row) {
    return global.SMTN170Profile?.computeDisplayName?.(row) || row.email || "Member";
  }

  function firestore() {
    const fb = global.SMTN170Firebase;
    return {
      mod: fb?.getFirestoreModule?.(),
      db: fb?.getFirestore?.(),
    };
  }

  function tsToDate(value) {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.toMillis === "function") return new Date(value.toMillis());
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function readField(row, ...keys) {
    if (!row) return "";
    for (const k of keys) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  }

  async function fetchPending() {
    const { mod, db } = firestore();
    if (!mod || !db) return { rows: [], configured: false };
    try {
      const { collection, query, where, orderBy, getDocs } = mod;
      const profilesRef = collection(db, "profiles");
      let snap;
      try {
        snap = await getDocs(
          query(profilesRef, where("status", "in", PENDING_STATUSES), orderBy("createdAt", "asc"))
        );
      } catch (orderErr) {
        console.warn(
          "[admin] order by createdAt failed, falling back to client sort",
          orderErr?.message || orderErr
        );
        snap = await getDocs(query(profilesRef, where("status", "in", PENDING_STATUSES)));
      }
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ad = tsToDate(a.createdAt)?.getTime() || 0;
        const bd = tsToDate(b.createdAt)?.getTime() || 0;
        return ad - bd;
      });
      return { rows, configured: true };
    } catch (err) {
      return { rows: [], configured: true, error: err?.message || String(err) };
    }
  }

  async function writeAudit(action, targetId, details) {
    const { mod, db } = firestore();
    const actorId = global.SMTN170Auth?.actorId?.();
    if (!mod || !db || !actorId) return;
    try {
      const { collection, addDoc, serverTimestamp } = mod;
      await addDoc(collection(db, "auditLog"), {
        actorId,
        action,
        targetTable: "profiles",
        targetId,
        details: details || {},
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[admin] audit log write failed", err?.message || err);
    }
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

  function formatDate(value) {
    if (!value) return "—";
    const d = tsToDate(value);
    if (!d) return String(value);
    try {
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return d.toISOString();
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
    const firstName = readField(m, "firstName", "first_name");
    const lastName = readField(m, "lastName", "last_name");
    const preferredName = readField(m, "preferredName", "preferred_name");
    const capId = readField(m, "capId", "cap_id");
    const dutyPosition = readField(m, "dutyPosition", "duty_position");
    const accessNote = readField(m, "accessNote", "access_note");
    const createdAt = m.createdAt || m.created_at || m.updatedAt || m.updated_at;
    return `
      <article class="panel admin-pending-card" data-pending-id="${escapeHtml(m.id)}">
        <div class="admin-pending-grid">
          ${fieldRow("Rank", m.rank)}
          ${fieldRow("First name", firstName)}
          ${fieldRow("Last name", lastName)}
          ${fieldRow("Preferred name", preferredName)}
          ${fieldRow("Email", m.email)}
          ${fieldRow("CAP ID", capId)}
          ${fieldRow("Phone", m.phone)}
          ${fieldRow("Duty position", dutyPosition)}
          ${fieldRow("Submitted", formatDate(createdAt))}
        </div>
        ${accessNote ? `<div class="admin-pending-note" style="margin-top:12px;padding:10px;background:rgba(1,8,20,.5);border-left:3px solid var(--tn-gold);border-radius:6px"><strong style="display:block;margin-bottom:4px">Access note</strong><span>${escapeHtml(accessNote)}</span></div>` : ""}
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
      ["First name", readField(m, "firstName", "first_name")],
      ["Last name", readField(m, "lastName", "last_name")],
      ["Preferred name", readField(m, "preferredName", "preferred_name")],
      ["Rank", m.rank],
      ["CAP ID", readField(m, "capId", "cap_id")],
      ["Phone", m.phone],
      ["Duty position", readField(m, "dutyPosition", "duty_position")],
      ["Access note", readField(m, "accessNote", "access_note")],
      ["Role", m.role],
      ["Status", m.status],
      ["Created at", formatDate(m.createdAt || m.created_at)],
      ["Updated at", formatDate(m.updatedAt || m.updated_at)],
      ["Profile photo URL", readField(m, "profilePhotoUrl", "profile_photo_url")],
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
    if (!root || !data) return;

    root.innerHTML = `<section class="panel"><p class="page-intro">Checking admin access…</p></section>`;

    await auth?.init?.();
    const profile =
      (await auth?.getCurrentUserProfile?.()) ||
      global.TN170_CURRENT_PROFILE ||
      auth?.getProfile?.() ||
      null;
    const user = global.TN170_CURRENT_USER || {
      uid: auth?.actorId?.() || profile?.uid || profile?.id || null,
      email: auth?.loadSession?.()?.email || profile?.email || "",
    };
    const allowAdmin =
      global.TN170_ADMIN_ALLOW ??
      auth?.computeAllowAdmin?.(profile) ??
      global.TN170AuthGuard?.canAccessAdmin?.(profile) ??
      false;

    console.log("[admin guard] auth uid", user?.uid || "(none)");
    console.log("[admin guard] email", user?.email || "(none)");
    console.log("[admin guard] profile path", user?.uid ? `profiles/${user.uid}` : "(none)");
    console.log("[admin guard] role", profile?.role ?? "(none)");
    console.log("[admin guard] status", global.SMTN170Profile?.getProfileStatus?.(profile) || profile?.status || "(none)");
    console.log("[admin guard] allowAdmin", allowAdmin);

    if (!auth || !allowAdmin) {
      root.innerHTML = `<section class="panel"><h2>Access denied</h2><p>You do not have permission to access this page.</p><a class="btn-gold" href="dashboard.html">Return to Home</a></section>`;
      return;
    }

    const pendingRes = await fetchPending();
    const roles = Object.values(data.ROLES || {});

    const pendingCards = pendingRes.rows.length
      ? pendingRes.rows.map(renderPendingCard).join("")
      : `<p class="dash-empty">No account requests awaiting approval.</p>`;

    const roleOptionsAll = roles
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`)
      .join("");

    root.innerHTML = `
      <p class="page-intro">Commander and Admin tools for the private Senior Member operations portal.</p>
      <p class="role-banner">Admin-only: approve new account requests, change roles, and manage squadron settings.</p>

      <section class="card-warning panel" id="pendingAccountRequests">
        <h2>Pending Account Requests</h2>
        <p>Review and approve or deny new account requests submitted from the public Create Account page. All approval happens here — no email or console steps required.</p>
        ${!pendingRes.configured ? '<p class="dash-empty">Connect Firebase to load pending account requests.</p>' : ""}
        ${pendingRes.error ? `<p class="dash-empty">${escapeHtml(pendingRes.error)}</p>` : ""}
        <div class="admin-pending-list">${pendingCards}</div>
      </section>

      <div class="card-grid-2">
        <article class="panel">
          <h2>Change member role</h2>
          <p>Assign Commander, Admin, Senior Member, or Senior Member Limited. Approved Senior Members only.</p>
          <label for="adminRoleSelect">Role</label>
          <select id="adminRoleSelect" style="width:100%;margin:8px 0 12px;padding:12px;border-radius:10px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff">${roleOptionsAll}</select>
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
          <li>Anyone can request portal access via Create Account on the login page — no invite required.</li>
          <li>New accounts land in "awaiting_approval" status. Approve or deny them above.</li>
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body?.dataset?.portalPage !== "admin") render();
    });
  } else if (document.body?.dataset?.portalPage !== "admin") {
    render();
  }

  global.SMTN170PortalAdmin = { render };
})(window);
