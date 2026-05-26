/**
 * TN-170 Monthly Squadron Meeting Schedule — print/PDF document renderer.
 *
 * Delegates rendering to the SHARED renderer
 * `SMTN170ReportRenderers.renderMonthlySchedulePrintView` so this print view
 * is byte-identical to the builder Preview tab.
 *
 * Source priority:
 *   1. ?id=<docId>          → load that doc from `monthlySchedules`
 *   2. ?month=YYYY-MM       → load matching legacy `schedules` row
 *   3. Most recent `monthlySchedules` doc (ordered by updatedAt)
 *   4. Most recent legacy `schedules` row adapted to the new shape
 *
 * Uses browser-native window.print() for "Save as PDF". No paid PDF libraries.
 */
(function initSchedulePrint(global) {
  function R() {
    return global.SMTN170ReportRenderers;
  }

  function tuesdayDatesForMonth(year, month) {
    const out = [];
    const date = new Date(year, month - 1, 1);
    while (date.getMonth() === month - 1 && out.length < 5) {
      if (date.getDay() === 2) out.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return out;
  }

  function parseMonthKey(monthKey) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
    const [y, m] = monthKey.split("-").map(Number);
    return { year: y, month: m };
  }

  function getQueryMonth() {
    const params = new URLSearchParams(global.location?.search || "");
    const m = params.get("month");
    return parseMonthKey(m) || null;
  }

  function adaptLegacyWeek(week, weekIdx, year, month) {
    const defaults = R().defaultBlocks();
    const tuesdays = tuesdayDatesForMonth(year, month);
    const tuesday = tuesdays[weekIdx];

    function asBlock(slotKey, raw) {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return { ...defaults[slotKey], ...raw };
      }
      return {
        ...defaults[slotKey],
        title: typeof raw === "string" ? raw : defaults[slotKey].title,
      };
    }

    return {
      id: week?.id || R().uid("wk"),
      label: week?.label || `Week ${weekIdx + 1}`,
      date:
        week?.date ||
        (tuesday ? tuesday.toISOString().slice(0, 10) : ""),
      uniform:
        typeof week?.uniform === "string"
          ? week.uniform
          : week?.uniform?.title || "ABU",
      opening: asBlock("opening", week?.opening),
      emphasis: asBlock("emphasis", week?.emphasis),
      block1: asBlock("block1", week?.block1),
      block2: asBlock("block2", week?.block2),
      closing: asBlock("closing", week?.closing),
    };
  }

  function adaptLegacyRecord(record, monthKey) {
    const parsed = parseMonthKey(monthKey) || {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    };
    const payload = record?.payload || {};
    const weeks = (Array.isArray(payload.weeks) && payload.weeks.length
      ? payload.weeks
      : new Array(4).fill({})).map((w, i) =>
      adaptLegacyWeek(w, i, parsed.year, parsed.month)
    );
    return {
      title:
        payload.scheduleTitle ||
        record?.template_name ||
        `${R().MONTH_NAMES[parsed.month - 1]} ${parsed.year} Monthly Squadron Meeting Schedule`,
      month: parsed.month,
      year: parsed.year,
      status: "draft",
      firstMeetingDate: weeks[0]?.date || "",
      audienceLabels:
        payload.audienceLabels && payload.audienceLabels.length
          ? payload.audienceLabels
          : ["BCT", "Flights", "All Cadets"],
      weeks,
      extracurricularActivities:
        payload.extracurricularNote || payload.extras || "",
      notes: "",
    };
  }

  async function fetchScheduleReport(id) {
    const helper = global.SMTN170FirebaseData?.monthlySchedules?.();
    if (!helper) return null;
    try {
      if (id) {
        const { data } = await helper.get(id);
        if (data) return data;
      }
      const { data } = await helper.list({
        order: { field: "updatedAt", asc: false },
        limit: 1,
      });
      return data && data[0] ? data[0] : null;
    } catch (err) {
      console.warn("[schedule-print] fetch failed", err);
      return null;
    }
  }

  async function fetchLegacySchedule(monthKey) {
    const sb =
      global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb?.from) return null;
    try {
      let q = sb.from("schedules").select("*");
      if (monthKey) q = q.eq("month_key", monthKey).maybeSingle();
      const { data, error } = await q;
      if (error) {
        console.warn("[schedule-print] legacy", error.message || error);
        return null;
      }
      if (Array.isArray(data)) return data[0] || null;
      return data;
    } catch (err) {
      console.warn("[schedule-print] legacy load failed", err);
      return null;
    }
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
    if (!R()) {
      host.innerHTML = `<p class="print-page__loading">Report renderer not loaded.</p>`;
      return;
    }
    host.innerHTML = `<p class="print-page__loading">Loading monthly schedule…</p>`;

    const params = new URLSearchParams(global.location?.search || "");
    const docId = params.get("id");
    const monthKey = params.get("month");

    let schedule = await fetchScheduleReport(docId);
    if (!schedule) {
      const legacy = await fetchLegacySchedule(monthKey);
      if (legacy) {
        schedule = adaptLegacyRecord(legacy, monthKey || legacy.month_key);
      }
    }
    if (!schedule) {
      const queryMonth = getQueryMonth() || {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      };
      schedule = R().defaultMonthlySchedule(queryMonth.year, queryMonth.month);
    }

    host.innerHTML = R().renderMonthlySchedulePrintView(schedule);
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
    adaptLegacyRecord,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
