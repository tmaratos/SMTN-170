/**
 * TN-170 — Shared report renderers (single source of truth for builder Preview AND print views).
 *
 * Exposes two main functions on `window.SMTN170ReportRenderers`:
 *   - renderOrgChartPrintView(orgChart)       -> HTML string
 *   - renderMonthlySchedulePrintView(schedule) -> HTML string
 *
 * Also exposes default-structure factories used by the builders:
 *   - defaultOrgChart()
 *   - defaultMonthlySchedule(year, month, firstMeetingDate)
 *   - defaultBlocks()
 *
 * Both renderers emit markup that styles correctly with `css/print-export.css`
 * so the builder Preview tab matches the printed report exactly.
 */
(function initReportRenderers(global) {
  const PRIMARY_STAFF_SLOTS = [
    "Safety",
    "Administration",
    "Public Affairs",
    "Finance",
    "Deputy Commander for Cadets",
    "Communications",
    "Professional Development",
    "Logistics",
  ];

  const CADET_BRANCH_DEFAULTS = [
    "Aerospace Education",
    "Fitness Officer",
    "Cadet Structure",
  ];

  const STATUS_LABEL = {
    filled: "",
    vacant: "Vacant",
    acting: "Acting",
  };

  const HIGHLIGHT_CLASSES = {
    none: "hl-none",
    green: "hl-green",
    cyan: "hl-cyan",
    yellow: "hl-yellow",
  };

  const HIGHLIGHT_BADGE_CLASSES = {
    none: "sched-badge--plain",
    green: "sched-badge--green",
    cyan: "sched-badge--cyan",
    yellow: "sched-badge--yellow",
  };

  // Default seed for NEW monthly schedules. "Parents" is intentionally NOT
  // in this list — admins can still add it (or any other audience) via the
  // audience-label editor in the Setup tab. Existing saved schedules that
  // include Parents keep it (normalizeAudienceLabels only seeds defaults when
  // the input list is empty and never injects Parents into a non-empty list).
  const DEFAULT_AUDIENCE_LABELS = [
    { label: "BCT", highlightType: "yellow", enabled: true },
    { label: "Flights", highlightType: "green", enabled: true },
    { label: "All Cadets", highlightType: "cyan", enabled: true },
  ];

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /**
   * Convert legacy or partial audience-label data to the canonical object form.
   * Accepts either a flat string array (legacy: ["BCT","Flights",...]) or the
   * new object-array form. Returns objects of shape
   *   { label, highlightType, enabled }.
   */
  function normalizeAudienceLabels(value) {
    const list = safeArray(value);
    if (!list.length) return DEFAULT_AUDIENCE_LABELS.map((a) => ({ ...a }));
    return list.map((entry, i) => {
      if (typeof entry === "string") {
        const seed =
          DEFAULT_AUDIENCE_LABELS.find(
            (d) => d.label.toLowerCase() === entry.toLowerCase()
          ) || DEFAULT_AUDIENCE_LABELS[i] || { label: entry, highlightType: "none", enabled: true };
        return { label: entry, highlightType: seed.highlightType, enabled: true };
      }
      if (entry && typeof entry === "object") {
        const seed =
          DEFAULT_AUDIENCE_LABELS.find(
            (d) => d.label.toLowerCase() === String(entry.label || "").toLowerCase()
          ) || { highlightType: "none" };
        return {
          label: String(entry.label || ""),
          highlightType: HIGHLIGHT_CLASSES[entry.highlightType]
            ? entry.highlightType
            : seed.highlightType || "none",
          enabled: entry.enabled !== false,
        };
      }
      return { label: "", highlightType: "none", enabled: true };
    });
  }

  /**
   * Convert any single-entry or legacy block into the canonical block shape.
   * Always returns top-level convenience fields (for backward compat with the
   * old single-entry renderer) AND an `entries` array of length >= 1.
   */
  function normalizeBlock(block, fallback) {
    const fb = fallback || {
      startTime: "",
      endTime: "",
      durationLabel: "",
      title: "",
      owner: "",
      bullets: [],
      notes: "",
      highlightType: "none",
    };
    const top = block && typeof block === "object" ? block : {};
    const rawEntries = safeArray(top.entries).filter(
      (e) => e && typeof e === "object"
    );
    const entries = rawEntries.length
      ? rawEntries.map((e) => normalizeEntry(e, fb))
      : [normalizeEntry(top, fb)];
    const head = entries[0];
    return {
      startTime: head.startTime,
      endTime: head.endTime,
      durationLabel: head.durationLabel,
      title: head.title,
      owner: head.owner,
      bullets: head.bullets,
      notes: head.notes,
      highlightType: head.highlightType,
      entries,
    };
  }

  function normalizeEntry(entry, fallback) {
    const fb = fallback || {};
    const e = entry && typeof entry === "object" ? entry : {};
    return {
      startTime: e.startTime == null ? fb.startTime || "" : String(e.startTime),
      endTime: e.endTime == null ? fb.endTime || "" : String(e.endTime),
      durationLabel:
        e.durationLabel == null ? fb.durationLabel || "" : String(e.durationLabel),
      title: e.title == null ? fb.title || "" : String(e.title),
      owner: e.owner == null ? fb.owner || "" : String(e.owner),
      bullets: safeArray(e.bullets).filter(Boolean),
      notes: e.notes == null ? fb.notes || "" : String(e.notes),
      highlightType: HIGHLIGHT_CLASSES[e.highlightType]
        ? e.highlightType
        : fb.highlightType || "none",
    };
  }

  function emptyEntry(highlightType) {
    return {
      startTime: "",
      endTime: "",
      durationLabel: "",
      title: "",
      owner: "",
      bullets: [],
      notes: "",
      highlightType: highlightType || "none",
    };
  }

  function safeNow() {
    try {
      return new Date().toLocaleString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function uid(prefix) {
    return (
      (prefix || "rid") +
      "-" +
      (global.crypto?.randomUUID?.() ||
        Date.now() + "-" + Math.random().toString(16).slice(2))
    );
  }

  function sortBy(list, key) {
    return [...list].sort(
      (a, b) => (Number(a?.[key]) || 0) - (Number(b?.[key]) || 0)
    );
  }

  function findByPlacement(positions, placement) {
    return sortBy(
      safeArray(positions).filter((p) => p && p.placement === placement),
      "sortOrder"
    );
  }

  function findCommander(positions) {
    const exact = findByPlacement(positions, "commander")[0];
    if (exact) return exact;
    return safeArray(positions).find(
      (p) =>
        p &&
        /commander/i.test(p.title || "") &&
        !/deputy/i.test(p.title || "")
    );
  }

  function alignStaffRow(positions) {
    const staffRow = findByPlacement(positions, "staff_row");
    const out = [];
    PRIMARY_STAFF_SLOTS.forEach((slot, i) => {
      const slotLc = slot.toLowerCase();
      const idx = staffRow.findIndex((p) => {
        const t = (p.title || "").toLowerCase();
        const d = (p.department || "").toLowerCase();
        return t.includes(slotLc) || d === slotLc;
      });
      const pos = idx >= 0 ? staffRow.splice(idx, 1)[0] : null;
      out.push({ slot, pos, sortOrder: pos?.sortOrder ?? i });
    });
    // Append any extra staff_row positions that didn't match a named slot.
    staffRow.forEach((extra, i) => {
      out.push({
        slot: extra.title || "Staff",
        pos: extra,
        sortOrder: extra.sortOrder ?? PRIMARY_STAFF_SLOTS.length + i,
      });
    });
    return out;
  }

  /**
   * Render a single org-chart box. Per the TN-170 reference PDF every box is
   * the same plain bordered rectangle on a white background: two lines, name
   * on top in regular weight, position title underneath in italic. No status
   * badges, no department descriptors, no notes — those fields stay in the
   * editor for record keeping but the printed chart purposely mirrors the
   * reference document exactly.
   */
  function renderOrgBox(opts) {
    const { title, memberName, status, placeholderTitle } = opts || {};
    const isVacant = status === "vacant" || !memberName;
    const klass = ["org-box"];
    if (isVacant) klass.push("org-box--vacant");
    const roleText = title || placeholderTitle || "—";
    const nameHtml = isVacant
      ? `<p class="org-box__name org-box__name--vacant">Vacant</p>`
      : `<p class="org-box__name">${escapeHtml(memberName)}</p>`;
    return `
      <div class="${klass.join(" ")}">
        ${nameHtml}
        <p class="org-box__role">${escapeHtml(roleText)}</p>
      </div>`;
  }

  /**
   * Render the Table of Organization to match the TN-170 reference PDF:
   *   - Three-line centred title (squadron · unit number · report title) with
   *     NO date line by default. If `effectiveDate` is set on the chart it is
   *     shown beneath in tiny plain italic.
   *   - Commander box centred at the top — same plain border as every other
   *     box (no gold/yellow highlight).
   *   - A single horizontal row of 8 plain boxes in this fixed order:
   *     Safety · Administration · Public Affairs · Finance · Deputy Commander
   *     for Cadets · Communications · Professional Development · Logistics.
   *   - Beneath Deputy Commander for Cadets (position 5) a vertical branch
   *     stacks the three cadet positions (Aerospace Education, Fitness
   *     Officer, Cadet Structure) connected by a vertical line with short
   *     horizontal branches to each box.
   *   - Custom positions still render as a small "Additional Positions"
   *     section below so the editor can record extras without breaking the
   *     reference layout above.
   */
  function renderOrgChartPrintView(orgChart) {
    const chart = orgChart || {};
    const squadronName = chart.squadronName || "Oak Ridge Composite Squadron";
    const unitNumber = chart.unitNumber || "TN 170";
    const reportTitle = chart.title || "Table of Organization";
    const positions = safeArray(chart.positions);

    const commander = findCommander(positions);
    const staffRow = alignStaffRow(positions);
    const cadetBranch = sortBy(findByPlacement(positions, "cadet_branch"), "sortOrder");
    const custom = sortBy(findByPlacement(positions, "custom"), "sortOrder");

    const cadetBranchHtml = cadetBranch.length
      ? `
        <div class="org-cadet-branch" aria-label="Cadet Programs branch">
          <div class="org-cadet-branch__spine" aria-hidden="true"></div>
          <ul class="org-cadet-branch__items">
            ${cadetBranch
              .map(
                (p) => `
                <li class="org-cadet-branch__item">
                  <span class="org-cadet-branch__elbow" aria-hidden="true"></span>
                  ${renderOrgBox({
                    title: p.title,
                    memberName: p.memberName,
                    status: p.status,
                  })}
                </li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

    const staffCellsHtml = staffRow
      .map((slot) => {
        const isDcCadets = /deputy commander for cadets/i.test(slot.slot);
        const box = renderOrgBox({
          title: slot.pos?.title || slot.slot,
          memberName: slot.pos?.memberName,
          status: slot.pos?.status || (slot.pos ? "filled" : "vacant"),
          placeholderTitle: slot.slot,
        });
        return `
          <div class="org-staff-cell${isDcCadets ? " org-staff-cell--dc-cadets" : ""}">
            ${box}
            ${isDcCadets ? cadetBranchHtml : ""}
          </div>`;
      })
      .join("");

    const commanderHtml = `
      <div class="org-row org-row--commander">
        ${renderOrgBox({
          title: commander?.title || "Commander",
          memberName: commander?.memberName,
          status: commander?.status,
          placeholderTitle: "Commander",
        })}
      </div>
      <div class="org-connector-down org-connector-down--commander" aria-hidden="true"></div>`;

    const staffHtml = `
      <div class="org-staff-row" role="list">
        <div class="org-staff-row__beam" aria-hidden="true"></div>
        ${staffCellsHtml}
      </div>`;

    const customHtml = custom.length
      ? `
        <section class="org-additional">
          <h4 class="org-additional__heading">Additional Positions</h4>
          <div class="org-additional__grid">
            ${custom
              .map((p) =>
                renderOrgBox({
                  title: p.title,
                  memberName: p.memberName,
                  status: p.status,
                })
              )
              .join("")}
          </div>
        </section>`
      : "";

    const effectiveLine = chart.effectiveDate
      ? `<p class="org-chart-doc__updated">Effective ${escapeHtml(
          formatLongDate(chart.effectiveDate)
        )}</p>`
      : "";

    return `
      <article class="org-chart-doc" id="orgChartDoc">
        <header class="org-chart-doc__title">
          <h1>${escapeHtml(squadronName)}</h1>
          <h2>${escapeHtml(unitNumber)}</h2>
          <h3>${escapeHtml(reportTitle)}</h3>
          ${effectiveLine}
        </header>
        ${commanderHtml}
        ${staffHtml}
        ${customHtml}
      </article>`;
  }

  function renderBlockEntryInner(entry) {
    const safe = entry || {};
    const time =
      safe.startTime || safe.endTime
        ? `<span class="time-range">${escapeHtml(safe.startTime || "")}${
            safe.startTime && safe.endTime ? "–" : ""
          }${escapeHtml(safe.endTime || "")}${
            safe.durationLabel ? " (" + escapeHtml(safe.durationLabel) + ")" : ""
          }</span>`
        : "";
    const title = safe.title
      ? `<p class="activity-title">${escapeHtml(safe.title)}</p>`
      : "";
    // Owner & bullets are rendered as a single bulleted list — the Google
    // Docs reference shows "• Lt. Smith, J" as the first bullet, then any
    // additional bullets the editor entered.
    const items = [];
    if (safe.owner) items.push(safe.owner);
    safeArray(safe.bullets)
      .map((b) => String(b || "").trim())
      .filter(Boolean)
      .forEach((b) => items.push(b));
    const itemsHtml = items.length
      ? `<ul class="activity-owners">${items
          .map((b) => `<li>${escapeHtml(b)}</li>`)
          .join("")}</ul>`
      : "";
    const notes = safe.notes
      ? `<p class="activity-notes">${escapeHtml(safe.notes)}</p>`
      : "";
    return `${time}${title}${itemsHtml}${notes}`;
  }

  /**
   * Render one schedule cell. A block can carry multiple entries; they're
   * stacked vertically, separated by a thin divider. Each entry can have its
   * own highlight (we wrap each in a sub-pane carrying its own bg class).
   */
  function renderBlockCell(block) {
    const norm = normalizeBlock(block);
    const entries = norm.entries;
    if (entries.length <= 1) {
      const e = entries[0];
      const cls = HIGHLIGHT_CLASSES[e.highlightType] || "hl-none";
      return `<td class="sched-cell ${cls}">${renderBlockEntryInner(e)}</td>`;
    }
    // multi-entry — outer cell stays neutral; each entry colors its own pane
    const inner = entries
      .map((e) => {
        const cls = HIGHLIGHT_CLASSES[e.highlightType] || "hl-none";
        return `<div class="sched-entry ${cls}">${renderBlockEntryInner(e)}</div>`;
      })
      .join("");
    return `<td class="sched-cell sched-cell--multi">${inner}</td>`;
  }

  function formatWeekDate(date) {
    if (!date) return "";
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) return String(date);
      return d.toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      });
    } catch {
      return String(date);
    }
  }

  function formatLongDate(date) {
    if (!date) return "";
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) return String(date);
      return d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return String(date);
    }
  }

  function renderMonthlySchedulePrintView(schedule) {
    const sched = schedule || {};
    const month = Number(sched.month) || new Date().getMonth() + 1;
    const year = Number(sched.year) || new Date().getFullYear();
    const monthName = MONTH_NAMES[(month - 1) % 12] || "";
    const titleLine =
      sched.title || `${monthName} ${year} Monthly Squadron Meeting Schedule`;
    const audiences = normalizeAudienceLabels(sched.audienceLabels).filter(
      (a) => a.enabled && a.label
    );

    const weeks = safeArray(sched.weeks);
    const weekHeaders = weeks
      .map((w, i) => {
        const dateLabel = formatWeekDate(w.date);
        return `<th>Week ${i + 1}${dateLabel ? " — " + escapeHtml(dateLabel) : ""}</th>`;
      })
      .join("");

    const uniformRow = `
      <tr>
        <td class="row-label">Uniform</td>
        ${weeks
          .map((w) => `<td>${escapeHtml(w.uniform || "—")}</td>`)
          .join("")}
      </tr>`;

    const rowSpec = [
      ["Opening", "opening"],
      ["Emphasis", "emphasis"],
      ["Block #1", "block1"],
      ["Block #2", "block2"],
      ["Closing", "closing"],
    ];

    const blockRows = rowSpec
      .map(
        ([label, key]) => `
        <tr>
          <td class="row-label">${escapeHtml(label)}</td>
          ${weeks.map((w) => renderBlockCell(w?.[key])).join("")}
        </tr>`
      )
      .join("");

    const audienceRowHtml = audiences.length
      ? `<div class="sched-doc__audience-row">${audiences
          .map((a) => {
            const cls = HIGHLIGHT_BADGE_CLASSES[a.highlightType] || "sched-badge--plain";
            return `<span class="sched-badge ${cls}">${escapeHtml(a.label)}</span>`;
          })
          .join("")}</div>`
      : "";

    const legendHtml = `
      <div class="sched-doc__legend">
        <span class="sched-doc__legend-key">Highlight key</span>
        <span class="sched-legend-item"><span class="sched-legend-swatch sched-badge--green"></span>Main training</span>
        <span class="sched-legend-item"><span class="sched-legend-swatch sched-badge--cyan"></span>Safety / Special</span>
        <span class="sched-legend-item"><span class="sched-legend-swatch sched-badge--yellow"></span>Exam / Leadership</span>
      </div>`;

    const extraHtml = sched.extracurricularActivities
      ? `<div class="sched-doc__extra"><strong>Extracurricular activities:</strong> ${escapeHtml(
          sched.extracurricularActivities
        )}</div>`
      : "";
    const notesHtml = sched.notes
      ? `<div class="sched-doc__notes"><strong>Notes / announcements:</strong> ${escapeHtml(
          sched.notes
        )}</div>`
      : "";
    const footerHtml =
      extraHtml || notesHtml
        ? `<footer class="sched-doc__footer">${extraHtml}${notesHtml}</footer>`
        : "";

    const firstMeeting = sched.firstMeetingDate
      ? formatLongDate(sched.firstMeetingDate)
      : "";

    return `
      <article class="sched-doc" id="schedDoc">
        <header class="sched-doc__title-row">
          <h1 class="sched-doc__title">${escapeHtml(titleLine)}</h1>
          <p class="sched-doc__subtitle">Oak Ridge Composite Squadron · TN 170${
            firstMeeting
              ? `<span class="sched-doc__subtitle-meta">First meeting ${escapeHtml(
                  firstMeeting
                )}</span>`
              : ""
          }</p>
          ${audienceRowHtml}
          ${legendHtml}
        </header>
        <table class="sched-table">
          <thead>
            <tr>
              <th class="row-label"></th>
              ${weekHeaders}
            </tr>
          </thead>
          <tbody>
            ${uniformRow}
            ${blockRows}
          </tbody>
        </table>
        ${footerHtml}
      </article>`;
  }

  function defaultBlocks() {
    return {
      opening: {
        startTime: "1900",
        endTime: "1905",
        durationLabel: "5m",
        title: "Anthem",
        owner: "",
        bullets: [],
        notes: "",
        highlightType: "none",
        entries: [],
      },
      emphasis: {
        startTime: "1905",
        endTime: "1920",
        durationLabel: "15m",
        title: "Emphasis",
        owner: "",
        bullets: [],
        notes: "",
        highlightType: "none",
        entries: [],
      },
      block1: {
        startTime: "1920",
        endTime: "2005",
        durationLabel: "45m",
        title: "Training Block #1",
        owner: "",
        bullets: [],
        notes: "",
        highlightType: "green",
        entries: [],
      },
      block2: {
        startTime: "2005",
        endTime: "2050",
        durationLabel: "45m",
        title: "Training Block #2",
        owner: "",
        bullets: [],
        notes: "",
        highlightType: "green",
        entries: [],
      },
      closing: {
        startTime: "2050",
        endTime: "2100",
        durationLabel: "10m",
        title: "Announcements",
        owner: "",
        bullets: [],
        notes: "",
        highlightType: "none",
        entries: [],
      },
    };
  }

  function defaultWeek(label, dateIso) {
    return {
      id: uid("wk"),
      label,
      date: dateIso || "",
      uniform: "ABU",
      ...defaultBlocks(),
    };
  }

  function defaultMonthlySchedule(year, month, firstMeetingDate) {
    const now = new Date();
    const y = Number(year) || now.getFullYear();
    const m = Number(month) || now.getMonth() + 1;
    let weeks = [];
    if (firstMeetingDate) {
      const startDate = new Date(firstMeetingDate);
      if (!Number.isNaN(startDate.getTime())) {
        weeks = Array.from({ length: 4 }).map((_, i) => {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i * 7);
          return defaultWeek(`Week ${i + 1}`, d.toISOString().slice(0, 10));
        });
      }
    }
    if (!weeks.length) {
      weeks = Array.from({ length: 4 }).map((_, i) =>
        defaultWeek(`Week ${i + 1}`, "")
      );
    }
    return {
      id: uid("sched"),
      title: `${MONTH_NAMES[m - 1]} ${y} Monthly Squadron Meeting Schedule`,
      month: m,
      year: y,
      status: "draft",
      firstMeetingDate: firstMeetingDate || "",
      audienceLabels: DEFAULT_AUDIENCE_LABELS.map((a) => ({ ...a })),
      weeks,
      extracurricularActivities: "",
      notes: "",
    };
  }

  /**
   * Reference example used by the "Load TN-170 June 2026 Example" helper button
   * in the schedule builder. Includes multi-entry blocks, varying highlights,
   * and the canonical audience-label highlight mapping so the round-trip
   * (load → save → preview → print) can be smoke-tested against the real
   * Google Docs-style document.
   */
  function tn170JuneExample() {
    const mk = (overrides) => ({
      startTime: "",
      endTime: "",
      durationLabel: "",
      title: "",
      owner: "",
      bullets: [],
      notes: "",
      highlightType: "none",
      ...overrides,
    });
    const week = (label, date, uniform, blocks) => ({
      id: uid("wk"),
      label,
      date,
      uniform,
      ...blocks,
    });

    const weeks = [
      week("Week 1", "2026-06-02", "PT", {
        opening: mk({
          startTime: "1900",
          endTime: "1905",
          durationLabel: "5m",
          title: "Anthem",
        }),
        emphasis: mk({
          startTime: "1905",
          endTime: "1920",
          durationLabel: "15m",
          title: "Calisthenics",
          owner: "Flt. Sergeants",
          highlightType: "none",
        }),
        block1: mk({
          startTime: "1920",
          endTime: "2005",
          durationLabel: "45m",
          title: "CPFT",
          owner: "1st Lt. Johnson, Z",
          highlightType: "green",
        }),
        block2: mk({
          startTime: "2005",
          endTime: "2050",
          durationLabel: "45m",
          title: "Bloodborne Pathogens Protection",
          owner: "1st Lt. Johnson, Z",
          highlightType: "green",
        }),
        closing: mk({
          startTime: "2050",
          endTime: "2100",
          durationLabel: "10m",
          title: "Announcements",
        }),
      }),
      week("Week 2", "2026-06-09", "ABU", {
        opening: mk({
          startTime: "1900",
          endTime: "1905",
          durationLabel: "5m",
          title: "Anthem",
        }),
        emphasis: mk({
          startTime: "1905",
          endTime: "1920",
          durationLabel: "15m",
          title: "Safety Briefing: Hot Weather Injuries",
          owner: "Maj Juneau, C",
          highlightType: "cyan",
        }),
        block1: {
          startTime: "1920",
          endTime: "2005",
          durationLabel: "45m",
          title: "",
          owner: "",
          bullets: [],
          notes: "",
          highlightType: "none",
          entries: [
            mk({ title: "TBD", owner: "TBD" }),
            mk({ startTime: "1920", title: "TBD", owner: "TBD" }),
          ],
        },
        block2: mk({
          startTime: "2005",
          endTime: "2050",
          durationLabel: "45m",
          title: "Drill",
          owner: "Flt. Sergeants",
          highlightType: "green",
        }),
        closing: mk({
          startTime: "2050",
          endTime: "2100",
          durationLabel: "10m",
          title: "Announcements",
        }),
      }),
      week("Week 3", "2026-06-16", "ABU", {
        opening: mk({
          startTime: "1900",
          endTime: "1905",
          durationLabel: "5m",
          title: "Anthem",
        }),
        emphasis: mk({
          startTime: "1905",
          endTime: "1920",
          durationLabel: "15m",
          title: "TBD",
          owner: "TBD",
        }),
        block1: {
          startTime: "1920",
          endTime: "2005",
          durationLabel: "45m",
          title: "",
          owner: "",
          bullets: [],
          notes: "",
          highlightType: "none",
          entries: [
            mk({
              title: "AE Lecture: Intro into Circuits, LEDs",
              owner: "2nd Lt. Maratos, T",
              highlightType: "green",
            }),
            mk({
              startTime: "1920",
              title: "TBD",
              owner: "Flt. Commander",
            }),
          ],
        },
        block2: mk({
          startTime: "2005",
          endTime: "2050",
          durationLabel: "45m",
          title: "Drill",
          owner: "Flt. Sergeants",
          highlightType: "green",
        }),
        closing: mk({
          startTime: "2050",
          endTime: "2100",
          durationLabel: "10m",
          title: "Announcements",
        }),
      }),
      week("Week 4", "2026-06-23", "Blues", {
        opening: mk({
          startTime: "1900",
          endTime: "1905",
          durationLabel: "5m",
          title: "Anthem",
        }),
        emphasis: mk({
          startTime: "1905",
          endTime: "1920",
          durationLabel: "15m",
          title: "Cadet Advisory Council",
          owner: "CAC Representatives",
        }),
        block1: {
          startTime: "1920",
          endTime: "2005",
          durationLabel: "45m",
          title: "",
          owner: "",
          bullets: [],
          notes: "",
          highlightType: "none",
          entries: [
            mk({
              title: "Testing Period",
              owner: "TBD",
            }),
            mk({
              startTime: "1920",
              endTime: "2005",
              durationLabel: "45m",
              title: "Leadership 1 Exam",
              owner: "",
              highlightType: "yellow",
            }),
          ],
        },
        block2: mk({
          startTime: "2005",
          endTime: "2050",
          durationLabel: "45m",
          title: "Drill",
          owner: "Flt. Sergeants",
          highlightType: "green",
        }),
        closing: mk({
          startTime: "2050",
          endTime: "2100",
          durationLabel: "10m",
          title: "Announcements",
        }),
      }),
    ];

    return {
      id: uid("sched"),
      title: "June 2026 Monthly Squadron Meeting Schedule",
      month: 6,
      year: 2026,
      status: "draft",
      firstMeetingDate: "2026-06-02",
      audienceLabels: DEFAULT_AUDIENCE_LABELS.map((a) => ({ ...a })),
      weeks,
      extracurricularActivities:
        "5th Night Fun Night (June 30th), NESA (June 21st - 27th)",
      notes: "",
    };
  }

  function defaultOrgChart() {
    const commanderId = uid("pos");
    const dcCadets = uid("pos");
    const positions = [
      {
        id: commanderId,
        memberName: "",
        title: "Commander",
        department: "Command",
        reportsTo: null,
        placement: "commander",
        sortOrder: 0,
        status: "vacant",
        notes: "",
      },
    ];
    PRIMARY_STAFF_SLOTS.forEach((slot, i) => {
      const id = slot === "Deputy Commander for Cadets" ? dcCadets : uid("pos");
      positions.push({
        id,
        memberName: "",
        title: slot,
        department: slot === "Deputy Commander for Cadets" ? "Cadet Programs" : slot,
        reportsTo: commanderId,
        placement: "staff_row",
        sortOrder: i,
        status: "vacant",
        notes: "",
      });
    });
    CADET_BRANCH_DEFAULTS.forEach((slot, i) => {
      positions.push({
        id: uid("pos"),
        memberName: "",
        title: slot,
        department: "Cadet Programs",
        reportsTo: dcCadets,
        placement: "cadet_branch",
        sortOrder: i,
        status: "vacant",
        notes: "",
      });
    });
    return {
      id: uid("oc"),
      title: "Table of Organization",
      squadronName: "Oak Ridge Composite Squadron",
      unitNumber: "TN 170",
      // Match the TN-170 reference: no effective-date subtitle by default.
      // Admins can still set this in the Builder header to opt in to a tiny
      // italic "Effective …" line beneath the three-line title.
      effectiveDate: "",
      status: "draft",
      positions,
    };
  }

  function validateOrgChart(orgChart) {
    const warnings = [];
    const positions = safeArray(orgChart?.positions);
    const commander = findCommander(positions);
    if (!commander) warnings.push("No commander position found.");
    const seenTitles = new Map();
    positions.forEach((p) => {
      const key = (p.title || "").trim().toLowerCase();
      if (!key) return;
      seenTitles.set(key, (seenTitles.get(key) || 0) + 1);
    });
    seenTitles.forEach((count, title) => {
      if (count > 1) warnings.push(`Duplicate title used ${count}× — "${title}".`);
    });
    positions.forEach((p) => {
      if (p.placement === "custom" && !p.reportsTo) {
        warnings.push(
          `Custom position "${p.title || "(untitled)"}" has no "Reports to".`
        );
      }
      if (p.status === "vacant" && p.placement === "commander") {
        warnings.push("Commander position is vacant.");
      }
    });
    return warnings;
  }

  function validateSchedule(schedule) {
    const warnings = [];
    if (!schedule?.month || !schedule?.year)
      warnings.push("Month and year are required.");
    safeArray(schedule?.weeks).forEach((w, i) => {
      if (!w.date) warnings.push(`Week ${i + 1} is missing a date.`);
      if (!w.uniform) warnings.push(`Week ${i + 1} is missing a uniform.`);
      ["opening", "emphasis", "block1", "block2", "closing"].forEach((key) => {
        const norm = normalizeBlock(w?.[key]);
        const titled = norm.entries.some((e) => e.title);
        if (!titled)
          warnings.push(`Week ${i + 1} – ${key} block is incomplete.`);
      });
    });
    return warnings;
  }

  global.SMTN170ReportRenderers = {
    PRIMARY_STAFF_SLOTS,
    CADET_BRANCH_DEFAULTS,
    STATUS_LABEL,
    MONTH_NAMES,
    HIGHLIGHT_CLASSES,
    HIGHLIGHT_BADGE_CLASSES,
    DEFAULT_AUDIENCE_LABELS,
    escapeHtml,
    escapeAttr,
    uid,
    renderOrgChartPrintView,
    renderMonthlySchedulePrintView,
    defaultOrgChart,
    defaultMonthlySchedule,
    defaultBlocks,
    defaultWeek,
    validateOrgChart,
    validateSchedule,
    findCommander,
    alignStaffRow,
    findByPlacement,
    safeArray,
    formatWeekDate,
    formatLongDate,
    normalizeAudienceLabels,
    normalizeBlock,
    normalizeEntry,
    emptyEntry,
    tn170JuneExample,
  };
})(window);
