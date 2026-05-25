/**
 * TN-170 admin — Commander & Command Staff (Supabase profiles).
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

  async function fetchPending() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return { rows: [], configured: false };
    const { data, error } = await sb
      .from("profiles")
      .select("id, email, first_name, last_name, preferred_name, rank, role, status, created_at, updated_at")
      .eq("status", "awaiting_approval")
      .order("created_at", { ascending: true });
    if (error) return { rows: [], configured: true, error: error.message };
    return { rows: data || [], configured: true };
  }

  async function setAccountStatus(userId, status) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) throw new Error("Supabase is not configured.");
    const { error } = await sb
      .from("profiles")
      .update({ status })
      .eq("id", userId);
    if (error) throw error;
  }

  async function render() {
    const root = document.getElementById("adminPage");
    const auth = global.SMTN170Auth;
    const data = global.SMTN170_DATA;
    if (!root || !auth || !data) return;

    const pendingRes = await fetchPending();
    const roles = Object.values(data.ROLES || {});

    const pendingRows = pendingRes.rows.length
      ? pendingRes.rows
          .map(
            (m) => `
        <tr>
          <td>${escapeHtml(displayName(m))}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.rank || "—")}</td>
          <td><time>${escapeHtml(new Date(m.created_at || m.updated_at).toLocaleDateString())}</time></td>
          <td>
            <button type="button" class="btn-gold btn-sm" data-admin-action="approve" data-user-id="${escapeHtml(m.id)}">Approve</button>
            <button type="button" class="ghost-btn btn-sm" data-admin-action="deny" data-user-id="${escapeHtml(m.id)}">Deny</button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5">No pending approval requests.</td></tr>`;

    const roleOptions = roles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join("");

    root.innerHTML = `
      <p class="page-intro">Commander and Command Staff tools for the private Senior Member operations portal. Roles identify members for audit — they do not hide operational pages from approved Senior Members.</p>
      <p class="role-banner">Admin-only: approve users, change roles, delete records, global settings, and Supabase configuration.</p>

      <section class="card-warning panel">
        <h2>Pending approvals</h2>
        <p>Members with <code>awaiting_approval</code> can sign in but only see the pending approval page until approved.</p>
        ${!pendingRes.configured ? '<p class="dash-empty">Connect Supabase to load pending members.</p>' : ""}
        ${pendingRes.error ? `<p class="dash-empty">${escapeHtml(pendingRes.error)}</p>` : ""}
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Rank</th><th>Requested</th><th>Actions</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </section>

      <div class="card-grid-2">
        <article class="panel">
          <h2>Change member role</h2>
          <p>Assign Commander, Command Staff, Senior Member, or Senior Member Limited. Approved Senior Members only.</p>
          <label for="adminRoleSelect">Role</label>
          <select id="adminRoleSelect" style="width:100%;margin:8px 0 12px;padding:12px;border-radius:10px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff">${roleOptions}</select>
          <p class="page-intro" style="margin:0">Role changes are applied in Supabase when member management is enabled for this squadron.</p>
        </article>
        <article class="panel">
          <h2>Global settings</h2>
          <p>Squadron display options and default filing categories for the operations workspace.</p>
        </article>
        <article class="panel">
          <h2>Supabase configuration</h2>
          <p>Project connection, RLS policies, and webhooks. Service keys are never exposed in the browser.</p>
          <p class="page-intro" style="margin-top:8px">See <code>docs/SUPABASE_SETUP.md</code> for deployment steps.</p>
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
          <li>Login controls portal entry; approval controls workspace access.</li>
          <li>All approved Senior Members share the same operational workspace.</li>
          <li>Audit fields: created_by, updated_by, last_worked_by on operational tables.</li>
          <li>See <code>docs/SUPABASE_SECURITY_MODEL.md</code> for RLS reference.</li>
        </ul>
      </article>`;

    root.querySelectorAll("[data-admin-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.adminAction;
        const userId = btn.dataset.userId;
        if (!userId) return;
        try {
          if (action === "approve") {
            await setAccountStatus(userId, auth.ACCOUNT_STATUS.APPROVED);
            alert("Member approved.");
          } else if (action === "deny") {
            await setAccountStatus(userId, auth.ACCOUNT_STATUS.AWAITING);
            alert("Request noted. Adjust status in Supabase if needed.");
          }
          render();
        } catch (err) {
          alert(err.message || "Could not update member.");
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
