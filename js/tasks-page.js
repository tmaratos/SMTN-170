/**
 * TN-170 portal tasks — public.portal_tasks
 */
(function initTasksPage(global) {
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function injectStyles() {
    if (document.getElementById("tasksPageStyleTag")) return;
    const style = document.createElement("style");
    style.id = "tasksPageStyleTag";
    style.textContent = `
      .task-delete-btn {
        background: transparent; border: 1px solid #fecaca;
        color: #b91c1c; border-radius: 8px; padding: 4px 10px;
        font-size: 0.8rem; font-weight: 600; cursor: pointer;
        margin-left: 6px;
      }
      .task-delete-btn:hover { background: #fef2f2; border-color: #fca5a5; }
    `;
    document.head.appendChild(style);
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

  function getClient() {
    return global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
  }

  function formatFirebaseError(error) {
    if (!error) return "Unknown error";
    const parts = [error.message || String(error)];
    if (error.code) parts.push(`Code: ${error.code}`);
    if (error.details) parts.push(`Details: ${error.details}`);
    if (error.hint) parts.push(`Hint: ${error.hint}`);
    return parts.join(" · ");
  }

  async function ensureClient() {
    if (global.TN170AuthGuard?.waitForFirebase) {
      await global.TN170AuthGuard.waitForFirebase();
    }
    await global.SMTN170Auth?.init?.();
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) console.error("[tasks] session", formatFirebaseError(error));
    if (!data?.session) return null;
    return sb;
  }

  async function fetchTasks() {
    const sb = await ensureClient();
    if (!sb) return { waiting: true, rows: [] };
    const { data, error } = await sb
      .from("portal_tasks")
      .select("id, title, description, status, due_date, priority, category, created_at, updated_at, created_by")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) {
      const msg = formatFirebaseError(error);
      console.error("[tasks] portal_tasks", msg, error);
      return { error: msg, rows: [] };
    }
    return { rows: data || [] };
  }

  async function deleteTask(id) {
    const sb = getClient();
    if (!sb) throw new Error("Sign in to delete tasks.");
    const { error } = await sb.from("portal_tasks").delete().eq("id", id);
    if (error) throw new Error(error.message || String(error));
  }

  function canDeleteTask(task) {
    if (global.SMTN170Auth?.isAdmin?.()) return true;
    const myId = global.SMTN170Auth?.actorId?.();
    return !!(myId && task?.created_by && task.created_by === myId);
  }

  async function addTask(title, dueDate) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to add tasks.");
    const now = new Date().toISOString();
    const { error } = await sb.from("portal_tasks").insert({
      title: title.trim(),
      status: "open",
      due_date: dueDate || null,
      created_by: uid,
      updated_by: uid,
      last_worked_by: uid,
      last_worked_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async function updateTaskStatus(id, status) {
    const sb = getClient();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !uid) throw new Error("Sign in to update tasks.");
    const { error } = await sb
      .from("portal_tasks")
      .update({
        status,
        updated_by: uid,
        last_worked_by: uid,
        last_worked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async function render() {
    const root = document.getElementById("tasksMain");
    if (!root) return;

    const res = await fetchTasks();

    if (res.waiting) {
      root.innerHTML = `<p class="page-intro">Loading tasks…</p>`;
      return;
    }

    if (res.error) {
      root.innerHTML = `<article class="card-warning dash-block" role="alert">
        <h2 class="card-warning-title">Could not load tasks</h2>
        <p>${escapeHtml(res.error)}</p>
      </article>
      <button type="button" class="btn-gold" data-steward-open style="margin-top:16px">Open Steward</button>`;
      global.SMTN170StewardLauncher?.rebind?.();
      return;
    }

    const open = (res.rows || []).filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const done = (res.rows || []).filter((t) => t.status === "completed");

    const list = (rows, emptyMsg) =>
      rows.length
        ? `<ul class="dash-due-list">${rows
            .map(
              (t) => `<li class="dash-due-item">${statusChip(t.status)}<span><strong>${escapeHtml(t.title)}</strong>${t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}</span>
              ${t.status !== "completed" ? `<button type="button" class="ghost-btn btn-sm" data-task-complete="${escapeHtml(t.id)}">Mark complete</button>` : ""}
              ${canDeleteTask(t) ? `<button type="button" class="task-delete-btn btn-sm" data-task-delete="${escapeHtml(t.id)}" title="Delete this task">Delete</button>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="dash-empty">${escapeHtml(emptyMsg)}</p>`;

    if (!res.rows.length) {
      root.innerHTML = `
        <p class="page-intro">Squadron tasks and follow-ups for approved Senior Members.</p>
        <article class="card-info dash-block"><h2>No tasks yet</h2><p>No tasks saved yet.</p></article>
        ${renderAddForm()}
        <button type="button" class="btn-gold" data-steward-open style="margin-top:12px">Open Steward</button>`;
      bindTaskEvents(root);
      global.SMTN170StewardLauncher?.rebind?.();
      return;
    }

    root.innerHTML = `
      <p class="page-intro">Squadron tasks for approved Senior Members.</p>
      ${renderAddForm()}
      <div class="card-warning dash-block">
        <h2 class="card-warning-title">Open (${open.length})</h2>
        ${list(open, "No open tasks.")}
      </div>
      <div class="card-info dash-block">
        <h2 class="card-info-title">Completed (${done.length})</h2>
        ${list(done.slice(0, 10), "No completed tasks yet.")}
      </div>
      <button type="button" class="btn-gold" data-steward-open>Create or manage tasks in Steward</button>`;

    bindTaskEvents(root);
    global.SMTN170StewardLauncher?.rebind?.();
  }

  function renderAddForm() {
    return `<form id="taskAddForm" class="card-info" style="margin-bottom:16px">
      <h3 class="card-info-title">Add task</h3>
      <label for="taskNewTitle">Title</label>
      <input id="taskNewTitle" name="title" required />
      <label for="taskNewDue">Due date (optional)</label>
      <input id="taskNewDue" name="due_date" type="date" />
      <button type="submit" class="btn-gold" style="margin-top:12px">Save task</button>
    </form>`;
  }

  function bindTaskEvents(root) {
    root.querySelector("#taskAddForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = e.target.querySelector("#taskNewTitle")?.value || "";
      const due = e.target.querySelector("#taskNewDue")?.value || "";
      try {
        await addTask(title, due);
        await render();
      } catch (err) {
        alert(err.message);
      }
    });
    root.querySelectorAll("[data-task-complete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await updateTaskStatus(btn.dataset.taskComplete, "completed");
          await render();
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll("[data-task-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.taskDelete;
        const title = btn.closest(".dash-due-item")?.querySelector("strong")?.textContent || "this task";
        if (!confirm(`Delete task "${title}"? This cannot be undone.`)) return;
        try {
          await deleteTask(id);
          await render();
        } catch (err) {
          alert("Could not delete: " + (err.message || String(err)));
        }
      });
    });
  }

  async function init() {
    injectStyles();
    await global.SMTN170Auth?.init?.();
    await render();
  }

  global.SMTN170TasksPage = { init, render };

  global.addEventListener("smtn170:auth-ready", () => {
    if (document.getElementById("tasksMain")) init();
  });
})(window);
