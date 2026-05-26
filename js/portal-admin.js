/**
 * TN-170 admin — invites, pending profiles, approvals (Firebase).
 */
(function initPortalAdmin(global) {
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
      .select("id, email, first_name, last_name, preferred_name, rank, cap_id, duty_position, role, status, created_at, updated_at")
      .in("status", ["pending", "awaiting_approval", "awaiting_verification"])
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

  async function setAccountStatus(userId, status, displayLabel) {
    const sb = client();
    if (!sb) throw new Error("Firebase is not configured.");
    const { error } = await sb.from("profiles").update({ status }).eq("id", userId);
    if (error) throw error;
    const action = status === "active" ? "approve_profile" : "deny_profile";
    await writeAudit(action, userId, { status, label: displayLabel || status });
  }

  async function createInvite(form) {
    const sb = client();
    const auth = global.SMTN170Auth;
    if (!sb) throw new Error("Firebase is not configured.");
    if (!auth?.isAdmin?.()) throw new Error("Only Commander or Command Staff can create invite links.");

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

  async function render() {
    const root = document.getElementById("adminPage");
    const auth = global.SMTN170Auth;
    const data = global.SMTN170_DATA;
    if (!root || !auth || !data) return;

    if (!auth.isAdmin?.()) {
      root.innerHTML = `<section class="panel"><h2>Admin access required</h2><p>This page is for Commander and Command Staff only.</p><a class="btn-gold" href="dashboard.html">Return to Home</a></section>`;
      return;
    }

    const pendingRes = await fetchPending();
    const roles = Object.values(data.ROLES || {});

    const pendingRows = pendingRes.rows.length
      ? pendingRes.rows
          .map(
            (m) => `
        <tr>
          <td>${escapeHtml(displayName(m))}</td>
          <td>${escapeHtml(m.rank || "—")}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.cap_id || "—")}</td>
          <td>${escapeHtml(m.duty_position || "—")}</td>
          <td><time>${escapeHtml(formatDate(m.created_at || m.updated_at))}</time></td>
          <td>
            <button type="button" class="btn-gold btn-sm" data-admin-action="approve" data-user-id="${escapeHtml(m.id)}">Approve</button>
            <button type="button" class="ghost-btn btn-sm" data-admin-action="deny" data-user-id="${escapeHtml(m.id)}">Deny</button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7">No profiles awaiting approval.</td></tr>`;

    const roleOptions = roles
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`)
      .join("");

    root.innerHTML = `
      <p class="page-intro">Commander and Command Staff tools for the private Senior Member operations portal.</p>
      <p class="role-banner">Admin-only: create invite links, approve profiles, change roles, and manage squadron settings.</p>

      <section class="card-warning panel">
        <h2>Pending profiles</h2>
        <p>Members who used an invite link can sign in but cannot access the portal until you approve their profile.</p>
        ${!pendingRes.configured ? '<p class="dash-empty">Connect Firebase to load pending profiles.</p>' : ""}
        ${pendingRes.error ? `<p class="dash-empty">${escapeHtml(pendingRes.error)}</p>` : ""}
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Rank</th><th>Email</th><th>CAPID</th><th>Duty position</th><th>Submitted</th><th>Actions</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
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
              <select id="inviteRole" name="roleDefault">${roleOptions}</select>
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
          <p>Assign Commander, Command Staff, Senior Member, or Senior Member Limited. Approved Senior Members only.</p>
          <label for="adminRoleSelect">Role</label>
          <select id="adminRoleSelect" style="width:100%;margin:8px 0 12px;padding:12px;border-radius:10px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff">${roleOptions}</select>
          <p class="page-intro" style="margin:0">Role changes are applied in Firestore when member management is enabled for this squadron.</p>
        </article>
        <article class="panel">
          <h2>Global settings</h2>
          <p>Squadron display options and default filing categories for the operations workspace.</p>
        </article>
        <article class="panel">
          <h2>Firebase configuration</h2>
          <p>Project connection, security rules, and Cloud Functions. Service account keys are never exposed in the browser.</p>
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
          <li>Login controls sign-in; approval controls workspace access.</li>
          <li>All approved Senior Members share the same operational workspace.</li>
          <li>See <code>firestore.rules</code> for security rules reference.</li>
        </ul>
      </article>`;

    root.querySelectorAll("[data-admin-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.adminAction;
        const userId = btn.dataset.userId;
        if (!userId) return;
        const label = action === "approve" ? "Approve this profile?" : "Deny this profile?";
        if (!global.confirm(label)) return;
        try {
          if (action === "approve") {
            await setAccountStatus(userId, auth.ACCOUNT_STATUS.ACTIVE, displayName({ id: userId }));
            alert("Profile approved. The member can now access the portal.");
          } else if (action === "deny") {
            await setAccountStatus(userId, auth.ACCOUNT_STATUS.DENIED, displayName({ id: userId }));
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
