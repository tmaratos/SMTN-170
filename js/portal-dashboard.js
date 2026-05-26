/**
 * TN-170 dashboard — Firebase-backed summary for the home workspace.
 */
(function initPortalDashboard(global) {
  function mapMeeting(row) {
    return {
      id: row.id,
      date: row.meeting_date,
      title: row.title,
      time: row.meeting_time || "",
      loc: row.location || "",
      tag: row.status === "planned" ? "" : row.status,
    };
  }

  function mapTaskAttention(row) {
    const status = row.status === "due_soon" ? "due_soon" : row.status === "needs_review" ? "needs_review" : row.status === "open" ? "due_soon" : row.status;
    return {
      id: row.id,
      label: row.title,
      status,
      due: row.due_date,
      last_worked_by_name: null,
      last_worked_at: row.last_worked_at,
    };
  }

  async function fetchSummary() {
    const sb = global.TN170FirebaseClient || global.SMTN170Firebase?.getClient?.();
    if (!sb) {
      return {
        configured: false,
        meetings: [],
        attention: [],
        flightReviews: { current: 0, dueSoon: 0, overdue: 0, total: 0 },
        inspection: { open: 0, total: 0 },
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    const [meetingsRes, tasksRes, frRes, inspRes] = await Promise.all([
      sb
        .from("meetings")
        .select("id, title, meeting_date, meeting_time, location, status")
        .gte("meeting_date", today)
        .order("meeting_date", { ascending: true })
        .limit(6),
      sb
        .from("portal_tasks")
        .select("id, title, status, due_date, last_worked_at")
        .neq("status", "completed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(8),
      sb.from("flight_reviews").select("id, status"),
      sb.from("inspection_items").select("id, status").neq("status", "completed"),
    ]);

    const meetings = (meetingsRes.data || []).map(mapMeeting);
    const attention = (tasksRes.data || [])
      .filter((t) => ["open", "due_soon"].includes(t.status))
      .map(mapTaskAttention);

    const frRows = frRes.data || [];
    const flightReviews = {
      current: frRows.filter((r) => r.status === "current").length,
      dueSoon: frRows.filter((r) => r.status === "due_soon" || r.status === "needs_review").length,
      overdue: frRows.filter((r) => r.status === "overdue").length,
      total: frRows.length,
    };

    const inspRows = inspRes.data || [];
    const inspection = { open: inspRows.length, total: inspRows.length };

    return {
      configured: true,
      meetings,
      attention,
      flightReviews,
      inspection,
    };
  }

  global.SMTN170Dashboard = { fetchSummary };
})(window);
