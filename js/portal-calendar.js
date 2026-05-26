/**
 * TN-170 Calendar — full-width month grid with event pills.
 *
 * Data sources (read-only):
 *   1. Firestore `meetings` collection
 *      (fields: title, meeting_date, meeting_time, location, notes, status, uniform)
 *   2. Firestore `flightReviews` collection — scheduled BFRs surface as
 *      "Flight Review" events on the squadron calendar.
 *   3. Legacy localStorage `smtn170_calendar_events` custom events (back-compat).
 *
 * Calendar is read-only. Event creation/editing lives in Tasks and the
 * Monthly Meeting Schedule Builder.
 */
(function initPortalCalendar(global) {
  const CATEGORIES = {
    meeting: { label: "Meeting", color: "#ffd21f", textOnDark: false },
    training: { label: "Training", color: "#4f8df7", textOnDark: true },
    "flight-review": { label: "Flight Review", color: "#a855f7", textOnDark: true },
    safety: { label: "Safety", color: "#22c55e", textOnDark: false },
    activity: { label: "Activity", color: "#06b6d4", textOnDark: false },
    cancelled: { label: "Cancelled", color: "#9ca3af", textOnDark: false },
    custom: { label: "Other", color: "#f97316", textOnDark: false },
  };

  const STATE = {
    viewMonth: monthStart(new Date()),
    events: [],
    cache: new Map(),
    categoryOff: new Set(),
    loaded: false,
  };

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function monthEnd(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseIsoDate(str) {
    if (!str) return null;
    const s = String(str).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isSameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function escapeHtml(t) {
    const div = document.createElement("div");
    div.textContent = t == null ? "" : String(t);
    return div.innerHTML;
  }

  function formatMonthYear(d) {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatLongDate(d) {
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  /**
   * Normalize a "1900" or "19:00" or "1900-2100" style time into a readable
   * "7:00 PM" or "7:00 PM – 9:00 PM" range.
   */
  function formatTime(raw) {
    if (!raw) return "";
    const text = String(raw).trim();
    if (text.includes("-") || text.includes("–")) {
      const parts = text.split(/[-–]/);
      const a = formatTime(parts[0]);
      const b = formatTime(parts[1]);
      if (a && b) return `${a} – ${b}`;
      return a || b || "";
    }
    let h, m;
    const colon = text.match(/^(\d{1,2}):(\d{2})/);
    if (colon) {
      h = Number(colon[1]);
      m = Number(colon[2]);
    } else if (/^\d{3,4}$/.test(text)) {
      const padded = text.padStart(4, "0");
      h = Number(padded.slice(0, 2));
      m = Number(padded.slice(2, 4));
    } else {
      return text;
    }
    if (Number.isNaN(h) || Number.isNaN(m)) return text;
    const period = h >= 12 ? "PM" : "AM";
    const hr12 = ((h + 11) % 12) + 1;
    const mm = String(m).padStart(2, "0");
    return `${hr12}:${mm} ${period}`;
  }

  function categorize(ev) {
    if (ev.category && CATEGORIES[ev.category]) return ev.category;
    const status = String(ev.status || "").toLowerCase();
    if (status === "cancelled" || status === "canceled") return "cancelled";
    const text = `${ev.title || ""} ${ev.notes || ""}`.toLowerCase();
    if (text.includes("flight review") || text.includes("biannual") || text.includes("bfr")) return "flight-review";
    if (text.includes("training") || text.includes("academy") || text.includes("class")) return "training";
    if (text.includes("safety")) return "safety";
    if (text.includes("rummage") || text.includes("activity") || text.includes("sale")) return "activity";
    return "meeting";
  }

  function normalizeEvent(raw) {
    const date =
      raw.date ||
      raw.meeting_date ||
      raw.meetingDate ||
      raw.startDate ||
      raw.start_date ||
      raw.scheduledReviewDate ||
      raw.scheduled_review_date ||
      null;
    const dt = parseIsoDate(date);
    if (!dt) return null;
    const startTime = raw.startTime || raw.start_time || raw.meeting_time || raw.meetingTime || raw.time || "";
    const endTime = raw.endTime || raw.end_time || "";
    let timeLabel = "";
    if (startTime && endTime) timeLabel = `${formatTime(startTime)} – ${formatTime(endTime)}`;
    else if (startTime) timeLabel = formatTime(startTime);
    const ev = {
      id: raw.id || `ev-${date}-${Math.random().toString(16).slice(2, 8)}`,
      title: raw.title || raw.name || "Untitled event",
      date,
      dateObj: dt,
      timeLabel,
      startTimeRaw: startTime,
      location: raw.location || raw.where || "",
      notes: raw.notes || raw.description || "",
      uniform: raw.uniform || "",
      status: raw.status || "",
      source: raw.__source || "meeting",
    };
    ev.category = categorize({ ...raw, ...ev });
    return ev;
  }

  function getFirebaseClient() {
    return global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.() || null;
  }

  async function loadFromFirestore(monthDate) {
    const sb = getFirebaseClient();
    if (!sb) return [];
    const first = isoDate(monthStart(monthDate));
    const last = isoDate(monthEnd(monthDate));
    const events = [];

    try {
      const { data, error } = await sb
        .from("meetings")
        .select("id, title, meeting_date, meeting_time, location, notes, status, uniform")
        .gte("meeting_date", first)
        .lte("meeting_date", last)
        .order("meeting_date", { ascending: true });
      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          const ev = normalizeEvent({ ...row, __source: "meeting" });
          if (ev) events.push(ev);
        });
      }
    } catch (err) {
      console.warn("[calendar] meetings fetch failed:", err);
    }

    try {
      const { data, error } = await sb
        .from("flight_reviews")
        .select("id, department, scheduled_review_date, assigned_reviewer, notes, status");
      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          if (!row.scheduled_review_date) return;
          const dt = parseIsoDate(row.scheduled_review_date);
          if (!dt || dt < monthStart(monthDate) || dt > monthEnd(monthDate)) return;
          const ev = normalizeEvent({
            id: `fr-${row.id}`,
            title: `${row.department || "Directorate"} — Biannual Flight Review`,
            date: row.scheduled_review_date,
            startTime: "1830",
            endTime: "2000",
            location: "Squadron Classroom",
            notes: row.notes || "",
            category: "flight-review",
            __source: "flight-review",
          });
          if (ev) events.push(ev);
        });
      }
    } catch (err) {
      console.warn("[calendar] flight_reviews fetch failed:", err);
    }

    return events;
  }

  function loadLegacyLocal(monthDate) {
    const events = [];
    const mStart = monthStart(monthDate);
    const mEnd = monthEnd(monthDate);
    const seed = global.SMTN170FlightReview?.loadAllCalendarEvents?.();
    const fromFr = Array.isArray(seed) ? seed : [];
    fromFr.forEach((raw) => {
      const dt = parseIsoDate(raw.date);
      if (!dt || dt < mStart || dt > mEnd) return;
      const ev = normalizeEvent({ ...raw, __source: raw.category === "flight-review" ? "flight-review" : "legacy" });
      if (ev) events.push(ev);
    });
    return events;
  }

  function dedupe(events) {
    const seen = new Map();
    events.forEach((ev) => {
      const key = `${ev.date}|${ev.title.toLowerCase()}|${ev.startTimeRaw || ""}`;
      const existing = seen.get(key);
      if (!existing || existing.source === "legacy") seen.set(key, ev);
    });
    return Array.from(seen.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const at = String(a.startTimeRaw || "");
      const bt = String(b.startTimeRaw || "");
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
  }

  async function loadMonth(monthDate, opts) {
    const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    if (!opts?.force && STATE.cache.has(key)) {
      STATE.events = STATE.cache.get(key);
      return STATE.events;
    }
    const grid = document.getElementById("calGrid");
    if (grid) grid.innerHTML = '<p class="cal-empty">Loading squadron calendar…</p>';
    const [firestoreEvents, legacyEvents] = await Promise.all([
      loadFromFirestore(monthDate),
      Promise.resolve(loadLegacyLocal(monthDate)),
    ]);
    const merged = dedupe([...firestoreEvents, ...legacyEvents]);
    STATE.cache.set(key, merged);
    STATE.events = merged;
    return merged;
  }

  function buildDayCells(monthDate) {
    const first = monthStart(monthDate);
    const last = monthEnd(monthDate);
    const startWeekday = first.getDay();
    const totalDays = last.getDate();
    const cells = [];

    for (let i = 0; i < startWeekday; i += 1) {
      const d = new Date(first);
      d.setDate(d.getDate() - (startWeekday - i));
      cells.push({ date: d, outOfMonth: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({ date: new Date(first.getFullYear(), first.getMonth(), day), outOfMonth: false });
    }

    while (cells.length % 7 !== 0) {
      const lastCell = cells[cells.length - 1].date;
      const d = new Date(lastCell);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, outOfMonth: true });
    }

    if (cells.length < 42) {
      const lastCell = cells[cells.length - 1].date;
      for (let i = cells.length; i < 42; i += 1) {
        const d = new Date(lastCell);
        d.setDate(d.getDate() + (i - cells.length + 1));
        cells.push({ date: d, outOfMonth: true });
      }
    }

    return cells;
  }

  function eventsForDate(date) {
    const iso = isoDate(date);
    return STATE.events.filter((ev) => ev.date === iso && !STATE.categoryOff.has(ev.category));
  }

  function renderPill(ev) {
    const cat = CATEGORIES[ev.category] || CATEGORIES.meeting;
    const lightClass = cat.textOnDark ? " cal-pill--light" : "";
    const tooltip = ev.timeLabel ? `${ev.timeLabel} — ${ev.title}` : ev.title;
    const timeHtml = ev.timeLabel ? `<span class="cal-pill-time">${escapeHtml(ev.timeLabel.split(" – ")[0])}</span>` : "";
    return `<button type="button" class="cal-pill${lightClass}" style="--pill-color:${cat.color}" data-event-id="${escapeHtml(ev.id)}" title="${escapeHtml(tooltip)}">
      ${timeHtml}<span class="cal-pill-title">${escapeHtml(ev.title)}</span>
    </button>`;
  }

  function renderGrid() {
    const grid = document.getElementById("calGrid");
    const title = document.getElementById("calMonthTitle");
    if (!grid || !title) return;
    title.textContent = formatMonthYear(STATE.viewMonth);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = buildDayCells(STATE.viewMonth);
    const maxPills = 3;

    const html = cells
      .map((cell) => {
        const dayEvents = eventsForDate(cell.date);
        const isToday = isSameDay(cell.date, today);
        const classes = ["cal-day"];
        if (cell.outOfMonth) classes.push("cal-day--out");
        if (isToday) classes.push("cal-day--today");

        const visible = dayEvents.slice(0, maxPills);
        const overflow = dayEvents.length - visible.length;
        const pills = visible.map(renderPill).join("");
        const more = overflow > 0
          ? `<button type="button" class="cal-pill-more" data-day="${isoDate(cell.date)}">+${overflow} more</button>`
          : "";

        const aria = formatLongDate(cell.date) + (dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : "");
        return `<div class="${classes.join(" ")}" role="gridcell" tabindex="0" data-day="${isoDate(cell.date)}" aria-label="${escapeHtml(aria)}">
          <span class="cal-day-num">${cell.date.getDate()}</span>
          <div class="cal-day-pills">${pills}${more}</div>
        </div>`;
      })
      .join("");

    grid.innerHTML = html;
  }

  function renderFilters() {
    const host = document.getElementById("calFilters");
    if (!host) return;
    const counts = STATE.events.reduce((acc, ev) => {
      acc[ev.category] = (acc[ev.category] || 0) + 1;
      return acc;
    }, {});

    const order = ["meeting", "training", "flight-review", "safety", "activity", "custom", "cancelled"];
    const chips = order
      .filter((key) => CATEGORIES[key])
      .map((key) => {
        const cat = CATEGORIES[key];
        const count = counts[key] || 0;
        const off = STATE.categoryOff.has(key);
        return `<button type="button" class="cal-chip${off ? " cal-chip--off" : ""}" data-category="${key}" aria-pressed="${!off}" style="--chip-color:${cat.color}">
          <span class="cal-chip-dot" aria-hidden="true"></span>
          <span>${escapeHtml(cat.label)}</span>
          <span class="cal-chip-count">${count}</span>
        </button>`;
      })
      .join("");

    host.innerHTML = chips;
  }

  function openEventModal(ev) {
    const modal = document.getElementById("calEventModal");
    if (!modal || !ev) return;
    const cat = CATEGORIES[ev.category] || CATEGORIES.meeting;
    document.getElementById("calModalKicker").textContent = cat.label;
    document.getElementById("calModalKicker").style.color = cat.color;
    document.getElementById("calModalTitle").textContent = ev.title;
    const meta = document.getElementById("calModalMeta");
    const rows = [
      { label: "Date", value: formatLongDate(ev.dateObj) },
      ev.timeLabel ? { label: "Time", value: ev.timeLabel } : null,
      ev.location ? { label: "Location", value: ev.location } : null,
      ev.uniform ? { label: "Uniform", value: ev.uniform } : null,
      ev.status && ev.status !== "planned" ? { label: "Status", value: ev.status } : null,
    ].filter(Boolean);
    meta.innerHTML = rows
      .map((r) => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`)
      .join("");
    document.getElementById("calModalNotes").textContent = ev.notes || "";
    modal.hidden = false;
    const closeBtn = modal.querySelector(".cal-modal-close");
    closeBtn?.focus();
  }

  function openDayModal(dayIso) {
    const dt = parseIsoDate(dayIso);
    if (!dt) return;
    const dayEvents = eventsForDate(dt);
    if (!dayEvents.length) return;
    const modal = document.getElementById("calEventModal");
    if (!modal) return;
    document.getElementById("calModalKicker").textContent = `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`;
    document.getElementById("calModalKicker").style.color = "";
    document.getElementById("calModalTitle").textContent = formatLongDate(dt);
    const meta = document.getElementById("calModalMeta");
    meta.innerHTML = dayEvents
      .map((ev) => {
        const cat = CATEGORIES[ev.category] || CATEGORIES.meeting;
        const time = ev.timeLabel ? `<small style="color:var(--tn-muted);display:block;margin-top:2px">${escapeHtml(ev.timeLabel)}</small>` : "";
        const loc = ev.location ? `<small style="color:var(--tn-muted);display:block">${escapeHtml(ev.location)}</small>` : "";
        return `<div>
          <dt><span class="cal-chip-dot" style="--chip-color:${cat.color};display:inline-block;vertical-align:middle;margin-right:6px"></span>${escapeHtml(cat.label)}</dt>
          <dd><strong>${escapeHtml(ev.title)}</strong>${time}${loc}</dd>
        </div>`;
      })
      .join("");
    document.getElementById("calModalNotes").textContent = "";
    modal.hidden = false;
  }

  function closeModal() {
    const modal = document.getElementById("calEventModal");
    if (modal) modal.hidden = true;
  }

  function bindEvents() {
    document.getElementById("calPrevBtn")?.addEventListener("click", async () => {
      STATE.viewMonth = new Date(STATE.viewMonth.getFullYear(), STATE.viewMonth.getMonth() - 1, 1);
      await loadMonth(STATE.viewMonth);
      renderFilters();
      renderGrid();
    });

    document.getElementById("calNextBtn")?.addEventListener("click", async () => {
      STATE.viewMonth = new Date(STATE.viewMonth.getFullYear(), STATE.viewMonth.getMonth() + 1, 1);
      await loadMonth(STATE.viewMonth);
      renderFilters();
      renderGrid();
    });

    document.getElementById("calTodayBtn")?.addEventListener("click", async () => {
      STATE.viewMonth = monthStart(new Date());
      await loadMonth(STATE.viewMonth);
      renderFilters();
      renderGrid();
    });

    document.getElementById("calFilters")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".cal-chip");
      if (!chip) return;
      const key = chip.dataset.category;
      if (STATE.categoryOff.has(key)) STATE.categoryOff.delete(key);
      else STATE.categoryOff.add(key);
      renderFilters();
      renderGrid();
    });

    document.getElementById("calGrid")?.addEventListener("click", (e) => {
      const pill = e.target.closest(".cal-pill");
      if (pill) {
        const id = pill.dataset.eventId;
        const ev = STATE.events.find((x) => String(x.id) === String(id));
        if (ev) openEventModal(ev);
        return;
      }
      const more = e.target.closest(".cal-pill-more");
      if (more) {
        openDayModal(more.dataset.day);
        return;
      }
      const day = e.target.closest(".cal-day");
      if (day && day.dataset.day) {
        const dayEvents = eventsForDate(parseIsoDate(day.dataset.day));
        if (dayEvents.length === 1) openEventModal(dayEvents[0]);
        else if (dayEvents.length > 1) openDayModal(day.dataset.day);
      }
    });

    document.getElementById("calGrid")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const day = e.target.closest(".cal-day");
      if (!day) return;
      e.preventDefault();
      const dayEvents = eventsForDate(parseIsoDate(day.dataset.day));
      if (dayEvents.length === 1) openEventModal(dayEvents[0]);
      else if (dayEvents.length > 1) openDayModal(day.dataset.day);
    });

    const modal = document.getElementById("calEventModal");
    modal?.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-modal]")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  async function init() {
    const grid = document.getElementById("calGrid");
    if (!grid) return;
    bindEvents();
    await loadMonth(STATE.viewMonth);
    renderFilters();
    renderGrid();
    STATE.loaded = true;
  }

  global.SMTN170PortalCalendar = {
    init,
    refresh: () => loadMonth(STATE.viewMonth, { force: true }).then(() => {
      renderFilters();
      renderGrid();
    }),
    CATEGORIES,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
