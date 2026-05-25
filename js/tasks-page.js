/**
 * TN-170 portal tasks — portal_tasks table (approved Senior Members).
 */
(function initTasksPage(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function formatDate(d) {
    if (!d) return "—";
    try {
      return new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return d;
    }
  }

  function statusChip(status) {
    const label = (status || "open").replace(/_/g, " ");
    return `<span class="status-chip chip--${status === "completed" ? "completed" : status === "due_soon" ? "due-soon" : "muted"}">${escapeHtml(label)}</span>`;
  }

  async function fetchTasks() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return null;
    const { data, error } = await sb
      .from("portal_tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) {
      console.warn("[tasks]", error.message);
      return { error: error.message };
    }
    return { rows: data || [] };
  }

  async function render() {
    const root = document.getElementById("tasksMain");
    if (!root) return;

    const intro = root.querySelector(".page-intro");
    const res = await fetchTasks();

    if (!global.SMTN170Supabase?.isConfigured?.()) {
      root.innerHTML = `<p class="page-intro">Connect Supabase to load shared squadron tasks.</p>`;
      return;
    }

    if (res?.error) {
      root.innerHTML = `<p class="page-intro">Tasks table is not available yet. Run steward-phase2-tables.sql in Supabase, or ask Steward to create a task.</p>
        <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>`;
      global.SMTN170Steward?.rebind?.();
      return;
    }

    const open = (res.rows || []).filter((t) => t.status !== "completed");
    const done = (res.rows || []).filter((t) => t.status === "completed");

    const list = (rows) =>
      rows.length
        ? `<ul class="dash-due-list">${rows
            .map(
              (t) => `<li class="dash-due-item">${statusChip(t.status)}<span><strong>${escapeHtml(t.title)}</strong>${t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}</span></li>`
            )
            .join("")}</ul>`
        : `<p class="dash-caught-up">None listed.</p>`;

    root.innerHTML = `
      ${intro ? intro.outerHTML : '<p class="page-intro">Squadron tasks for approved Senior Members.</p>'}
      <div class="card-warning dash-block">
        <h2 class="card-warning-title">Open (${open.length})</h2>
        ${list(open)}
      </div>
      <div class="card-info dash-block">
        <h2 class="card-info-title">Completed (${done.length})</h2>
        ${list(done.slice(0, 10))}
      </div>
      <button type="button" class="btn-gold" data-steward-open>Create or manage tasks in Steward</button>`;

    global.SMTN170Steward?.rebind?.();
  }

  function init() {
    render();
  }

  global.SMTN170TasksPage = { init, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
