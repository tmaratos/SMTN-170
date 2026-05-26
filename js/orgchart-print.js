/**
 * TN-170 Organization Chart — print/PDF document renderer.
 * Loads Firestore `orgPositions` and renders a clean, print-ready hierarchy
 * matching the TN-170 reference: Commander on top, primary staff in a row,
 * and a vertical Cadet Programs stack under the Deputy Commander for Cadets.
 *
 * Uses browser-native window.print() (Cmd/Ctrl+P or print toolbar button)
 * for "Save as PDF". No paid PDF libraries required.
 */
(function initOrgChartPrint(global) {
  const PRIMARY_STAFF_ORDER = [
    "Safety",
    "Administration",
    "Public Affairs",
    "Finance",
    "Deputy Commander for Cadets",
    "Communications",
    "Professional Development",
    "Logistics",
  ];

  const CADET_DEPARTMENT_NAMES = new Set([
    "Cadet Programs",
    "Cadet programs",
    "Aerospace Education",
    "Cadet Aerospace Education",
  ]);

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
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

  async function fetchPositions() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb?.from) return [];
    try {
      const { data, error } = await sb.from("org_positions").select("*").order("sort_order");
      if (error) {
        console.warn("[orgchart-print] firestore", error.message || error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn("[orgchart-print] load failed", err);
      return [];
    }
  }

  function findCommander(positions) {
    return (
      positions.find(
        (p) =>
          /commander/i.test(p.title || "") &&
          !/deputy/i.test(p.title || "") &&
          (!p.parent_id || p.is_command)
      ) || positions.find((p) => p.is_command && !p.parent_id)
    );
  }

  function findByTitleHint(positions, hints) {
    const lowered = hints.map((h) => h.toLowerCase());
    return positions.find((p) =>
      lowered.some((h) => (p.title || "").toLowerCase().includes(h))
    );
  }

  function rankPrimaryStaff(positions, commanderId) {
    const cadetTitle = "Deputy Commander for Cadets";
    const list = [];
    const used = new Set();

    PRIMARY_STAFF_ORDER.forEach((slot) => {
      const slotLc = slot.toLowerCase();
      const candidate = positions.find((p) => {
        if (used.has(p.id)) return false;
        if (p.title && p.title.toLowerCase().includes(slotLc)) return true;
        if (p.department && p.department.toLowerCase() === slotLc) return true;
        return false;
      });
      if (candidate) {
        used.add(candidate.id);
        list.push({ slot, pos: candidate });
      } else {
        list.push({ slot, pos: null });
      }
    });

    if (commanderId) {
      const dc = list.find((s) => s.slot === cadetTitle);
      if (dc && !dc.pos) {
        const fallback = positions.find(
          (p) => /deputy.*cadets?/i.test(p.title || "") && p.parent_id === commanderId
        );
        if (fallback) {
          used.add(fallback.id);
          dc.pos = fallback;
        }
      }
    }

    return list;
  }

  function gatherCadetStack(positions, deputyCadetId) {
    return positions
      .filter((p) => {
        if (deputyCadetId && p.parent_id === deputyCadetId) return true;
        return CADET_DEPARTMENT_NAMES.has(p.department || "");
      })
      .filter((p) => !/deputy.*cadets?/i.test(p.title || ""))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  function renderBox(pos, options) {
    const opts = options || {};
    const klass = ["org-box"];
    if (opts.command) klass.push("org-box--command");

    const title = pos ? pos.title : opts.placeholderTitle || "—";
    const memberRaw = pos?.assigned_member_name?.trim?.() || "";
    const memberHtml = memberRaw
      ? `<p class="org-box__member">${escapeHtml(memberRaw)}</p>`
      : `<p class="org-box__member org-box__member--vacant">Vacant</p>`;

    return `
      <div class="${klass.join(" ")}">
        <h4 class="org-box__title">${escapeHtml(title)}</h4>
        ${memberHtml}
      </div>`;
  }

  function renderDocument(positions) {
    const commander = findCommander(positions);
    const deputyCadets =
      findByTitleHint(positions, ["Deputy Commander for Cadets"]) ||
      (commander
        ? positions.find(
            (p) => /deputy.*cadets?/i.test(p.title || "") && p.parent_id === commander.id
          )
        : null);

    const primary = rankPrimaryStaff(positions, commander?.id || null);
    primary.forEach((slot) => {
      if (slot.slot === "Deputy Commander for Cadets" && !slot.pos && deputyCadets) {
        slot.pos = deputyCadets;
      }
    });

    const cadetStack = gatherCadetStack(positions, deputyCadets?.id || null);

    const commanderHtml = `
      <div class="org-row org-row--commander">
        ${renderBox(commander, { command: true, placeholderTitle: "Commander" })}
      </div>
      <div class="org-connector-down" aria-hidden="true"></div>`;

    const staffHtml = `
      <div class="org-staff-row">
        ${primary
          .map((slot) => renderBox(slot.pos, { placeholderTitle: slot.slot }))
          .join("")}
      </div>`;

    const cadetHtml = cadetStack.length
      ? `
        <div class="org-cadet-stack">
          <p class="org-cadet-stack__heading">Cadet Programs</p>
          ${cadetStack.map((p) => renderBox(p)).join("")}
        </div>`
      : "";

    return `
      <article class="org-chart-doc" id="orgChartDoc">
        <header class="org-chart-doc__title">
          <h1>Oak Ridge Composite Squadron</h1>
          <h2>TN 170</h2>
          <h3>Table of Organization</h3>
          <p class="org-chart-doc__updated">Updated ${escapeHtml(safeNow())}</p>
        </header>
        ${commanderHtml}
        ${staffHtml}
        ${cadetHtml}
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
          console.warn("[orgchart-print] print failed", err);
        }
      }, 350);
    } catch {
      /* ignore */
    }
  }

  async function render() {
    const host = document.getElementById("orgChartPrintRoot");
    if (!host) return;
    host.innerHTML = `<p class="print-page__loading">Loading organization chart…</p>`;

    const positions = await fetchPositions();

    if (!positions.length) {
      host.innerHTML = renderDocument([]);
    } else {
      host.innerHTML = renderDocument(positions);
    }

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

  global.SMTN170OrgChartPrint = {
    init,
    render,
    renderDocument,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
