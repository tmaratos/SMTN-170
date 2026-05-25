/**
 * TN-170 Inspection Prep — public.inspection_items
 */
(function initSuiReadiness(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function statusClass(status) {
    if (status === "completed") return "fr-status--current";
    if (status === "due_soon" || status === "needs_review") return "fr-status--due-soon";
    return "fr-status--scheduled";
  }

  function statusLabel(status) {
    const map = {
      open: "Open",
      due_soon: "Due soon",
      needs_review: "Needs review",
      completed: "Completed",
    };
    return map[status] || status || "Open";
  }

  function getClient() {
    return global.TN170SupabaseClient || global.SMTN170Supabase?.getClient?.();
  }

  function formatSupabaseError(error) {
    if (!error) return "Unknown error";
    const parts = [error.message || String(error)];
    if (error.code) parts.push(`Code: ${error.code}`);
    if (error.details) parts.push(`Details: ${error.details}`);
    if (error.hint) parts.push(`Hint: ${error.hint}`);
    return parts.join(" · ");
  }

  async function ensureClient() {
    if (global.TN170AuthGuard?.waitForSupabaseSdk) {
      await global.TN170AuthGuard.waitForSupabaseSdk();
    }
    await global.SMTN170Auth?.init?.();
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) console.error("[inspection] session", formatSupabaseError(error));
    if (!data?.session) return null;
    return sb;
  }

  async function fetchItems() {
    const sb = await ensureClient();
    if (!sb) return { rows: [], waiting: true };
    const { data, error } = await sb
      .from("inspection_items")
      .select("id, title, work_unit, status, due_date, notes, created_at, updated_at")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) {
      const msg = formatSupabaseError(error);
      console.error("[inspection] inspection_items", msg, error);
      return { rows: [], error: msg };
    }
    return { rows: data || [] };
  }

  async function addItem(title, workUnit, dueDate) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to add inspection items.");
    const now = new Date().toISOString();
    const { error } = await sb.from("inspection_items").insert({
      title: title.trim(),
      work_unit: workUnit || "General",
      status: "open",
      due_date: dueDate || null,
      created_by: uid,
      last_worked_by: uid,
      last_worked_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async function updateItemStatus(id, status) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to update inspection items.");
    const patch = {
      status,
      last_worked_by: uid,
      last_worked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await sb.from("inspection_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  function groupByWorkUnit(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const unit = r.work_unit || "General";
      if (!map.has(unit)) map.set(unit, []);
      map.get(unit).push(r);
    });
    return map;
  }

  function renderAddForm() {
    return `<form id="inspAddForm" class="card-info" style="margin-bottom:16px">
      <h3 class="card-info-title">Add inspection item</h3>
      <label for="inspNewTitle">Title</label>
      <input id="inspNewTitle" name="title" required />
      <label for="inspNewUnit">Work unit</label>
      <input id="inspNewUnit" name="work_unit" placeholder="General" />
      <label for="inspNewDue">Due date (optional)</label>
      <input id="inspNewDue" name="due_date" type="date" />
      <button type="submit" class="btn-gold" style="margin-top:12px">Save item</button>
    </form>`;
  }

  function bindInspEvents(root) {
    root.querySelector("#inspAddForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = e.target.querySelector("#inspNewTitle")?.value || "";
      const unit = e.target.querySelector("#inspNewUnit")?.value || "General";
      const due = e.target.querySelector("#inspNewDue")?.value || "";
      try {
        await addItem(title, unit, due);
        await render();
      } catch (err) {
        alert(err.message);
      }
    });
    root.querySelectorAll("[data-insp-complete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await updateItemStatus(btn.dataset.inspComplete, "completed");
          await render();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  async function render() {
    const root = document.getElementById("suiMain");
    const dash = document.getElementById("suiDashboardCard");
    const res = await fetchItems();

    const open = (res.rows || []).filter((r) => r.status !== "completed");
    const done = (res.rows || []).filter((r) => r.status === "completed");
    const percent = res.rows.length ? Math.round((done.length / res.rows.length) * 100) : 0;

    if (dash) {
      dash.innerHTML = `
        <div class="fr-dash-head">
          <div>
            <p class="kicker" style="margin:0 0 6px">Inspection prep</p>
            <h2 style="margin:0;font-size:1.35rem;text-transform:uppercase">Inspection Prep</h2>
          </div>
          <div class="fr-readiness-ring" aria-label="Inspection prep ${percent} percent complete">
            <strong>${percent}%</strong>
            <span>Complete</span>
          </div>
        </div>
        <div class="fr-dash-stats">
          <div><strong>${open.length}</strong><span>Open items</span></div>
          <div><strong>${done.length}</strong><span>Completed</span></div>
        </div>
        <div class="di-dash-actions">
          <a class="btn gold" href="sui-readiness.html">Inspection checklist</a>
        </div>`;
    }

    if (!root) return;

    if (res.waiting) {
      root.innerHTML = `<p class="page-intro">Loading inspection prep…</p>`;
      return;
    }

    if (res.error) {
      root.innerHTML = `<article class="card-warning dash-block" role="alert">
        <h2 class="card-warning-title">Could not load inspection items</h2>
        <p>${escapeHtml(res.error)}</p>
      </article>
      <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>`;
      global.SMTN170Steward?.rebind?.();
      return;
    }

    if (!res.rows.length) {
      root.innerHTML = `
        <article class="panel sui-hero card-info">
          <h2>Inspection Prep</h2>
          <p>No inspection checklist items have been created yet.</p>
        </article>
        ${renderAddForm()}
        <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>`;
      bindInspEvents(root);
      global.SMTN170Steward?.rebind?.();
      return;
    }

    const byUnit = groupByWorkUnit(res.rows);
    const unitCards = [...byUnit.entries()]
      .map(([unit, items]) => {
        const openCount = items.filter((i) => i.status !== "completed").length;
        const worst = items.find((i) => i.status === "due_soon" || i.status === "needs_review") || items[0];
        return `<article class="panel">
          <h3>${escapeHtml(unit)}</h3>
          <span class="fr-status-pill ${statusClass(worst?.status)}">${escapeHtml(statusLabel(worst?.status))}</span>
          <p class="sui-meta">${openCount} open · ${items.length} total item${items.length === 1 ? "" : "s"}</p>
        </article>`;
      })
      .join("");

    const checklist = res.rows
      .map(
        (c) =>
          `<li class="${c.status === "completed" ? "sui-check--done" : ""}">${c.status === "completed" ? "☑" : "☐"} ${escapeHtml(c.title)}${c.due_date ? ` <small>· due ${escapeHtml(c.due_date)}</small>` : ""}
          ${c.status !== "completed" ? `<button type="button" class="ghost-btn btn-sm" data-insp-complete="${escapeHtml(c.id)}">Mark complete</button>` : ""}</li>`
      )
      .join("");

    root.innerHTML = `
      <article class="panel sui-hero">
        <p class="kicker">Subordinate Unit Inspection</p>
        <h2>Inspection Prep</h2>
        <p>Track inspection prep by work unit — command, operations, emergency services, aerospace education, and safety.</p>
        <p class="sui-meta"><strong>${open.length}</strong> open · <strong>${percent}%</strong> complete</p>
      </article>
      ${renderAddForm()}
      <div class="sui-grid">${unitCards}</div>
      <article class="panel">
        <h2>Checklist</h2>
        <ul class="sui-checklist">${checklist}</ul>
      </article>
      <p class="page-intro">Supporting documents belong in <a href="documents.html">Files and forms</a>.</p>
      <button type="button" class="btn-gold" data-steward-open>Manage items in Steward</button>`;

    bindInspEvents(root);
    global.SMTN170Steward?.rebind?.();
  }

  async function init() {
    await global.SMTN170Auth?.init?.();
    await render();
  }

  global.SMTN170SuiReadiness = { fetchItems, render, init };

  global.addEventListener("smtn170:auth-ready", () => {
    if (document.getElementById("suiMain")) init();
  });

  if (document.getElementById("suiMain")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(window);
