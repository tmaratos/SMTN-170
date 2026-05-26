/**
 * TN-170 Organization Chart — squadron staff structure (Firestore orgPositions).
 * All approved Senior Members may view and update; audit via last_worked_by.
 */
(function initOrgChartModule(global) {
  const STORAGE_KEY = "smtn170_org_positions";

  const STATUS = {
    FILLED: "filled",
    VACANT: "vacant",
    ACTING: "acting",
  };

  const STATUS_LABEL = {
    filled: "Filled",
    vacant: "Vacant",
    acting: "Acting",
  };

  const DEPARTMENTS = [
    "Command",
    "Operations",
    "Aerospace Education",
    "Cadet Programs",
    "Emergency Services",
    "Safety",
    "Communications",
    "Logistics",
    "Administration",
    "Finance",
    "IT",
  ];

  const FIRESTORE = {
    table: "org_positions",
    connected() {
      return !!global.SMTN170Firebase?.isConfigured?.();
    },
    async fetchPositions() {
      const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
      if (!sb) return null;
      const { data, error } = await sb.from("org_positions").select("*").order("sort_order");
      if (error) {
        console.warn("[org]", error.message);
        return null;
      }
      return (data || []).map(fromDbRow);
    },
    async upsertPosition(row) {
      const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
      if (!sb) return { ok: false, reason: "not_connected" };
      const payload = toDbRow(row);
      const uid = global.SMTN170Auth?.actorId?.();
      if (!payload.created_by && uid) payload.created_by = uid;
      const { data, error } = await sb.from("org_positions").upsert(payload).select().single();
      return error ? { ok: false, reason: error.message } : { ok: true, data };
    },
    async deletePosition(id) {
      const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
      if (!sb) return { ok: false, reason: "not_connected" };
      const { error } = await sb.from("org_positions").delete().eq("id", id);
      return error ? { ok: false, reason: error.message } : { ok: true };
    },
    async saveSnapshot(_label) {
      return { ok: false, reason: "snapshots_planned" };
    },
  };

  function fromDbRow(r) {
    return {
      id: r.id,
      title: r.title,
      department: r.department,
      parent_id: r.parent_id,
      sort_order: r.sort_order,
      assigned_member_name: r.assigned_member_name || "",
      status: r.status,
      is_command: r.is_command,
      responsibilities: r.responsibilities || "",
      notes: r.notes || "",
      last_worked_at: r.last_worked_at,
      updated_at: r.updated_at,
      last_worked_by_name: r.last_worked_by_name,
    };
  }

  function toDbRow(p) {
    const uid = global.SMTN170Auth?.actorId?.();
    return {
      id: p.id,
      title: p.title,
      department: p.department,
      parent_id: p.parent_id,
      sort_order: p.sort_order,
      assigned_member_name: p.assigned_member_name,
      status: p.status,
      is_command: p.is_command,
      responsibilities: p.responsibilities,
      notes: p.notes,
      updated_at: p.updated_at || new Date().toISOString(),
      last_worked_at: p.last_worked_at,
      last_worked_by: uid,
      updated_by: uid,
    };
  }

  let state = {
    departmentFilter: "all",
    searchQuery: "",
    vacanciesOnly: false,
    expandedDepts: new Set(DEPARTMENTS),
    editingId: null,
    showEditor: false,
  };

  function uid() {
    return global.crypto?.randomUUID?.() || "org-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function actorName() {
    return global.SMTN170Auth?.actorDisplay?.() || "Member";
  }

  function touchAudit(pos) {
    const now = new Date().toISOString();
    pos.last_worked_by_name = actorName();
    pos.last_worked_at = now;
    pos.updated_at = now;
    pos.updated_by_name = pos.last_worked_by_name;
  }

  function defaultPositions() {
    const cmd = uid();
    const dcpCadet = uid();
    const dcpSenior = uid();
    const now = "2026-05-18T14:00:00Z";
    return [
      {
        id: cmd,
        title: "Commander",
        department: "Command",
        parent_id: null,
        sort_order: 1,
        assigned_member_name: "Lt Col R. Grant",
        status: STATUS.FILLED,
        is_command: true,
        responsibilities: "Overall squadron leadership, wing liaison, and commander's intent.",
        notes: "",
        last_worked_by_name: "Capt. M. Ellis",
        last_worked_at: now,
        updated_at: now,
      },
      {
        id: dcpCadet,
        title: "Deputy Commander for Cadets",
        department: "Command",
        parent_id: cmd,
        sort_order: 2,
        assigned_member_name: "Maj K. Shaw",
        status: STATUS.ACTING,
        is_command: true,
        responsibilities: "Cadet program oversight, cadet staff supervision, and cadet meeting support.",
        notes: "Acting while permanent DCP completes training.",
        last_worked_by_name: "Maj K. Shaw",
        last_worked_at: "2026-05-12T10:00:00Z",
        updated_at: "2026-05-12T10:00:00Z",
      },
      {
        id: dcpSenior,
        title: "Deputy Commander for Seniors",
        department: "Command",
        parent_id: cmd,
        sort_order: 3,
        assigned_member_name: "",
        status: STATUS.VACANT,
        is_command: true,
        responsibilities: "Senior member program, professional development, and senior staff coordination.",
        notes: "Recruiting — wing has approved billet.",
        last_worked_by_name: "Capt. M. Ellis",
        last_worked_at: "2026-05-10T09:30:00Z",
        updated_at: "2026-05-10T09:30:00Z",
      },
      {
        id: uid(),
        title: "Operations Officer",
        department: "Operations",
        parent_id: cmd,
        sort_order: 10,
        assigned_member_name: "Capt. M. Ellis",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Operations training, mission base coordination, and weekly ops brief.",
        notes: "",
        last_worked_by_name: "Capt. M. Ellis",
        last_worked_at: now,
        updated_at: now,
      },
      {
        id: uid(),
        title: "Aerospace Education Officer",
        department: "Aerospace Education",
        parent_id: cmd,
        sort_order: 20,
        assigned_member_name: "1st Lt J. Reed",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "AEX, STEM nights, and AE training blocks.",
        notes: "",
        last_worked_by_name: "1st Lt J. Reed",
        last_worked_at: "2026-05-08T16:00:00Z",
        updated_at: "2026-05-08T16:00:00Z",
      },
      {
        id: uid(),
        title: "Cadet Programs Officer",
        department: "Cadet Programs",
        parent_id: dcpCadet,
        sort_order: 30,
        assigned_member_name: "2d Lt P. Harmon",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Weekly meeting plan, cadet activities, and Great Start mentoring.",
        notes: "",
        last_worked_by_name: "2d Lt P. Harmon",
        last_worked_at: "2026-05-15T11:00:00Z",
        updated_at: "2026-05-15T11:00:00Z",
      },
      {
        id: uid(),
        title: "Emergency Services Officer",
        department: "Emergency Services",
        parent_id: cmd,
        sort_order: 40,
        assigned_member_name: "Capt. R. Delgado",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "ES training, mission qualifications, and GTM currency.",
        notes: "",
        last_worked_by_name: "Capt. R. Delgado",
        last_worked_at: "2026-05-14T08:00:00Z",
        updated_at: "2026-05-14T08:00:00Z",
      },
      {
        id: uid(),
        title: "Safety Officer",
        department: "Safety",
        parent_id: cmd,
        sort_order: 50,
        assigned_member_name: "Maj K. Shaw",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Safety briefings, risk management, and mishap reporting.",
        notes: "Dual-hatted with DCP-Cadets.",
        last_worked_by_name: "Maj K. Shaw",
        last_worked_at: "2026-05-11T19:00:00Z",
        updated_at: "2026-05-11T19:00:00Z",
      },
      {
        id: uid(),
        title: "Communications Officer",
        department: "Communications",
        parent_id: cmd,
        sort_order: 60,
        assigned_member_name: "",
        status: STATUS.VACANT,
        is_command: false,
        responsibilities: "Radio plan, equipment inventory, and comms training.",
        notes: "Vacant — interim coverage by Operations.",
        last_worked_by_name: "Capt. M. Ellis",
        last_worked_at: "2026-05-07T12:00:00Z",
        updated_at: "2026-05-07T12:00:00Z",
      },
      {
        id: uid(),
        title: "Logistics Officer",
        department: "Logistics",
        parent_id: cmd,
        sort_order: 70,
        assigned_member_name: "TSgt L. Morris",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Supply, vehicles, and facility support.",
        notes: "",
        last_worked_by_name: "TSgt L. Morris",
        last_worked_at: "2026-05-09T13:30:00Z",
        updated_at: "2026-05-09T13:30:00Z",
      },
      {
        id: uid(),
        title: "Administrative Officer",
        department: "Administration",
        parent_id: cmd,
        sort_order: 80,
        assigned_member_name: "1st Lt A. Chen",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Records, meeting minutes, and squadron correspondence.",
        notes: "",
        last_worked_by_name: "1st Lt A. Chen",
        last_worked_at: "2026-05-16T09:00:00Z",
        updated_at: "2026-05-16T09:00:00Z",
      },
      {
        id: uid(),
        title: "Finance Officer",
        department: "Finance",
        parent_id: cmd,
        sort_order: 90,
        assigned_member_name: "",
        status: STATUS.VACANT,
        is_command: false,
        responsibilities: "Squadron budget, fundraising, and financial reporting.",
        notes: "Seeking senior member with finance background.",
        last_worked_by_name: "Lt Col R. Grant",
        last_worked_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
      },
      {
        id: uid(),
        title: "Assistant Operations Officer",
        department: "Operations",
        parent_id: null,
        sort_order: 11,
        assigned_member_name: "2d Lt S. Park",
        status: STATUS.FILLED,
        is_command: false,
        responsibilities: "Supports ops training nights and vehicle checks.",
        notes: "",
        last_worked_by_name: "2d Lt S. Park",
        last_worked_at: "2026-05-13T15:00:00Z",
        updated_at: "2026-05-13T15:00:00Z",
      },
    ];
  }

  async function loadAsync() {
    const fromDb = await FIRESTORE.fetchPositions();
    return { positions: fromDb || [], source: fromDb?.length ? "firestore" : "empty" };
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.positions)) return data;
      } catch {
        /* reset */
      }
    }
    return { positions: [], updatedAt: new Date().toISOString() };
  }

  function save(data) {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Future: debounced FIRESTORE.upsertPosition per row
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function statusChip(status) {
    const cls =
      status === STATUS.VACANT
        ? "org-status--vacant"
        : status === STATUS.ACTING
          ? "org-status--acting"
          : "org-status--filled";
    return `<span class="status-chip org-status-chip ${cls}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`;
  }

  function matchesFilters(pos) {
    if (state.vacanciesOnly && pos.status !== STATUS.VACANT) return false;
    if (state.departmentFilter !== "all" && pos.department !== state.departmentFilter) return false;
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (pos.title || "").toLowerCase().includes(q) ||
      (pos.assigned_member_name || "").toLowerCase().includes(q) ||
      (pos.department || "").toLowerCase().includes(q) ||
      (pos.responsibilities || "").toLowerCase().includes(q)
    );
  }

  function getMetrics(positions) {
    const visible = positions.filter(matchesFilters);
    const vacant = positions.filter((p) => p.status === STATUS.VACANT).length;
    const acting = positions.filter((p) => p.status === STATUS.ACTING).length;
    const filled = positions.filter((p) => p.status === STATUS.FILLED).length;
    return { visible: visible.length, total: positions.length, vacant, acting, filled };
  }

  function childrenOf(positions, parentId) {
    return positions
      .filter((p) => p.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  function renderPositionCard(pos) {
    const member =
      pos.status === STATUS.VACANT || !pos.assigned_member_name
        ? '<span class="org-member org-member--vacant">Vacant — assign a member</span>'
        : `<span class="org-member">${escapeHtml(pos.assigned_member_name)}</span>`;
    const cmdClass = pos.is_command ? " org-card--command" : "";
    const vacantClass = pos.status === STATUS.VACANT ? " org-card--vacant" : "";
    const audit = global.SMTN170Auth?.renderAuditHtml?.(pos) || "";

    return `
      <article class="org-card${cmdClass}${vacantClass}" data-org-id="${escapeHtml(pos.id)}" draggable="false" data-org-draggable-placeholder>
        <div class="org-card-head">
          <h4 class="org-card-title">${escapeHtml(pos.title)}</h4>
          ${statusChip(pos.status)}
        </div>
        ${member}
        <p class="org-card-dept">${escapeHtml(pos.department)}</p>
        <p class="org-card-updated"><small>Updated ${escapeHtml(formatWhen(pos.updated_at))}</small></p>
        ${audit}
        <button type="button" class="org-card-edit btn-primary-lg" data-action="edit-position" data-org-id="${escapeHtml(pos.id)}">Edit position</button>
      </article>`;
  }

  function renderTreeBranch(positions, parentId, depth) {
    const kids = childrenOf(positions, parentId).filter(matchesFilters);
    if (!kids.length) return "";
    return kids
      .map((pos) => {
        const subtree = renderTreeBranch(positions, pos.id, depth + 1);
        return `
          <li class="org-tree-node" data-depth="${depth}">
            <div class="org-tree-connector">
              ${renderPositionCard(pos)}
            </div>
            ${subtree ? `<ul class="org-tree-children">${subtree}</ul>` : ""}
          </li>`;
      })
      .join("");
  }

  function renderDepartmentSection(positions, dept) {
    const inDept = positions.filter((p) => p.department === dept && matchesFilters(p));
    if (!inDept.length) return "";

    const expanded = state.expandedDepts.has(dept);
    let body = "";

    if (dept === "Command") {
      const roots = inDept.filter((p) => {
        if (!p.parent_id) return true;
        const parent = positions.find((x) => x.id === p.parent_id);
        return !parent || parent.department !== dept;
      });
      roots.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      body = roots
        .map((root) => {
          const tree = renderTreeBranch(positions, root.id, 1);
          return `
          <li class="org-tree-node org-tree-node--root" data-depth="0">
            <div class="org-tree-connector">${renderPositionCard(root)}</div>
            ${tree ? `<ul class="org-tree-children">${tree}</ul>` : ""}
          </li>`;
        })
        .join("");
      body = `<ul class="org-tree org-tree--command">${body}</ul>`;
    } else {
      const sorted = [...inDept].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      body = `<ul class="org-tree-flat">${sorted.map((p) => `<li>${renderPositionCard(p)}</li>`).join("")}</ul>`;
    }

    return `
      <section class="org-dept-section" data-dept="${escapeHtml(dept)}">
        <button type="button" class="org-dept-toggle" data-action="toggle-dept" data-dept="${escapeHtml(dept)}" aria-expanded="${expanded}">
          <span class="org-dept-name">${escapeHtml(dept)}</span>
          <span class="org-dept-count">${inDept.length} position${inDept.length === 1 ? "" : "s"}</span>
          <span class="org-dept-chevron" aria-hidden="true">${expanded ? "▼" : "▶"}</span>
        </button>
        <div class="org-dept-body" ${expanded ? "" : 'hidden'}>
          ${body}
          <!-- Future: drag-and-drop reorder; parent_id updates via Supabase -->
        </div>
      </section>`;
  }

  function renderChart(positions) {
    if (!positions.length) {
      return `<div class="org-empty card-info"><h3>No organization chart positions have been created yet.</h3><p>Add your first position to build the squadron staff structure.</p><button type="button" class="btn-gold" data-action="add-position" style="margin-top:12px">Add position</button></div>`;
    }
    const depts =
      state.departmentFilter === "all"
        ? DEPARTMENTS
        : [state.departmentFilter];
    const sections = depts.map((d) => renderDepartmentSection(positions, d)).filter(Boolean).join("");
    if (!sections) {
      return `<div class="org-empty card-info"><h3>No positions match</h3><p>Try clearing filters or add a new position for this section.</p></div>`;
    }
    return `<div class="org-chart-display">${sections}</div>`;
  }

  function renderEditor(pos) {
    const isNew = !pos;
    const p = pos || {
      id: "",
      title: "",
      department: state.departmentFilter !== "all" ? state.departmentFilter : "Operations",
      parent_id: null,
      sort_order: 99,
      assigned_member_name: "",
      status: STATUS.VACANT,
      is_command: false,
      responsibilities: "",
      notes: "",
    };
    const deptOpts = DEPARTMENTS.map(
      (d) => `<option value="${escapeHtml(d)}" ${p.department === d ? "selected" : ""}>${escapeHtml(d)}</option>`
    ).join("");
    const statusOpts = Object.values(STATUS)
      .map((s) => `<option value="${s}" ${p.status === s ? "selected" : ""}>${escapeHtml(STATUS_LABEL[s])}</option>`)
      .join("");
    const positions = getChartData().positions || [];
    const parentOpts = `<option value="">— None —</option>${positions
      .filter((x) => x.id !== p.id)
      .map(
        (x) =>
          `<option value="${escapeHtml(x.id)}" ${p.parent_id === x.id ? "selected" : ""}>${escapeHtml(x.title)} (${escapeHtml(x.department)})</option>`
      )
      .join("")}`;

    return `
      <div class="org-modal-backdrop" id="orgModalBackdrop" data-action="close-editor"></div>
      <dialog class="org-modal" id="orgEditorModal" open>
        <form id="orgEditorForm" class="org-editor-form">
          <header class="org-modal-head">
            <h2>${isNew ? "Add position" : "Edit position"}</h2>
            <button type="button" class="portal-menu-close" data-action="close-editor" aria-label="Close">✕</button>
          </header>
          <input type="hidden" name="id" value="${escapeHtml(p.id)}" />
          <label for="orgTitle">Position title</label>
          <input id="orgTitle" name="title" required value="${escapeHtml(p.title)}" placeholder="e.g. Operations Officer" />
          <label for="orgMember">Assigned member</label>
          <input id="orgMember" name="assigned_member_name" value="${escapeHtml(p.assigned_member_name)}" placeholder="Rank and name, or leave blank if vacant" />
          <label for="orgDept">Department / section</label>
          <select id="orgDept" name="department">${deptOpts}</select>
          <label for="orgParent">Reports to (parent position)</label>
          <select id="orgParent" name="parent_id">${parentOpts}</select>
          <label for="orgStatus">Status</label>
          <select id="orgStatus" name="status">${statusOpts}</select>
          <label for="orgResp">Responsibilities</label>
          <textarea id="orgResp" name="responsibilities" rows="4" placeholder="Primary duties for this billet">${escapeHtml(p.responsibilities)}</textarea>
          <label for="orgNotes">Notes</label>
          <textarea id="orgNotes" name="notes" rows="2" placeholder="Acting notes, recruiting, dual-hat info">${escapeHtml(p.notes)}</textarea>
          <label class="org-check-label">
            <input type="checkbox" name="is_command" ${p.is_command ? "checked" : ""} />
            Command-level position (emphasized on chart)
          </label>
          <footer class="org-modal-foot">
            ${!isNew ? `<button type="button" class="ghost-btn btn-lg org-btn-danger" data-action="delete-position" data-org-id="${escapeHtml(p.id)}">Remove position</button>` : ""}
            <button type="button" class="ghost-btn btn-lg" data-action="close-editor">Cancel</button>
            <button type="submit" class="btn-gold btn-lg">${isNew ? "Add position" : "Save changes"}</button>
          </footer>
        </form>
      </dialog>`;
  }

  function exportChartPrint(data) {
    const positions = data.positions;
    const rows = positions
      .sort((a, b) => (a.department > b.department ? 1 : -1) || (a.sort_order - b.sort_order))
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.department)}</td><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.assigned_member_name || "Vacant")}</td><td>${escapeHtml(STATUS_LABEL[p.status])}</td><td>${escapeHtml(formatWhen(p.updated_at))}</td></tr>`
      )
      .join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      alert("Allow pop-ups to print the organization chart.");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TN-170 Organization Chart</title>
      <style>body{font-family:Georgia,serif;margin:24px;color:#111}h1{font-size:1.35rem}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #333;padding:10px;text-align:left}th{background:#e8eef8}.meta{color:#444;font-size:0.9rem}</style></head><body>
      <h1>TN-170 Oak Ridge Composite Squadron</h1>
      <p class="meta">Organization Chart · ${new Date().toLocaleString()} · TN-170 Senior Member operations portal</p>
      <table><thead><tr><th>Department</th><th>Position</th><th>Member</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="meta" style="margin-top:20px">TN-170 Organization Chart export.</p></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    // Future: FIRESTORE.saveSnapshot('print-' + Date.now())
  }

  /**
   * Open the standalone Org Chart print/PDF document view in a new tab.
   * The standalone page loads orgPositions from Firestore and auto-calls
   * window.print() so the user can save as PDF via the browser dialog.
   */
  function printOrgChart() {
    const url = "./orgchart-print.html";
    const w = global.open(url, "_blank", "noopener");
    if (!w) {
      alert("Allow pop-ups to open the organization chart print view.");
    }
  }

  /** Alias used by Steward and other modules. */
  function exportOrgChartPdf() {
    printOrgChart();
  }

  /**
   * Render the org chart "document view" HTML (for embedding/testing).
   * The actual print uses the standalone orgchart-print.html page.
   */
  function generateOrgChartDocumentView() {
    if (global.SMTN170OrgChartPrint?.renderDocument) {
      return global.SMTN170OrgChartPrint.renderDocument(getChartData().positions || []);
    }
    return "";
  }

  function openEditor(id) {
    const data = getChartData();
    const pos = id ? data.positions.find((p) => p.id === id) : null;
    state.editingId = id;
    state.showEditor = true;
    const host = document.getElementById("orgEditorHost");
    if (host) host.innerHTML = renderEditor(pos);
    document.getElementById("orgEditorModal")?.focus();
  }

  function closeEditor() {
    state.showEditor = false;
    state.editingId = null;
    const host = document.getElementById("orgEditorHost");
    if (host) host.innerHTML = "";
  }

  async function saveFromForm(form) {
    const data = getChartData();
    const fd = new FormData(form);
    const id = (fd.get("id") || "").toString() || uid();
    const existing = data.positions.find((p) => p.id === id);
    const assigned = (fd.get("assigned_member_name") || "").toString().trim();
    let status = (fd.get("status") || STATUS.VACANT).toString();
    if (!assigned && status === STATUS.FILLED) status = STATUS.VACANT;
    const parentVal = (fd.get("parent_id") || "").toString();
    const row = {
      id,
      title: (fd.get("title") || "").toString().trim(),
      department: (fd.get("department") || "Operations").toString(),
      parent_id: parentVal || existing?.parent_id || null,
      sort_order: existing?.sort_order ?? data.positions.length + 1,
      assigned_member_name: assigned,
      status,
      is_command: fd.get("is_command") === "on",
      responsibilities: (fd.get("responsibilities") || "").toString(),
      notes: (fd.get("notes") || "").toString(),
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: existing?.updated_at,
      last_worked_at: existing?.last_worked_at,
      last_worked_by_name: existing?.last_worked_by_name,
      updated_by_name: existing?.updated_by_name,
    };

    if (!row.title) {
      alert("Position title is required.");
      return;
    }

    touchAudit(row);
    if (existing) {
      Object.assign(existing, row);
    } else {
      row.created_by_name = actorName();
      data.positions.push(row);
    }

    if (FIRESTORE.connected()) {
      const result = await FIRESTORE.upsertPosition(row);
      if (!result.ok) {
        alert("Could not save position: " + result.reason);
        return;
      }
      if (result.data) Object.assign(row, fromDbRow(result.data));
    }

    setChartData(data);
    importNotice = "Position saved successfully.";
    closeEditor();
    render();
  }

  async function deletePosition(id) {
    if (!confirm("Remove this position from the squadron org chart?")) return;
    const data = getChartData();
    if (FIRESTORE.connected()) {
      const result = await FIRESTORE.deletePosition(id);
      if (!result.ok) {
        alert("Could not delete position: " + result.reason);
        return;
      }
    }
    data.positions = data.positions.filter((p) => p.id !== id);
    data.positions.forEach((p) => {
      if (p.parent_id === id) p.parent_id = null;
    });
    setChartData(data);
    importNotice = "Position removed.";
    closeEditor();
    render();
  }

  function render() {
    const root = document.getElementById("orgChartApp");
    if (!root) return;
    const data = getChartData();
    const m = getMetrics(data.positions);

    root.innerHTML = `
      ${importNotice ? `<div class="card-info org-notice" role="status">${escapeHtml(importNotice)}</div>` : ""}
      <header class="org-hero card-info">
        <div class="org-hero-text">
          <p class="org-hero-eyebrow">Squadron staff structure</p>
          <h2 class="org-hero-title">Organization Chart</h2>
          <p class="org-hero-sub">Manage squadron leadership, operational structure, and position assignments.</p>
        </div>
        <div class="org-hero-actions">
          <button type="button" class="btn-gold btn-lg" data-action="add-position">Add Position</button>
          <button type="button" class="btn-outline btn-lg" data-action="view-vacancies">View Vacancies (${m.vacant})</button>
          <button type="button" class="btn-outline btn-lg" data-action="print-org-chart" data-steward-action="print" data-steward-label="Print Org Chart" data-steward-help="Open the printable organization chart document">Print Org Chart</button>
          <button type="button" class="btn-outline btn-lg" data-action="export-org-chart-pdf" data-steward-action="export" data-steward-label="Export Org Chart PDF" data-steward-help="Open the print view and save as PDF">Export Org Chart PDF</button>
          <button type="button" class="btn-outline btn-lg" data-action="export-chart">Export Chart (table)</button>
          <button type="button" class="btn-outline btn-lg btn-steward-lg" data-steward-ask="Help me review vacant positions and staffing on the organization chart.">Ask Steward</button>
        </div>
        <div class="org-hero-stats">
          <span class="org-stat"><strong>${m.filled}</strong> Filled</span>
          <span class="org-stat org-stat--warn"><strong>${m.vacant}</strong> Vacant</span>
          <span class="org-stat"><strong>${m.acting}</strong> Acting</span>
          <span class="org-stat"><strong>${m.visible}</strong> Showing</span>
        </div>
      </header>

      <div class="org-workspace workspace-split">
        <aside class="org-sidebar workspace-col workspace-col--tools">
          <section class="workspace-panel card-info">
            <h3 class="workspace-panel-head">Departments</h3>
            <div class="org-filter-list" role="group" aria-label="Filter by department">
              <button type="button" class="org-filter-btn ${state.departmentFilter === "all" ? "active" : ""}" data-dept-filter="all">All sections</button>
              ${DEPARTMENTS.map(
                (d) =>
                  `<button type="button" class="org-filter-btn ${state.departmentFilter === d ? "active" : ""}" data-dept-filter="${escapeHtml(d)}">${escapeHtml(d)}</button>`
              ).join("")}
            </div>
          </section>
          <section class="workspace-panel card-info">
            <h3 class="workspace-panel-head">Find positions</h3>
            <label class="visually-hidden" for="orgSearch">Search positions</label>
            <input type="search" id="orgSearch" class="org-search-input" placeholder="Search title or member…" value="${escapeHtml(state.searchQuery)}" />
            <label class="org-toggle-vacant">
              <input type="checkbox" id="orgVacancyOnly" ${state.vacanciesOnly ? "checked" : ""} />
              Show vacancies only
            </label>
          </section>
          <div data-steward-context="orgchart"></div>
        </aside>
        <div class="org-main workspace-col">
          <div id="orgChartDisplay">${renderChart(data.positions)}</div>
        </div>
      </div>
      <div id="orgEditorHost"></div>`;

    bindEvents();
    global.SMTN170Pages?.injectStewardContexts?.();
    global.SMTN170Pages?.bindStewardContextActions?.();
    global.SMTN170StewardLauncher?.rebind?.();
  }

  function bindImportInput() {
    const importInput = document.getElementById("orgChartImportInput");
    if (!importInput || importInput.dataset.bound === "1") return;
    importInput.dataset.bound = "1";
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await importOrgChartFile(file);
        render();
      } catch (err) {
        alert(err.message || "Import failed");
      }
    });
  }

  function bindEvents() {
    const root = document.getElementById("orgChartApp");
    if (!root || root.dataset.eventsBound === "1") return;
    root.dataset.eventsBound = "1";

    root.addEventListener("click", (e) => {
      const filter = e.target.closest("[data-dept-filter]");
      if (filter) {
        state.departmentFilter = filter.dataset.deptFilter;
        render();
        return;
      }

      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "add-position") openEditor(null);
      if (action === "edit-position") openEditor(btn.dataset.orgId);
      if (action === "close-editor") closeEditor();
      if (action === "view-vacancies") {
        state.vacanciesOnly = !state.vacanciesOnly;
        render();
      }
      if (action === "export-chart") exportChartPrint(getChartData());
      if (action === "print-org-chart") printOrgChart();
      if (action === "export-org-chart-pdf") exportOrgChartPdf();
      if (action === "delete-position") deletePosition(btn.dataset.orgId);
      if (action === "toggle-dept") {
        const dept = btn.dataset.dept;
        if (state.expandedDepts.has(dept)) state.expandedDepts.delete(dept);
        else state.expandedDepts.add(dept);
        render();
      }
      if (action === "close-editor" && e.target.id === "orgModalBackdrop") closeEditor();
    });

    root.addEventListener("change", (e) => {
      if (e.target.id === "orgVacancyOnly") {
        state.vacanciesOnly = e.target.checked;
        render();
      }
    });

    root.addEventListener("input", (e) => {
      if (e.target.id === "orgSearch") {
        state.searchQuery = e.target.value;
        const display = document.getElementById("orgChartDisplay");
        if (display) display.innerHTML = renderChart(getChartData().positions);
      }
    });

    document.addEventListener("submit", (e) => {
      if (e.target.id === "orgEditorForm") {
        e.preventDefault();
        saveFromForm(e.target).catch((err) => alert(err.message || "Save failed"));
      }
    });

  }

  let chartData = { positions: [] };
  let importNotice = "";
  let importedFiles = [];
  let pendingIngest = null;

  function getChartData() {
    return chartData.positions?.length ? chartData : load();
  }

  function setChartData(data) {
    chartData = { positions: data.positions || [], updatedAt: new Date().toISOString() };
    save(chartData);
  }

  async function fetchImportedOrgCharts() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) return [];
    const { data, error } = await sb
      .from("uploaded_files")
      .select("*")
      .eq("folder", "org_chart")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      console.warn("[org] imports", error.message);
      return [];
    }
    return data || [];
  }

  /** Future: OCR / parsing pipeline for uploaded org charts. */
  function parseOrgChartUpload(fileRecord) {
    console.log("[org] parseOrgChartUpload (not implemented)", fileRecord?.id);
    return { ok: false, reason: "parsing_not_implemented" };
  }

  /** Future: draft org_positions rows from parsed upload. */
  function draftOrgPositionsFromUpload(fileRecord) {
    console.log("[org] draftOrgPositionsFromUpload (not implemented)", fileRecord?.id);
    return { ok: false, reason: "draft_not_implemented" };
  }

  function renderDraftReviewPanel() {
    if (!pendingIngest?.drafts?.length) return "";
    const rows = pendingIngest.drafts
      .map(
        (d, i) => `
      <div class="org-draft-row" data-draft-idx="${i}">
        <strong>${escapeHtml(d.title)}</strong>
        <span>${escapeHtml(d.department)}</span>
        <span>${escapeHtml(d.assigned_member_name || "Vacant")}</span>
        <button type="button" class="ghost-btn btn-sm" data-draft-action="approve" data-idx="${i}">Approve</button>
        <button type="button" class="ghost-btn btn-sm" data-draft-action="discard" data-idx="${i}">Discard</button>
      </div>`
      )
      .join("");
    return `<section class="org-draft-panel ingest-review-panel card-info">
      <h3>Draft positions from import</h3>
      <p class="page-intro">${escapeHtml(pendingIngest.message || "")}</p>
      ${rows}
      <button type="button" class="btn-gold" data-action="approve-all-drafts">Approve all positions</button>
      <button type="button" class="btn-outline" data-action="discard-all-drafts">Discard all</button>
      <button type="button" class="btn-outline btn-steward-lg" data-steward-ask="Help draft organization chart positions from the uploaded org chart.">Ask Steward</button>
    </section>`;
  }

  async function importOrgChartFile(file) {
    if (!global.SMTN170FileIngestion?.uploadAndIngest) {
      throw new Error("File ingestion module not loaded.");
    }
    const result = await global.SMTN170FileIngestion.uploadAndIngest(file, {
      category: "org_chart",
      folder: "org_chart",
    });
    importedFiles = await fetchImportedOrgCharts();
    importNotice = result.message || "Org chart uploaded.";
    pendingIngest = result.needsReview ? result : null;
    if (result.needsReview && result.drafts?.length) {
      state.draftPositions = result.drafts;
    }
    return result;
  }

  async function approveDraftPosition(idx) {
    if (!pendingIngest?.drafts?.[idx]) return;
    const one = pendingIngest.drafts[idx];
    await global.SMTN170FileIngestion.saveDraftOrgPositions([one]);
    pendingIngest.drafts.splice(idx, 1);
    if (!pendingIngest.drafts.length) pendingIngest = null;
    await hydrateFromFirestore();
    importNotice = "Position saved to organization chart.";
    render();
  }

  async function discardDraftPosition(idx) {
    if (!pendingIngest?.drafts) return;
    pendingIngest.drafts.splice(idx, 1);
    if (!pendingIngest.drafts.length) pendingIngest = null;
    render();
  }

  async function hydrateFromFirestore() {
    const fromDb = await FIRESTORE.fetchPositions();
    chartData = { positions: fromDb || [], source: fromDb?.length ? "firestore" : "empty" };
    if (chartData.positions.length) save(chartData);
  }

  async function init() {
    await global.SMTN170Auth?.init?.();
    await hydrateFromFirestore();
    render();
    global.SMTN170Firebase?.subscribeTable?.("org_positions", null, async () => {
      await hydrateFromFirestore();
      render();
    });
  }

  global.SMTN170OrgChart = {
    STORAGE_KEY,
    STATUS,
    DEPARTMENTS,
    FIRESTORE,
    load,
    save,
    render,
    init,
    openEditor,
    exportChartPrint,
    printOrgChart,
    exportOrgChartPdf,
    generateOrgChartDocumentView,
    hydrateFromFirestore,
    parseOrgChartUpload,
    draftOrgPositionsFromUpload,
    importOrgChartFile,
  };
})(window);
