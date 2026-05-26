/**
 * TN-170 Monthly Squadron Meeting Schedule — print/PDF document renderer.
 * Loads the monthly schedule (by ?month=YYYY-MM) from Firestore `schedules`
 * and renders the document-style table matching the squadron reference.
 *
 * Supports two payload shapes for backward compatibility:
 *   - Legacy: week.opening, week.emphasis, week.block1, week.block2, week.closing
 *     are plain strings; reasonable time/highlight defaults are filled in.
 *   - Extended: each cell may be an object
 *     { startTime, endTime, durationLabel, title, owner, notes, highlightType }.
 *
 * Uses browser-native window.print() — no paid PDF libraries.
 */
(function initSchedulePrint(global) {
  const ROWS = [
    { key: "uniform", label: "Uniform" },
    { key: "opening", label: "Opening" },
    { key: "emphasis", label: "Emphasis" },
    { key: "block1", label: "Block #1" },
    { key: "block2", label: "Block #2" },
    { key: "closing", label: "Closing" },
  ];

  const DEFAULT_AUDIENCE_BADGES = [
    { label: "BCT", className: "sched-badge--yellow" },
    { label: "Flights", className: "sched-badge--green" },
    { label: "All Cadets", className: "sched-badge--cyan" },
    { label: "Parents", className: "sched-badge--plain" },
  ];

  const DEFAULT_TIMES = {
    opening:  { startTime: "1900", endTime: "1905" },
    emphasis: { startTime: "1905", endTime: "1920" },
    block1:   { startTime: "1920", endTime: "2005" },
    block2:   { startTime: "2010", endTime: "2050" },
    closing:  { startTime: "2050", endTime: "2100" },
  };

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function monthLabel(key) {
    if (!key) return "";
    try {
      const [y, m] = String(key).split("-");
      return new Date(+y, +m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    } catch {
      return key;
    }
  }

  function getMonthKeyFromQuery() {
    const params = new URLSearchParams(global.location?.search || "");
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    return new Date().toISOString().slice(0, 7);
  }

  function tuesdayDatesForMonth(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return [];
    const out = [];
    const date = new Date(y, m - 1, 1);
    while (date.getMonth() === m - 1 && out.length < 5) {
      if (date.getDay() === 2) {
        out.push(new Date(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return out;
  }

  function formatShortDate(d) {
    if (!d) return "";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  async function fetchSchedule(monthKey) {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb?.from) return null;
    try {
      const { data, error } = await sb
        .from("schedules")
        .select("*")
        .eq("month_key", monthKey)
        .maybeSingle();
      if (error) {
        console.warn("[schedule-print] firestore", error.message || error);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("[schedule-print] load failed", err);
      return null;
    }
  }

  function normalizeWeek(week, weekIndex, monthKey) {
    if (!week) week = {};
    const tuesdays = tuesdayDatesForMonth(monthKey);
    const tuesday = tuesdays[weekIndex] || null;
    const label =
      week.label ||
      `Week ${weekIndex + 1}${tuesday ? " - " + formatShortDate(tuesday) : ""}`;

    function asCell(slotKey) {
      const raw = week[slotKey];
      const defaults = DEFAULT_TIMES[slotKey] || {};
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return {
          startTime: raw.startTime || defaults.startTime || "",
          endTime: raw.endTime || defaults.endTime || "",
          durationLabel: raw.durationLabel || "",
          title: raw.title || "",
          owner: raw.owner || "",
          notes: raw.notes || "",
          highlightType: raw.highlightType || "none",
        };
      }
      return {
        startTime: defaults.startTime || "",
        endTime: defaults.endTime || "",
        durationLabel: "",
        title: typeof raw === "string" ? raw : "",
        owner: "",
        notes: "",
        highlightType: "none",
      };
    }

    return {
      label,
      date: week.date || (tuesday ? tuesday.toISOString().slice(0, 10) : ""),
      uniform: typeof week.uniform === "string" ? week.uniform : week.uniform?.title || "",
      opening: asCell("opening"),
      emphasis: asCell("emphasis"),
      block1: asCell("block1"),
      block2: asCell("block2"),
      closing: asCell("closing"),
    };
  }

  function normalizePayload(record, monthKey) {
    const payload = record?.payload || {};
    const weeksRaw = Array.isArray(payload.weeks) ? payload.weeks : [];
    const weeks = (weeksRaw.length ? weeksRaw : new Array(4).fill({})).map((w, i) =>
      normalizeWeek(w, i, monthKey)
    );

    return {
      monthKey,
      scheduleTitle: payload.scheduleTitle || record?.template_name || "Monthly Cadet Meeting Schedule",
      audienceLabels:
        Array.isArray(payload.audienceLabels) && payload.audienceLabels.length
          ? payload.audienceLabels
          : DEFAULT_AUDIENCE_BADGES.map((b) => b.label),
      weeks,
      extracurricularNote:
        payload.extracurricularNote || payload.extras || "",
    };
  }

  function badgeClassFor(label) {
    const found = DEFAULT_AUDIENCE_BADGES.find(
      (b) => b.label.toLowerCase() === String(label).toLowerCase()
    );
    return found ? found.className : "sched-badge--plain";
  }

  function renderTimeRange(cell) {
    if (!cell.startTime && !cell.endTime && !cell.durationLabel) return "";
    if (cell.durationLabel) {
      return `<span class="time-range">${escapeHtml(cell.durationLabel)}</span>`;
    }
    return `<span class="time-range">${escapeHtml(cell.startTime)}-${escapeHtml(
      cell.endTime
    )}</span>`;
  }

  function renderCell(cell, slotKey) {
    if (slotKey === "uniform") {
      return `<td class="sched-cell"><strong>${escapeHtml(cell || "")}</strong></td>`;
    }
    const hl = `hl-${cell.highlightType || "none"}`;
    const time = renderTimeRange(cell);
    const title = cell.title
      ? `<p class="activity-title">${escapeHtml(cell.title)}</p>`
      : `<p class="activity-title" style="opacity:0.5">—</p>`;
    const owner = cell.owner
      ? `<ul class="activity-owner"><li>${escapeHtml(cell.owner)}</li></ul>`
      : "";
    const notes = cell.notes
      ? `<p class="activity-notes">${escapeHtml(cell.notes)}</p>`
      : "";
    return `<td class="sched-cell ${hl}">${time}${title}${owner}${notes}</td>`;
  }

  function renderDocument(model) {
    const weeks = model.weeks;
    const headHtml = weeks
      .map((w) => `<th>${escapeHtml(w.label)}</th>`)
      .join("");

    const bodyHtml = ROWS.map((row) => {
      const cells = weeks
        .map((w) => {
          const value = w[row.key];
          return renderCell(value, row.key);
        })
        .join("");
      return `<tr><td class="row-label">${escapeHtml(row.label)}</td>${cells}</tr>`;
    }).join("");

    const badgesHtml = (model.audienceLabels || [])
      .map(
        (label) =>
          `<span class="sched-badge ${badgeClassFor(label)}">${escapeHtml(label)}</span>`
      )
      .join("");

    const footerHtml = model.extracurricularNote
      ? `<p class="sched-doc__footnote"><strong>Extracurricular Activities:</strong>${escapeHtml(
          " " + model.extracurricularNote
        )}</p>`
      : "";

    return `
      <article class="sched-doc" id="schedulePrintDoc">
        <header class="sched-doc__title-row">
          <h1 class="sched-doc__title">${escapeHtml(monthLabel(model.monthKey))}</h1>
          <p class="sched-doc__subtitle">${escapeHtml(model.scheduleTitle)}</p>
          <div class="sched-doc__legend">${badgesHtml}</div>
        </header>
        <table class="sched-table">
          <thead>
            <tr>
              <th></th>
              ${headHtml}
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
        ${footerHtml}
      </article>`;
  }

  function autoPrintIfRequested() {
    try {
      const params = new URLSearchParams(global.location?.search || "");
      const autoprint = params.get("autoprint");
      if (autoprint === "0" || autoprint === "false") return;
      setTimeout(() => {
        try {
          global.print();
        } catch (err) {
          console.warn("[schedule-print] print failed", err);
        }
      }, 400);
    } catch {
      /* ignore */
    }
  }

  async function render() {
    const host = document.getElementById("schedulePrintRoot");
    if (!host) return;
    host.innerHTML = `<p class="print-page__loading">Loading meeting schedule…</p>`;

    const monthKey = getMonthKeyFromQuery();
    const record = await fetchSchedule(monthKey);
    const model = normalizePayload(record, monthKey);
    host.innerHTML = renderDocument(model);
    autoPrintIfRequested();
  }

  async function init() {
    try {
      await global.SMTN170Firebase?.whenReady?.({ authOnly: false });
    } catch {
      /* fall through */
    }
    await render();
  }

  global.SMTN170SchedulePrint = {
    init,
    render,
    renderDocument,
    normalizePayload,
    DEFAULT_TIMES,
    DEFAULT_AUDIENCE_BADGES,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
