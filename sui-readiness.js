/**
 * TN-170 Inspection Prep — inspection_items from Supabase.
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
    if (status === "overdue") return "fr-status--overdue";
    return "fr-status--scheduled";
  }

  function statusLabel(status) {
    const map = {
      open: "Open",
      due_soon: "Due soon",
      needs_review: "Needs review",
      completed: "Completed",
      overdue: "Overdue",
    };
    return map[status] || status || "Open";
  }

  async function fetchItems() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return { rows: [], error: null, configured: false };
    const { data, error } = await sb
      .from("inspection_items")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) return { rows: [], error: error.message, configured: true };
    return { rows: data || [], configured: true };
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

    if (!res.configured) {
      root.innerHTML = `<p class="page-intro">Sign in with Supabase configured to load inspection prep records.</p>`;
      return;
    }

    if (res.error) {
      root.innerHTML = `<p class="page-intro">Inspection items could not be loaded. Confirm <code>inspection_items</code> exists in Supabase (see steward-phase2-tables.sql).</p>
        <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>`;
      global.SMTN170Steward?.rebind?.();
      return;
    }

    if (!res.rows.length) {
      root.innerHTML = `
        <article class="panel sui-hero card-info">
          <h2>Inspection Prep</h2>
          <p>No inspection checklist items have been created yet.</p>
          <p>Add your first item with Steward or during squadron staff planning.</p>
          <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>
        </article>`;
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
          `<li class="${c.status === "completed" ? "sui-check--done" : ""}">${c.status === "completed" ? "☑" : "☐"} ${escapeHtml(c.title)}${c.due_date ? ` <small>· due ${escapeHtml(c.due_date)}</small>` : ""}</li>`
      )
      .join("");

    root.innerHTML = `
      <article class="panel sui-hero">
        <p class="kicker">Subordinate Unit Inspection</p>
        <h2>Inspection Prep</h2>
        <p>Track inspection prep by work unit — command, operations, emergency services, aerospace education, and safety.</p>
        <p class="sui-meta"><strong>${open.length}</strong> open · <strong>${percent}%</strong> complete</p>
      </article>
      <div class="sui-grid">${unitCards}</div>
      <article class="panel">
        <h2>Checklist</h2>
        <ul class="sui-checklist">${checklist}</ul>
      </article>
      <p class="page-intro">Supporting documents belong in <a href="documents.html">Files and forms</a>.</p>
      <button type="button" class="btn-gold" data-steward-open>Manage items in Steward</button>`;

    global.SMTN170Steward?.rebind?.();
  }

  global.SMTN170SuiReadiness = { fetchItems, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
