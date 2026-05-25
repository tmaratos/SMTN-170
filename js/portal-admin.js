/**
 * TN-170 admin tooling — Commander & Command Staff only (page guarded by portal-auth).
 */
(function initPortalAdmin(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function render() {
    const root = document.getElementById("adminPage");
    const auth = global.SMTN170Auth;
    const data = global.SMTN170_DATA;
    if (!root || !auth || !data) return;

    const pending = data.PENDING_MEMBERS || [];
    const roles = Object.values(data.ROLES || {});

    const pendingRows = pending.length
      ? pending
          .map(
            (m) => `
        <tr>
          <td>${escapeHtml(m.displayName || m.email)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.rank || "—")}</td>
          <td><time>${escapeHtml(new Date(m.requestedAt).toLocaleDateString())}</time></td>
          <td>
            <button type="button" class="btn-gold btn-sm" data-admin-action="approve" data-user-id="${escapeHtml(m.id)}">Approve</button>
            <button type="button" class="ghost-btn btn-sm" data-admin-action="deny" data-user-id="${escapeHtml(m.id)}">Deny</button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5">No pending requests in demo data.</td></tr>`;

    const roleOptions = roles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join("");

    root.innerHTML = `
      <p class="page-intro">Commander and Command Staff tools. Roles identify members for audit and Steward context — they do not hide meetings, files, or readiness from approved Senior Members.</p>
      <p class="role-banner">Admin-only: approve users, change roles, delete records, global settings, and Supabase configuration.</p>

      <section class="card-warning panel">
        <h2>Pending approvals</h2>
        <p>Members with <code>awaiting_verification</code> see only the pending approval page until approved.</p>
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Rank</th><th>Requested</th><th>Actions</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </section>

      <div class="card-grid-2">
        <article class="panel">
          <h2>Change member role</h2>
          <p class="steward-planned">Assign Commander, Command Staff, Senior Member, or Senior Member Limited. This portal is for approved Senior Members only.</p>
          <label for="adminRoleSelect">Role label</label>
          <select id="adminRoleSelect" style="width:100%;margin:8px 0 12px;padding:12px;border-radius:10px;border:1px solid var(--tn-line);background:rgba(1,8,20,.8);color:#fff">${roleOptions}</select>
          <button type="button" class="ghost-btn" disabled data-require-action="change_roles">Save role (Supabase)</button>
        </article>
        <article class="panel">
          <h2>Global settings</h2>
          <p class="steward-planned">Portal-wide categories, announcements defaults, and squadron display options.</p>
          <button type="button" class="ghost-btn" disabled data-require-action="global_settings">Edit settings</button>
        </article>
        <article class="panel">
          <h2>Supabase configuration</h2>
          <p class="steward-planned">Project connection, RLS policies, webhooks, and service keys — never exposed to standard members.</p>
          <button type="button" class="ghost-btn" disabled data-require-action="supabase_config">Connection settings</button>
        </article>
        <article class="panel">
          <h2>Delete records</h2>
          <p class="steward-planned">Hard-delete squadron records requires Commander or Command Staff confirmation in production.</p>
          <button type="button" class="ghost-btn" disabled data-require-action="delete_records">Record deletion</button>
        </article>
        <article class="panel">
          <h2>File categories</h2>
          <p>Edit filing categories used by the upload center.</p>
          <a class="btn-gold" href="documents.html" style="display:inline-block;margin-top:8px">Open Files &amp; Forms</a>
        </article>
        <article class="panel">
          <h2>Steward policy</h2>
          <p class="steward-planned">CAP sources and squadron file scope for Steward — shared with all approved users; policy edits are admin-only.</p>
          <button type="button" class="ghost-btn" disabled>Steward policy</button>
        </article>
      </div>

      <article class="card-info panel">
        <h2>Access model reminder</h2>
        <ul class="dash-bullet-list">
          <li>Login controls portal entry; approval controls workspace access.</li>
          <li>All approved Senior Members share the same operational workspace.</li>
          <li>Audit fields: created_by, updated_by, last_worked_by, assigned_to, reviewed_by, completed_by.</li>
          <li>See <code>docs/SUPABASE_SECURITY_MODEL.md</code> and <code>supabase/schema-reference.sql</code> for RLS reference.</li>
        </ul>
      </article>`;

    root.querySelectorAll("[data-admin-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.adminAction;
        alert(
          action === "approve"
            ? "Demo: member would be set to account_status = approved (Supabase)."
            : "Demo: access request denied (Supabase)."
        );
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
