/**
 * TN-170 Files & Resources — Firestore resourceLinks CRUD (V1 link directory only).
 */
(function initResourceLinks(global) {
  const CATEGORIES = [
    "Meeting Schedules",
    "Meeting Minutes",
    "Org Charts",
    "Inspection Prep",
    "Flight Reviews",
    "Safety",
    "Training",
    "Forms",
    "CAP References",
  ];

  let links = [];
  let editingId = null;
  let showForm = false;

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getClient() {
    return global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso + (String(iso).includes("T") ? "" : "T12:00:00")).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function formatError(error) {
    if (!error) return "Unknown error";
    return error.message || String(error);
  }

  async function ensureAuth() {
    await global.SMTN170Firebase?.whenReady?.();
    await global.SMTN170Auth?.init?.();
    const { data } = await global.SMTN170Firebase?.getSession?.() || {};
    return data?.session?.user?.id || global.SMTN170Auth?.actorId?.() || null;
  }

  async function fetchLinks() {
    const sb = getClient();
    if (!sb) return { waiting: true, rows: [] };
    const { data, error } = await sb
      .from("resource_links")
      .select("id, title, category, url, notes, last_reviewed_at, created_at, updated_at, created_by, updated_by, visibility");
    if (error) {
      console.error("[resource-links]", formatError(error));
      return { error: formatError(error), rows: [] };
    }
    const rows = (data || []).slice().sort((a, b) => {
      const cat = (a.category || "").localeCompare(b.category || "");
      if (cat !== 0) return cat;
      return (a.title || "").localeCompare(b.title || "");
    });
    return { rows: rows };
  }

  async function saveLink(payload) {
    const sb = getClient();
    const uid = await ensureAuth();
    if (!sb || !uid) throw new Error("Sign in to save resource links.");
    const now = new Date().toISOString();
    const row = {
      title: payload.title.trim(),
      category: payload.category,
      url: payload.url.trim(),
      notes: payload.notes?.trim() || "",
      visibility: "senior_members",
      updated_by: uid,
      updated_at: now,
    };
    if (payload.last_reviewed_at) row.last_reviewed_at = payload.last_reviewed_at;
    else row.last_reviewed_at = null;

    if (payload.id) {
      const { error } = await sb.from("resource_links").update(row).eq("id", payload.id);
      if (error) throw new Error(formatError(error));
      return;
    }

    row.created_by = uid;
    row.created_at = now;
    const { error } = await sb.from("resource_links").insert(row);
    if (error) throw new Error(formatError(error));
  }

  async function deleteLink(id) {
    const sb = getClient();
    if (!global.SMTN170Auth?.isAdmin?.()) throw new Error("Only admins can delete resource links.");
    if (!sb) throw new Error("Sign in to delete resource links.");
    const { error } = await sb.from("resource_links").delete().eq("id", id);
    if (error) throw new Error(formatError(error));
  }

  function linksByCategory(rows) {
    const grouped = {};
    CATEGORIES.forEach((c) => {
      grouped[c] = [];
    });
    (rows || []).forEach((link) => {
      const cat = link.category || "Forms";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(link);
    });
    return grouped;
  }

  function renderLinkItem(link) {
    const reviewed = link.last_reviewed_at
      ? `<span class="rl-meta">Reviewed ${escapeHtml(formatDate(link.last_reviewed_at))}</span>`
      : "";
    const notes = link.notes ? `<p class="rl-notes">${escapeHtml(link.notes)}</p>` : "";
    const adminDelete = global.SMTN170Auth?.isAdmin?.()
      ? `<button type="button" class="ghost-btn btn-sm" data-rl-delete="${escapeHtml(link.id)}">Delete</button>`
      : "";
    return `<li class="rl-item">
      <div class="rl-item-main">
        <a href="${escapeHtml(link.url)}" class="rl-link" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>
        ${reviewed}
        ${notes}
      </div>
      <div class="rl-item-actions">
        <button type="button" class="ghost-btn btn-sm" data-rl-edit="${escapeHtml(link.id)}">Edit</button>
        ${adminDelete}
      </div>
    </li>`;
  }

  function renderSection(category, items) {
    const body = items.length
      ? `<ul class="rl-list">${items.map(renderLinkItem).join("")}</ul>`
      : `<p class="dash-empty">No file links have been added yet.</p>`;
    return `<section class="card-info rl-section" aria-labelledby="rl-${escapeHtml(category.replace(/\s+/g, "-"))}">
      <h2 class="card-info-title" id="rl-${escapeHtml(category.replace(/\s+/g, "-"))}">${escapeHtml(category)}</h2>
      ${body}
    </section>`;
  }

  function renderForm(link) {
    const isEdit = !!link?.id;
    const categoryOptions = CATEGORIES.map(
      (c) => `<option value="${escapeHtml(c)}"${link?.category === c ? " selected" : ""}>${escapeHtml(c)}</option>`
    ).join("");
    return `<form id="resourceLinkForm" class="card-info rl-form">
      <h2 class="card-info-title">${isEdit ? "Edit resource link" : "Add resource link"}</h2>
      <label for="rlTitle">Title</label>
      <input id="rlTitle" name="title" required value="${escapeHtml(link?.title || "")}" />
      <label for="rlCategory">Category</label>
      <select id="rlCategory" name="category" required>${categoryOptions}</select>
      <label for="rlUrl">URL</label>
      <input id="rlUrl" name="url" type="url" required placeholder="https://…" value="${escapeHtml(link?.url || "")}" />
      <label for="rlNotes">Notes <span class="profile-optional">(optional)</span></label>
      <textarea id="rlNotes" name="notes" rows="3" placeholder="Brief description or context">${escapeHtml(link?.notes || "")}</textarea>
      <label for="rlReviewed">Last reviewed date <span class="profile-optional">(optional)</span></label>
      <input id="rlReviewed" name="last_reviewed_at" type="date" value="${escapeHtml((link?.last_reviewed_at || "").slice(0, 10))}" />
      <div class="rl-form-actions">
        <button type="submit" class="btn-gold">${isEdit ? "Save changes" : "Save link"}</button>
        <button type="button" class="btn-outline" id="rlCancelForm">Cancel</button>
      </div>
    </form>`;
  }

  function renderPage() {
    const root = document.getElementById("resourceLinksRoot");
    if (!root) return;

    const grouped = linksByCategory(links);
    const sections = CATEGORIES.map((cat) => renderSection(cat, grouped[cat] || [])).join("");
    const formBlock = showForm ? renderForm(editingId ? links.find((l) => l.id === editingId) : null) : "";

    root.innerHTML = `
      <p class="page-intro">Curated links to squadron documents and reference materials. Add links to Google Drive, SharePoint, CAP publications, or other hosted files.</p>
      <p class="page-intro rl-drive-note"><em>Google Drive integration may be added later.</em></p>
      <div class="rl-toolbar">
        <button type="button" class="btn-gold" id="rlAddBtn">Add resource link</button>
      </div>
      ${formBlock}
      <div class="rl-sections">${sections}</div>`;

    bindEvents(root);
  }

  function bindEvents(root) {
    root.querySelector("#rlAddBtn")?.addEventListener("click", () => {
      editingId = null;
      showForm = true;
      renderPage();
      root.querySelector("#rlTitle")?.focus();
    });

    root.querySelector("#rlCancelForm")?.addEventListener("click", () => {
      editingId = null;
      showForm = false;
      renderPage();
    });

    root.querySelector("#resourceLinkForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        await saveLink({
          id: editingId || undefined,
          title: form.querySelector("#rlTitle")?.value || "",
          category: form.querySelector("#rlCategory")?.value || CATEGORIES[0],
          url: form.querySelector("#rlUrl")?.value || "",
          notes: form.querySelector("#rlNotes")?.value || "",
          last_reviewed_at: form.querySelector("#rlReviewed")?.value || null,
        });
        editingId = null;
        showForm = false;
        await loadAndRender();
      } catch (err) {
        alert(err.message || "Could not save resource link.");
      }
    });

    root.querySelectorAll("[data-rl-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingId = btn.dataset.rlEdit;
        showForm = true;
        renderPage();
        root.querySelector("#rlTitle")?.focus();
      });
    });

    root.querySelectorAll("[data-rl-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this resource link?")) return;
        try {
          await deleteLink(btn.dataset.rlDelete);
          await loadAndRender();
        } catch (err) {
          alert(err.message || "Could not delete resource link.");
        }
      });
    });
  }

  async function loadAndRender() {
    const root = document.getElementById("resourceLinksRoot");
    if (!root) return;

    const res = await fetchLinks();
    if (res.waiting) {
      root.innerHTML = `<p class="page-intro">Loading resources…</p>`;
      return;
    }
    if (res.error) {
      root.innerHTML = `<article class="card-warning dash-block" role="alert">
        <h2 class="card-warning-title">Could not load resource links</h2>
        <p>${escapeHtml(res.error)}</p>
      </article>
      <button type="button" class="btn-gold" id="rlAddBtn">Add resource link</button>`;
      root.querySelector("#rlAddBtn")?.addEventListener("click", () => {
        showForm = true;
        links = [];
        renderPage();
      });
      return;
    }

    links = res.rows || [];
    renderPage();
  }

  async function init() {
    await ensureAuth();
    await loadAndRender();
    global.SMTN170Pages?.injectStewardContexts?.();
    global.SMTN170Pages?.bindStewardContextActions?.();
    global.SMTN170StewardLauncher?.rebind?.();
    global.SMTN170Firebase?.subscribeTable?.("resource_links", null, () => {
      loadAndRender().catch((e) => console.warn("[resource-links]", e));
    });
  }

  global.SMTN170ResourceLinks = { init, loadAndRender, CATEGORIES };
})(window);
