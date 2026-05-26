/**
 * Biannual Flight Review Readiness — Firestore flight_reviews collection.
 */
(function initFlightReviewModule(global) {
  const STORAGE_KEY = "smtn170_flight_review";
  const CALENDAR_KEY = "smtn170_calendar_events";

  const STATUS = {
    CURRENT: "Current",
    DUE_SOON: "Due Soon",
    OVERDUE: "Overdue",
    SCHEDULED: "Scheduled",
    COMPLETED: "Completed",
  };

  const STATUS_CLASS = {
    Current: "fr-status--current",
    "Due Soon": "fr-status--due-soon",
    Overdue: "fr-status--overdue",
    Scheduled: "fr-status--scheduled",
    Completed: "fr-status--completed",
  };

  const DEFAULT_REQUIRED = [
    "Department activity summary",
    "Officer assignment roster",
    "Training plan / goals",
    "Safety compliance checklist",
    "Budget or resource notes (if applicable)",
    "Signed review acknowledgment",
  ];

  function uid() {
    return global.crypto?.randomUUID?.() || "fr-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = parseDate(value);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function daysUntil(value) {
    const d = parseDate(value);
    if (!d) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function computeStatus(dept, today) {
    if (dept.completionConfirmed && dept.status === STATUS.COMPLETED) return STATUS.COMPLETED;
    const due = parseDate(dept.nextReviewDueDate);
    const scheduled = parseDate(dept.scheduledReviewDate);
    if (scheduled && scheduled >= today) return STATUS.SCHEDULED;
    if (!due) return STATUS.CURRENT;
    const diff = daysUntil(dept.nextReviewDueDate);
    if (diff < 0) return STATUS.OVERDUE;
    if (diff <= 45) return STATUS.DUE_SOON;
    return STATUS.CURRENT;
  }

  function defaultDepartments() {
    const base = [
      {
        name: "Operations",
        lastReviewDate: "2025-11-12",
        nextReviewDueDate: "2026-11-12",
        assignedReviewer: "Maj. J. Whitmore",
        status: STATUS.CURRENT,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: ["Signed review acknowledgment"],
        uploadedFiles: [{ id: uid(), name: "Ops_Activity_Summary_Q4.pdf", uploadedAt: "2025-11-10" }],
        actionItems: [
          { id: uid(), text: "Update squadron SOP cross-reference", done: true },
          { id: uid(), text: "Confirm weekly meeting attendance targets", done: false },
        ],
        notes: "Strong continuity; next review can align with fall planning cycle.",
        followUpTasks: ["Brief commander on winter ops tempo"],
        completionConfirmed: false,
        scheduledReviewDate: null,
        last_worked_by_name: "Maj. J. Whitmore",
        last_worked_at: "2026-05-10T11:00:00Z",
      },
      {
        name: "Emergency Services",
        lastReviewDate: "2025-04-18",
        nextReviewDueDate: "2026-04-18",
        assignedReviewer: "Capt. R. Delgado",
        status: STATUS.DUE_SOON,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: ["Training plan / goals", "Signed review acknowledgment"],
        uploadedFiles: [{ id: uid(), name: "ES_Training_Log_2025.pdf", uploadedAt: "2026-03-02" }],
        actionItems: [
          { id: uid(), text: "Schedule GTM refresher for new members", done: false },
          { id: uid(), text: "Verify mission base contact list", done: true },
        ],
        notes: "Due within 45 days — prioritize missing training plan.",
        followUpTasks: ["Coordinate tabletop exercise date with Safety"],
        completionConfirmed: false,
        scheduledReviewDate: "2026-05-08",
        last_worked_by_name: "Capt. R. Delgado",
        last_worked_at: "2026-05-08T09:15:00Z",
      },
      {
        name: "Aerospace Education",
        lastReviewDate: "2024-10-05",
        nextReviewDueDate: "2026-04-05",
        assignedReviewer: "1st Lt. K. Nguyen",
        status: STATUS.OVERDUE,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: [
          "Department activity summary",
          "Officer assignment roster",
          "Signed review acknowledgment",
        ],
        uploadedFiles: [],
        actionItems: [
          { id: uid(), text: "Upload AEX progress report", done: false },
          { id: uid(), text: "Schedule STEM night alignment with Cadet Programs", done: false },
        ],
        notes: "Overdue — commander notified; packet prep required before next meeting.",
        followUpTasks: ["Book 30-min review block with Aerospace Education officer"],
        completionConfirmed: false,
        scheduledReviewDate: null,
        last_worked_by_name: "1st Lt. K. Nguyen",
        last_worked_at: "2026-04-20T16:30:00Z",
      },
      {
        name: "Cadet Programs",
        lastReviewDate: "2025-10-22",
        nextReviewDueDate: "2026-10-22",
        assignedReviewer: "Capt. M. Ellis",
        status: STATUS.SCHEDULED,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: ["Budget or resource notes (if applicable)"],
        uploadedFiles: [
          { id: uid(), name: "CP_Activity_Summary_Fall.pdf", uploadedAt: "2026-04-01" },
          { id: uid(), name: "CP_Training_Goals_2026.docx", uploadedAt: "2026-04-15" },
        ],
        actionItems: [{ id: uid(), text: "Finalize Great Start mentoring roster", done: false }],
        notes: "Review scheduled end of month after Red Ribbon block.",
        followUpTasks: ["Print cadet attendance rollup for reviewer"],
        completionConfirmed: false,
        scheduledReviewDate: "2026-05-28",
      },
      {
        name: "Communications",
        lastReviewDate: "2025-12-01",
        nextReviewDueDate: "2026-12-01",
        assignedReviewer: "2d Lt. P. Harmon",
        status: STATUS.CURRENT,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: [],
        uploadedFiles: [{ id: uid(), name: "Comm_Equipment_Inventory.pdf", uploadedAt: "2025-11-28" }],
        actionItems: [{ id: uid(), text: "Document repeater maintenance window", done: true }],
        notes: "All required documents on file.",
        followUpTasks: [],
        completionConfirmed: false,
        scheduledReviewDate: null,
      },
      {
        name: "Logistics",
        lastReviewDate: "2025-05-14",
        nextReviewDueDate: "2026-05-14",
        assignedReviewer: "Lt. Col. S. Brennan",
        status: STATUS.COMPLETED,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: [],
        uploadedFiles: [
          { id: uid(), name: "Logistics_BFR_Packet_Spring2026.pdf", uploadedAt: "2026-05-02" },
        ],
        actionItems: [{ id: uid(), text: "Archive completed review in squadron records", done: true }],
        notes: "Spring 2026 biannual review completed and confirmed.",
        followUpTasks: [],
        completionConfirmed: true,
        scheduledReviewDate: "2026-05-22",
      },
      {
        name: "Safety",
        lastReviewDate: "2025-06-20",
        nextReviewDueDate: "2026-06-20",
        assignedReviewer: "Maj. T. Owens",
        status: STATUS.DUE_SOON,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: ["Safety compliance checklist"],
        uploadedFiles: [{ id: uid(), name: "Safety_Briefing_Index.pdf", uploadedAt: "2026-02-10" }],
        actionItems: [
          { id: uid(), text: "Update range safety briefing slides", done: false },
          { id: uid(), text: "Confirm firearm training documentation", done: true },
        ],
        notes: "Align review with May safety briefing night.",
        followUpTasks: ["Attach May range waiver copies to packet"],
        completionConfirmed: false,
        scheduledReviewDate: "2026-05-14",
      },
      {
        name: "Finance/Admin",
        lastReviewDate: "2025-11-30",
        nextReviewDueDate: "2026-11-30",
        assignedReviewer: "Capt. L. Price",
        status: STATUS.CURRENT,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: ["Budget or resource notes (if applicable)"],
        uploadedFiles: [{ id: uid(), name: "Squadron_Budget_Snapshot_Q1.pdf", uploadedAt: "2026-01-08" }],
        actionItems: [{ id: uid(), text: "Reconcile supply fund receipts", done: false }],
        notes: "Awaiting updated budget worksheet from wing.",
        followUpTasks: [],
        completionConfirmed: false,
        scheduledReviewDate: null,
      },
    ];

    return base.map((d) => ({ id: uid(), ...d }));
  }

  const STATUS_FROM_DB = {
    current: STATUS.CURRENT,
    due_soon: STATUS.DUE_SOON,
    overdue: STATUS.OVERDUE,
    scheduled: STATUS.SCHEDULED,
    completed: STATUS.COMPLETED,
    needs_review: STATUS.DUE_SOON,
  };

  let reviewCache = { departments: [], updatedAt: new Date().toISOString() };

  async function loadFromFirestore() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) return { departments: [], updatedAt: new Date().toISOString() };
    const { data, error } = await sb.from("flight_reviews").select("*").order("department");
    if (error || !data?.length) return { departments: [], updatedAt: new Date().toISOString() };
    return {
      departments: data.map((row) => ({
        id: row.id,
        name: row.department,
        lastReviewDate: row.last_review_date,
        nextReviewDueDate: row.next_review_due_date,
        assignedReviewer: row.assigned_reviewer || "",
        status: STATUS_FROM_DB[row.status] || STATUS.CURRENT,
        requiredDocuments: [...DEFAULT_REQUIRED],
        missingDocuments: [],
        uploadedFiles: [],
        actionItems: [],
        notes: row.notes || "",
        followUpTasks: [],
        completionConfirmed: row.status === "completed",
        scheduledReviewDate: null,
        last_worked_at: row.last_worked_at,
        last_worked_by_name: null,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  function load() {
    return reviewCache;
  }

  function save(data) {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    syncCalendarFromReviews(data);
  }

  function refreshStatuses(data) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    data.departments.forEach((d) => {
      if (!d.completionConfirmed) {
        d.status = computeStatus(d, today);
      }
    });
    return data;
  }

  function getMetrics(data) {
    const depts = data.departments;
    const total = depts.length || 1;
    const counts = {
      current: 0,
      dueSoon: 0,
      overdue: 0,
      scheduled: 0,
      completed: 0,
    };
    let score = 0;
    let missingDocs = 0;

    depts.forEach((d) => {
      missingDocs += (d.missingDocuments || []).length;
      switch (d.status) {
        case STATUS.CURRENT:
          counts.current++;
          score += 100;
          break;
        case STATUS.COMPLETED:
          counts.completed++;
          score += 100;
          break;
        case STATUS.SCHEDULED:
          counts.scheduled++;
          score += 75;
          break;
        case STATUS.DUE_SOON:
          counts.dueSoon++;
          score += 50;
          break;
        case STATUS.OVERDUE:
          counts.overdue++;
          score += 0;
          break;
        default:
          break;
      }
    });

    return {
      readinessPercent: Math.round(score / total),
      total,
      ...counts,
      missingDocs,
    };
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function actorName() {
    return global.SMTN170Auth?.actorDisplay?.() || "Member";
  }

  function touchAudit(dept) {
    const now = new Date().toISOString();
    dept.last_worked_by_name = actorName();
    dept.last_worked_at = now;
    dept.updated_by_name = dept.last_worked_by_name;
    dept.updated_at = now;
  }

  function getDepartment(data, id) {
    return data.departments.find((d) => d.id === id);
  }

  function scheduleReview(data, id, date, reviewer) {
    const dept = getDepartment(data, id);
    if (!dept) return false;
    dept.scheduledReviewDate = date;
    if (reviewer) dept.assignedReviewer = reviewer;
    dept.status = STATUS.SCHEDULED;
    dept.completionConfirmed = false;
    touchAudit(dept);
    save(data);
    return true;
  }

  function confirmCompletion(data, id) {
    const dept = getDepartment(data, id);
    if (!dept) return false;
    if ((dept.missingDocuments || []).length > 0) {
      return { ok: false, message: "Resolve missing documents before confirming completion." };
    }
    dept.completionConfirmed = true;
    dept.status = STATUS.COMPLETED;
    dept.lastReviewDate = new Date().toISOString().slice(0, 10);
    const next = new Date();
    next.setMonth(next.getMonth() + 6);
    dept.nextReviewDueDate = next.toISOString().slice(0, 10);
    dept.missingDocuments = [];
    touchAudit(dept);
    dept.completed_by_name = actorName();
    save(data);
    return { ok: true };
  }

  function updateDepartment(data, id, patch) {
    const dept = getDepartment(data, id);
    if (!dept) return false;
    Object.assign(dept, patch);
    touchAudit(dept);
    if (!dept.completionConfirmed) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dept.status = computeStatus(dept, today);
    }
    save(data);
    return true;
  }

  function addUploadedFile(data, id, fileName) {
    const dept = getDepartment(data, id);
    if (!dept || !fileName) return false;
    dept.uploadedFiles = dept.uploadedFiles || [];
    dept.uploadedFiles.push({ id: uid(), name: fileName, uploadedAt: new Date().toISOString().slice(0, 10) });
    touchAudit(dept);
    save(data);
    return true;
  }

  function markDocumentReceived(data, id, docName) {
    const dept = getDepartment(data, id);
    if (!dept) return false;
    dept.missingDocuments = (dept.missingDocuments || []).filter((m) => m !== docName);
    touchAudit(dept);
    save(data);
    return true;
  }

  function getReviewCalendarEvents(data) {
    return data.departments
      .filter((d) => d.scheduledReviewDate)
      .map((d) => ({
        id: "fr-" + d.id,
        title: d.name + " — Biannual Flight Review",
        date: d.scheduledReviewDate,
        startTime: "1830",
        endTime: "2000",
        location: "Squadron Classroom",
        category: "flight-review",
        departmentId: d.id,
      }));
  }

  const BASE_CALENDAR_EVENTS = [
    { id: "ev-1", title: "Weekly Squadron Meeting", date: "2026-05-05", startTime: "1900", endTime: "2100", location: "Squadron Classroom", category: "meeting" },
    { id: "ev-2", title: "Firearm Training", date: "2026-05-11", startTime: "0900", endTime: "1200", location: "Range", category: "training" },
    { id: "ev-3", title: "Safety Briefing Night", date: "2026-05-12", startTime: "1900", endTime: "2100", location: "Squadron Classroom", category: "safety" },
    { id: "ev-4", title: "Rummage Sale", date: "2026-05-16", startTime: "0800", endTime: "1500", location: "Squadron Hangar", category: "activity" },
    { id: "ev-5", title: "Red Ribbon Leadership Academy", date: "2026-05-19", startTime: "1900", endTime: "2100", location: "Squadron Classroom", category: "training" },
  ];

  function loadAllCalendarEvents() {
    const data = refreshStatuses(load());
    const reviewEvents = getReviewCalendarEvents(data);
    const stored = localStorage.getItem(CALENDAR_KEY);
    let custom = [];
    if (stored) {
      try {
        custom = JSON.parse(stored);
        if (!Array.isArray(custom)) custom = [];
      } catch {
        custom = [];
      }
    }
    const merged = [...BASE_CALENDAR_EVENTS, ...reviewEvents, ...custom];
    return merged.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  }

  function syncCalendarFromReviews(data) {
    localStorage.setItem(
      CALENDAR_KEY + "_flight_reviews",
      JSON.stringify(getReviewCalendarEvents(data))
    );
  }

  function formatEventDate(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return { month: "", day: "", label: dateStr };
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = String(d.getDate()).padStart(2, "0");
    const label = month + " " + day;
    return { month, day, label };
  }

  function formatTimeRange(start, end) {
    const fmt = (t) => {
      if (!t) return "";
      const clean = String(t).replace(":", "");
      if (clean.length >= 4) return clean.slice(0, 2) + ":" + clean.slice(2, 4);
      return t;
    };
    if (start && end) return fmt(start) + " - " + fmt(end);
    return fmt(start) || "";
  }

  function renderCalendarEventItem(ev) {
    const { label } = formatEventDate(ev.date);
    const time = formatTimeRange(ev.startTime, ev.endTime);
    const loc = ev.location ? " · " + escapeHtml(ev.location) : "";
    const frClass = ev.category === "flight-review" ? " event-item--flight-review" : "";
    const badge = ev.category === "flight-review" ? '<span class="fr-event-badge">BFR</span>' : "";
    return `<div class="event-item${frClass}" data-event-id="${escapeHtml(ev.id)}">
      <b>${escapeHtml(label)}</b>
      <span>${badge}${escapeHtml(ev.title)}<br><small>${escapeHtml(time)}${loc}</small></span>
    </div>`;
  }

  function renderDashboardEvent(ev) {
    const { month, day } = formatEventDate(ev.date);
    const time = formatTimeRange(ev.startTime, ev.endTime);
    const frNote = ev.category === "flight-review" ? ' <span class="fr-event-badge">BFR</span>' : "";
    return `<div class="event">
      <div class="date"><small>${escapeHtml(month)}</small><strong>${escapeHtml(day)}</strong></div>
      <div><h3>${escapeHtml(ev.title)}${frNote}</h3><p>${escapeHtml(time)}<br>${escapeHtml(ev.location || "")}</p></div>
    </div>`;
  }

  function printDocument(title, bodyHtml) {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      alert("Allow pop-ups to open printable exports.");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111;line-height:1.45}
        h1{font-size:1.4rem;margin:0 0 8px;text-transform:uppercase}
        h2{font-size:1rem;margin:20px 0 8px;border-bottom:2px solid #123f91;padding-bottom:4px}
        .meta{color:#444;font-size:0.9rem;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:0.88rem;margin:12px 0}
        th,td{border:1px solid #333;padding:8px;text-align:left;vertical-align:top}
        th{background:#eef3ff}
        ul{margin:8px 0;padding-left:20px}
        .status-overdue{color:#b00020;font-weight:bold}
        .status-due{color:#9a6b00;font-weight:bold}
        .footer{margin-top:24px;font-size:0.8rem;color:#555}
        @media print{body{margin:12px}}
      </style></head><body>${bodyHtml}
      <p class="footer">TN-170 Oak Ridge Composite Squadron · Senior Member operations portal · ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  function exportChecklist(data, deptId) {
    const dept = getDepartment(data, deptId);
    if (!dept) return;
    const docs = (dept.requiredDocuments || [])
      .map((doc) => {
        const missing = (dept.missingDocuments || []).includes(doc);
        return `<li>${escapeHtml(doc)} — ${missing ? "<strong>MISSING</strong>" : "On file"}</li>`;
      })
      .join("");
    const actions = (dept.actionItems || [])
      .map((a) => `<li>${a.done ? "☑" : "☐"} ${escapeHtml(a.text)}</li>`)
      .join("");
    printDocument(
      dept.name + " — Review Checklist",
      `<h1>${escapeHtml(dept.name)} — Biannual Flight Review Checklist</h1>
      <p class="meta">Reviewer: ${escapeHtml(dept.assignedReviewer)} · Last review: ${formatDate(dept.lastReviewDate)} · Due: ${formatDate(dept.nextReviewDueDate)} · Status: ${escapeHtml(dept.status)}</p>
      <h2>Required documents</h2><ul>${docs}</ul>
      <h2>Action items</h2><ul>${actions || "<li>None</li>"}</ul>
      <h2>Notes</h2><p>${escapeHtml(dept.notes || "—")}</p>
      <h2>Follow-up tasks</h2><ul>${(dept.followUpTasks || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("") || "<li>None</li>"}</ul>
      <h2>Completion</h2><p>Confirmed: ${dept.completionConfirmed ? "Yes" : "No"}</p>`
    );
  }

  function exportPacket(data, deptId) {
    const dept = getDepartment(data, deptId);
    if (!dept) return;
    const files = (dept.uploadedFiles || []).map((f) => `<li>${escapeHtml(f.name)} (${formatDate(f.uploadedAt)})</li>`).join("") || "<li>No files uploaded in demo</li>";
    printDocument(
      dept.name + " — Review Packet",
      `<h1>${escapeHtml(dept.name)} — Department Review Packet</h1>
      <p class="meta">Assigned reviewer: ${escapeHtml(dept.assignedReviewer)} · Scheduled: ${formatDate(dept.scheduledReviewDate)}</p>
      <h2>Review summary</h2>
      <table><tr><th>Last review</th><td>${formatDate(dept.lastReviewDate)}</td></tr>
      <tr><th>Next due</th><td>${formatDate(dept.nextReviewDueDate)}</td></tr>
      <tr><th>Status</th><td>${escapeHtml(dept.status)}</td></tr></table>
      <h2>Uploaded files</h2><ul>${files}</ul>
      <h2>Missing documents</h2><ul>${(dept.missingDocuments || []).map((m) => `<li>${escapeHtml(m)}</li>`).join("") || "<li>None</li>"}</ul>
      <h2>Notes &amp; follow-up</h2><p>${escapeHtml(dept.notes || "")}</p>
      <ul>${(dept.followUpTasks || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    );
  }

  function exportOverdueReport(data) {
    const overdue = data.departments.filter((d) => d.status === STATUS.OVERDUE);
    const rows = overdue
      .map(
        (d) =>
          `<tr><td>${escapeHtml(d.name)}</td><td class="status-overdue">${formatDate(d.nextReviewDueDate)}</td><td>${escapeHtml(d.assignedReviewer)}</td><td>${(d.missingDocuments || []).length}</td></tr>`
      )
      .join("");
    printDocument(
      "Overdue Biannual Flight Reviews",
      `<h1>Overdue Department Flight Reviews</h1>
      <p class="meta">Squadron: Oak Ridge Composite · Generated ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>Department</th><th>Due date</th><th>Reviewer</th><th>Missing docs</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"4\">No overdue departments</td></tr>"}</tbody></table>`
    );
  }

  function exportReadinessSummary(data) {
    const m = getMetrics(data);
    const rows = data.departments
      .map(
        (d) =>
          `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.status)}</td><td>${formatDate(d.nextReviewDueDate)}</td><td>${escapeHtml(d.assignedReviewer)}</td><td>${(d.missingDocuments || []).length}</td></tr>`
      )
      .join("");
    printDocument(
      "Squadron BFR Status Summary",
      `<h1>Biannual Flight Reviews — Squadron Summary</h1>
      <p class="meta">Directorate BFR status: <strong>${m.readinessPercent}%</strong> · Current: ${m.current} · Due soon: ${m.dueSoon} · Overdue: ${m.overdue} · Scheduled: ${m.scheduled} · Completed: ${m.completed} · Missing documentation items: ${m.missingDocs}</p>
      <table><thead><tr><th>Department</th><th>Status</th><th>Next due</th><th>Reviewer</th><th>Missing</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  function renderDashboardCard(root) {
    if (!root) return;
    const data = refreshStatuses(load());
    const m = getMetrics(data);
    if (!data.departments.length) {
      root.innerHTML = `
        <div class="fr-dash-head">
          <div>
            <p class="kicker" style="margin:0 0 6px">Flight reviews</p>
            <h2 style="margin:0;font-size:1.35rem">Flight review status</h2>
          </div>
        </div>
        <p class="dash-empty">No flight review records yet. Add your first record on the Flight Reviews page.</p>
        <div class="fr-dash-actions">
          <a class="btn gold" href="flight-review.html">Open Flight Reviews</a>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="fr-dash-head">
        <div>
          <p class="kicker" style="margin:0 0 6px">Biannual Flight Reviews</p>
          <h2 style="margin:0;font-size:1.35rem">Flight review status</h2>
        </div>
        <div class="fr-readiness-ring" aria-label="BFR squadron status ${m.readinessPercent} percent">
          <strong>${m.readinessPercent}%</strong>
          <span>On BFR</span>
        </div>
      </div>
      <div class="fr-dash-stats">
        <div><strong>${m.current}</strong><span>Current</span></div>
        <div><strong>${m.dueSoon}</strong><span>Due soon</span></div>
        <div><strong class="fr-stat-warn">${m.overdue}</strong><span>Overdue</span></div>
        <div><strong>${m.scheduled}</strong><span>Scheduled</span></div>
        <div><strong>${m.missingDocs}</strong><span>Missing docs</span></div>
      </div>
      <div class="fr-dash-actions">
        <a class="btn gold" href="flight-review.html">Prepare BFR packet</a>
        <a class="btn" href="flight-review.html#departments">View directorates</a>
      </div>`;
  }

  function renderDepartmentCard(dept) {
    const statusClass = STATUS_CLASS[dept.status] || "";
    const missing = (dept.missingDocuments || []).length;
    const files = (dept.uploadedFiles || []).length;
    return `
      <article class="panel fr-dept-card ${statusClass}" data-dept-id="${dept.id}" id="dept-${dept.id}">
        <div class="fr-dept-card-head">
          <div>
            <h2>${escapeHtml(dept.name)}</h2>
            <span class="fr-status-pill ${statusClass}">${escapeHtml(dept.status)}</span>
          </div>
          <button type="button" class="ghost-btn btn-sm" data-action="expand-dept" data-dept-id="${dept.id}">Details</button>
        </div>
        <dl class="fr-dept-meta">
          <div><dt>Last review</dt><dd>${formatDate(dept.lastReviewDate)}</dd></div>
          <div><dt>Next due</dt><dd>${formatDate(dept.nextReviewDueDate)}</dd></div>
          <div><dt>Reviewer</dt><dd>${escapeHtml(dept.assignedReviewer)}</dd></div>
          <div><dt>Scheduled</dt><dd>${formatDate(dept.scheduledReviewDate)}</dd></div>
        </dl>
        <div class="fr-dept-badges">
          <span class="fr-chip fr-chip--warn">${missing} missing</span>
          <span class="fr-chip">${files} file${files === 1 ? "" : "s"}</span>
          <span class="fr-chip">${(dept.actionItems || []).filter((a) => !a.done).length} open actions</span>
        </div>
        ${global.SMTN170Auth?.renderAuditHtml?.(dept) || ""}
        <div class="fr-dept-detail" hidden>
          ${renderDepartmentDetail(dept)}
        </div>
      </article>`;
  }

  function renderDepartmentDetail(dept) {
    const reqDocs = (dept.requiredDocuments || [])
      .map((doc) => {
        const miss = (dept.missingDocuments || []).includes(doc);
        return `<li class="${miss ? "fr-doc-missing" : "fr-doc-ok"}">${escapeHtml(doc)}${miss ? ' <button type="button" class="btn-ghost btn-sm" data-action="mark-doc" data-dept-id="' + dept.id + '" data-doc="' + encodeURIComponent(doc) + '">Mark received</button>' : ""}</li>`;
      })
      .join("");
    const files = (dept.uploadedFiles || [])
      .map((f) => `<li>${escapeHtml(f.name)} <small>${formatDate(f.uploadedAt)}</small></li>`)
      .join("") || "<li class=\"fr-muted\">No files linked yet. Upload supporting documents in Files and forms.</li>";
    const actions = (dept.actionItems || [])
      .map(
        (a) =>
          `<li><label><input type="checkbox" data-action="toggle-action" data-dept-id="${dept.id}" data-action-id="${a.id}" ${a.done ? "checked" : ""}/> ${escapeHtml(a.text)}</label></li>`
      )
      .join("");
    const followUps = (dept.followUpTasks || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("") || "<li class=\"fr-muted\">None</li>";

    return `
      <div class="fr-detail-grid">
        <section>
          <h3>Required documents</h3>
          <ul class="fr-doc-list">${reqDocs}</ul>
        </section>
        <section>
          <h3>Uploaded review files</h3>
          <ul>${files}</ul>
          <form class="fr-inline-form" data-action="upload-file" data-dept-id="${dept.id}">
            <input name="fileName" placeholder="File name" required />
            <button type="submit">Add file record</button>
          </form>
        </section>
        <section>
          <h3>Action items</h3>
          <ul class="fr-action-list">${actions}</ul>
        </section>
        <section>
          <h3>Notes</h3>
          <textarea data-field="notes" data-dept-id="${dept.id}" rows="3">${escapeHtml(dept.notes || "")}</textarea>
        </section>
        <section>
          <h3>Follow-up tasks</h3>
          <ul>${followUps}</ul>
        </section>
        <section class="fr-detail-actions">
          <button type="button" class="ghost-btn" data-action="export-checklist" data-dept-id="${dept.id}">Print checklist</button>
          <button type="button" class="ghost-btn" data-action="export-packet" data-dept-id="${dept.id}">Review packet PDF</button>
          <button type="button" data-action="confirm-complete" data-dept-id="${dept.id}" ${dept.completionConfirmed ? "disabled" : ""}>
            ${dept.completionConfirmed ? "Review completed" : "Confirm completion"}
          </button>
        </section>
      </div>`;
  }

  function renderModulePage() {
    const summaryRoot = document.getElementById("frSummaryStats");
    const deptRoot = document.getElementById("frDepartmentGrid");
    const scheduleForm = document.getElementById("frScheduleForm");
    if (!summaryRoot && !deptRoot) return;

    const data = refreshStatuses(load());
    const m = getMetrics(data);

    if (summaryRoot) {
      summaryRoot.innerHTML = `
        <article class="panel fr-summary-hero">
          <p class="kicker">Squadron-wide</p>
          <div class="fr-summary-top">
            <h2>Biannual Flight Reviews</h2>
            <div class="fr-readiness-ring fr-readiness-ring--lg" aria-label="BFR status ${m.readinessPercent} percent">
              <strong>${m.readinessPercent}%</strong>
              <span>Directorate BFR</span>
            </div>
          </div>
          <p class="fr-summary-copy">Track each directorate’s BFR packet, due dates, and scheduled review nights — the way senior members and ops officers actually run the squadron.</p>
        </article>
        <article class="stat-card"><span>${m.current}</span><strong>Current</strong><p>Directorates within BFR window</p></article>
        <article class="stat-card"><span>${m.dueSoon}</span><strong>Due soon</strong><p>BFR due within 45 days</p></article>
        <article class="stat-card"><span class="fr-stat-warn">${m.overdue}</span><strong>Overdue</strong><p>Packet prep required now</p></article>
        <article class="stat-card"><span>${m.scheduled}</span><strong>Scheduled</strong><p>On squadron calendar</p></article>
        <article class="stat-card"><span>${m.completed}</span><strong>Completed</strong><p>BFR confirmed this cycle</p></article>
        <article class="stat-card"><span>${m.missingDocs}</span><strong>Missing</strong><p>Outstanding packet items</p></article>`;
    }

    if (deptRoot) {
      deptRoot.innerHTML = data.departments.length
        ? data.departments.map(renderDepartmentCard).join("")
        : `<article class="panel card-info"><h2>No flight review records yet</h2><p>Add your first department flight review record with Steward or during staff planning.</p><button type="button" class="btn-gold" data-steward-open style="margin-top:12px">Open Steward</button></article>`;
      global.SMTN170Steward?.rebind?.();
    }

    if (scheduleForm) {
      const select = scheduleForm.querySelector('[name="departmentId"]');
      if (select && !select.dataset.filled) {
        select.innerHTML =
          '<option value="">Select directorate</option>' +
          data.departments
            .filter((d) => d.status !== STATUS.COMPLETED)
            .map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
            .join("");
        select.dataset.filled = "1";
      }
    }
  }

  function bindModulePage() {
    const deptRoot = document.getElementById("frDepartmentGrid");
    const scheduleForm = document.getElementById("frScheduleForm");
    if (!deptRoot && !scheduleForm) return;

    document.body.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const deptId = btn.dataset.deptId;
      let data = load();

      if (action === "expand-dept") {
        const card = btn.closest(".fr-dept-card");
        const detail = card?.querySelector(".fr-dept-detail");
        if (detail) {
          const open = detail.hidden;
          detail.hidden = !open;
          btn.textContent = open ? "Hide" : "Details";
        }
        return;
      }

      if (action === "mark-doc" && deptId && btn.dataset.doc) {
        markDocumentReceived(data, deptId, decodeURIComponent(btn.dataset.doc));
        renderModulePage();
        return;
      }

      if (action === "export-checklist" && deptId) {
        exportChecklist(refreshStatuses(load()), deptId);
        return;
      }

      if (action === "export-packet" && deptId) {
        exportPacket(refreshStatuses(load()), deptId);
        return;
      }

      if (action === "confirm-complete" && deptId) {
        const result = confirmCompletion(load(), deptId);
        if (!result.ok) alert(result.message);
        else renderModulePage();
        return;
      }
    });

    document.body.addEventListener("change", function (e) {
      const input = e.target.closest('[data-action="toggle-action"]');
      if (!input) return;
      const data = load();
      const dept = getDepartment(data, input.dataset.deptId);
      const item = dept?.actionItems?.find((a) => a.id === input.dataset.actionId);
      if (item) {
        item.done = input.checked;
        save(data);
      }
    });

    document.body.addEventListener(
      "blur",
      function (e) {
        const ta = e.target.closest('textarea[data-field="notes"]');
        if (!ta) return;
        updateDepartment(load(), ta.dataset.deptId, { notes: ta.value });
      },
      true
    );

    document.body.addEventListener("submit", function (e) {
      const form = e.target.closest("form[data-action]");
      if (!form) return;
      e.preventDefault();
      const action = form.dataset.action;
      const deptId = form.dataset.deptId;
      let data = load();

      if (action === "upload-file" && deptId) {
        const name = form.elements.fileName?.value?.trim();
        if (name) {
          addUploadedFile(data, deptId, name);
          renderModulePage();
          form.reset();
        }
        return;
      }

      if (form.id === "frScheduleForm") {
        const id = form.elements.departmentId?.value;
        const date = form.elements.reviewDate?.value;
        const reviewer = form.elements.reviewer?.value?.trim();
        if (!id || !date) {
          alert("Select a department and review date.");
          return;
        }
        scheduleReview(data, id, date, reviewer);
        alert("Department review scheduled and added to squadron calendar.");
        renderModulePage();
        form.reset();
      }
    });

  }

  function bindExportButtons() {
    document.querySelectorAll("[data-export]").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        const data = refreshStatuses(load());
        const type = btn.dataset.export;
        if (type === "overdue") exportOverdueReport(data);
        else if (type === "summary") exportReadinessSummary(data);
        else if (type === "checklist") {
          const first = data.departments[0];
          if (first) exportChecklist(data, first.id);
        } else if (type === "packet") {
          const scheduled = data.departments.find((d) => d.scheduledReviewDate);
          exportPacket(data, (scheduled || data.departments[0]).id);
        }
      });
    });
  }

  function initCalendarPage() {
    const list = document.getElementById("calendarEventList");
    const dashList = document.getElementById("dashboardEventList");
    const events = loadAllCalendarEvents();

    if (list) {
      list.innerHTML = events.map(renderCalendarEventItem).join("");
    }
    if (dashList) {
      dashList.innerHTML = events.slice(0, 8).map(renderDashboardEvent).join("");
    }

    const addForm = document.getElementById("calendarAddForm");
    if (addForm && !addForm.dataset.bound) {
      addForm.dataset.bound = "1";
      addForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const title = addForm.elements.title?.value?.trim();
        const date = addForm.elements.date?.value;
        if (!title || !date) return;
        let custom = [];
        try {
          custom = JSON.parse(localStorage.getItem(CALENDAR_KEY) || "[]");
          if (!Array.isArray(custom)) custom = [];
        } catch {
          custom = [];
        }
        custom.push({
          id: uid(),
          title,
          date,
          startTime: (addForm.elements.startTime?.value || "").replace(":", ""),
          endTime: (addForm.elements.endTime?.value || "").replace(":", ""),
          location: addForm.elements.location?.value?.trim() || "",
          category: "custom",
        });
        localStorage.setItem(CALENDAR_KEY, JSON.stringify(custom));
        initCalendarPage();
        addForm.reset();
      });
    }
  }

  async function init() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore legacy cached demo rows */
    }
    reviewCache = refreshStatuses(await loadFromFirestore());
    syncCalendarFromReviews(reviewCache);

    renderDashboardCard(document.getElementById("frDashboardCard"));
    renderModulePage();
    bindModulePage();
    bindExportButtons();
    initCalendarPage();
  }

  global.SMTN170FlightReview = {
    STORAGE_KEY,
    STATUS,
    load,
    save,
    refreshStatuses,
    getMetrics,
    getReviewCalendarEvents,
    loadAllCalendarEvents,
    exportChecklist,
    exportPacket,
    exportOverdueReport,
    exportReadinessSummary,
    renderDashboardCard,
    renderModulePage,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
