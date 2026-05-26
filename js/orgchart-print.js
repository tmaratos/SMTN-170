/**
 * TN-170 Organization Chart — print/PDF document renderer.
 *
 * Loads the latest org chart from Firestore and delegates rendering to the
 * SHARED renderer module `SMTN170ReportRenderers.renderOrgChartPrintView`
 * — so the builder Preview tab and this print view always look identical.
 *
 * Source priority:
 *   1. ?id=<docId>          → load that doc from `orgCharts`
 *   2. Most recent `orgCharts` doc (ordered by updatedAt)
 *   3. Legacy `orgPositions` directory (adapted into the new shape)
 *
 * Uses browser-native window.print() for "Save as PDF". No paid PDF libraries.
 */
(function initOrgChartPrint(global) {
  function R() {
    return global.SMTN170ReportRenderers;
  }

  const PLACEMENT_HINTS = {
    "deputy commander for cadets": "staff_row",
    safety: "staff_row",
    administration: "staff_row",
    "public affairs": "staff_row",
    finance: "staff_row",
    communications: "staff_row",
    "professional development": "staff_row",
    logistics: "staff_row",
  };

  function inferPlacement(pos) {
    const t = String(pos?.title || "").toLowerCase();
    const d = String(pos?.department || "").toLowerCase();
    if (/commander/.test(t) && !/deputy/.test(t)) return "commander";
    if (PLACEMENT_HINTS[t]) return PLACEMENT_HINTS[t];
    if (d === "cadet programs" || /aerospace education|fitness officer|cadet structure/i.test(t))
      return "cadet_branch";
    return "custom";
  }

  function adaptLegacyPosition(p, idx) {
    return {
      id: p.id || `legacy-${idx}`,
      memberName: p.assigned_member_name || p.assignedMemberName || "",
      title: p.title || "",
      department: p.department || "",
      reportsTo: p.parent_id || p.parentId || null,
      placement: inferPlacement(p),
      sortOrder: Number(p.sort_order || p.sortOrder || idx),
      status: p.status || (p.assigned_member_name || p.assignedMemberName ? "filled" : "vacant"),
      notes: p.notes || "",
    };
  }

  function adaptLegacyChart(rows) {
    const positions = (rows || []).map((p, i) => adaptLegacyPosition(p, i));
    return {
      title: "Table of Organization",
      squadronName: "Oak Ridge Composite Squadron",
      unitNumber: "TN 170",
      effectiveDate: new Date().toISOString().slice(0, 10),
      positions,
    };
  }

  async function fetchOrgChartReport(id) {
    const helper = global.SMTN170FirebaseData?.orgCharts?.();
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
      console.warn("[orgchart-print] orgCharts fetch", err);
      return null;
    }
  }

  async function fetchLegacyPositions() {
    const sb =
      global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb?.from) return [];
    try {
      const { data, error } = await sb
        .from("org_positions")
        .select("*")
        .order("sort_order");
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
    if (!R()) {
      host.innerHTML = `<p class="print-page__loading">Report renderer not loaded.</p>`;
      return;
    }
    host.innerHTML = `<p class="print-page__loading">Loading organization chart…</p>`;

    const params = new URLSearchParams(global.location?.search || "");
    const docId = params.get("id");

    let orgChart = await fetchOrgChartReport(docId);
    if (!orgChart) {
      const legacy = await fetchLegacyPositions();
      orgChart = legacy.length ? adaptLegacyChart(legacy) : R().defaultOrgChart();
    }

    host.innerHTML = R().renderOrgChartPrintView(orgChart);
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
    adaptLegacyChart,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
