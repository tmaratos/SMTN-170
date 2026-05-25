/**
 * TN-170 portal — placeholder data layer.
 * Future: Supabase queries (auth.users + profiles, operational tables with audit columns).
 *
 * Security: roles do NOT hide operational pages. See docs/SUPABASE_SECURITY_MODEL.md
 */
(function initPortalData(global) {
  const ROLES = {
    COMMANDER: { id: "commander", label: "Commander" },
    COMMAND_STAFF: { id: "command_staff", label: "Command Staff" },
    SENIOR_MEMBER: { id: "senior_member", label: "Senior Member" },
    SENIOR_MEMBER_LIMITED: { id: "senior_member_limited", label: "Senior Member Limited" },
  };

  const ACCOUNT_STATUS = {
    AWAITING: "awaiting_verification",
    APPROVED: "approved",
  };

  function buildMockUser() {
    const session = global.SMTN170Auth?.loadSession?.();
    const profile = global.SMTN170Auth?.getProfile?.();
    if (session) {
      const displayName =
        global.SMTN170Profile?.computeDisplayName?.(profile || session) || session.displayName || session.email;
      return {
        id: session.userId,
        name: displayName,
        displayName,
        firstName: session.firstName || profile?.first_name || "",
        lastName: session.lastName || profile?.last_name || "",
        preferredName: session.preferredName || profile?.preferred_name || "",
        rank: session.rank || profile?.rank || "",
        role: session.role,
        roleLabel: session.roleLabel || global.SMTN170Auth?.getRoleLabel?.(session.role) || session.role,
        accountStatus: session.accountStatus,
        unit: session.unit,
        email: session.email,
      };
    }
    return null;
  }

  const PENDING_MEMBERS = [
    {
      id: "pending-1",
      email: "new.member@example.com",
      displayName: "1st Lt J. Reed",
      rank: "1st Lt",
      requestedAt: "2026-05-20T14:00:00Z",
    },
  ];

  const READINESS_TASKS = {
    monthly: [
      { id: "m1", label: "Submit monthly activity report", status: "current", due: "2026-05-31", last_worked_by_name: "Capt M. Ellis", last_worked_at: "2026-05-18T10:30:00Z" },
      { id: "m2", label: "Safety briefing logged", status: "current", due: "2026-05-12", last_worked_by_name: "Maj K. Shaw", last_worked_at: "2026-05-11T19:00:00Z" },
      { id: "m3", label: "Update squadron calendar", status: "due_soon", due: "2026-05-08", last_worked_by_name: "Capt M. Ellis", last_worked_at: "2026-05-07T08:15:00Z" },
      { id: "m4", label: "Staff meeting minutes filed", status: "needs_review", due: "2026-05-15", last_worked_by_name: "Capt M. Ellis", last_worked_at: "2026-05-14T16:45:00Z" },
    ],
    annual: [
      { id: "a1", label: "Subordinate unit inspection prep", status: "due_soon", due: "2026-09-01", last_worked_by_name: "Lt Col R. Grant", last_worked_at: "2026-05-10T11:00:00Z" },
      { id: "a2", label: "Awards board documentation", status: "current", due: "2026-11-30", last_worked_by_name: "Capt M. Ellis", last_worked_at: "2026-05-01T09:00:00Z" },
      { id: "a3", label: "Emergency services currency review", status: "current", due: "2026-12-31", last_worked_by_name: "Maj K. Shaw", last_worked_at: "2026-04-28T13:20:00Z" },
    ],
  };

  const MISSION_READINESS = {
    percent: 78,
    bfr: { label: "Flight Reviews", current: 3, dueSoon: 2, overdue: 1 },
    sui: { label: "Inspection Prep", percent: 72 },
    training: { label: "Training", status: "current" },
    safety: { label: "Safety", status: "due_soon" },
  };

  const THIS_WEEK = [
    "Weekly squadron meeting — check calendar for time and uniform.",
    "Update the squadron calendar if your meeting night changed.",
    "Safety briefing should be logged after this week's meeting.",
  ];

  const ANNOUNCEMENTS = [
    {
      id: "ann-1",
      date: "2026-05-01",
      title: "May meeting schedule is posted",
      body: "See the calendar for weekly meeting nights, uniform guidance, and training blocks.",
      created_by_name: "Capt M. Ellis",
      last_worked_by_name: "Capt M. Ellis",
      last_worked_at: "2026-05-01T12:00:00Z",
    },
    {
      id: "ann-2",
      date: "2026-04-28",
      title: "Safety briefing night — May 12",
      body: "Plan to log the squadron safety briefing after this week's meeting.",
      created_by_name: "Maj K. Shaw",
      last_worked_by_name: "Maj K. Shaw",
      last_worked_at: "2026-04-28T09:30:00Z",
    },
    {
      id: "ann-3",
      date: "2026-04-22",
      title: "Flight review sessions on the calendar",
      body: "Department review nights are marked on the squadron calendar.",
      created_by_name: "Lt Col R. Grant",
      last_worked_by_name: "Capt M. Ellis",
      last_worked_at: "2026-04-23T14:10:00Z",
    },
  ];

  const UPCOMING_MEETINGS = [
    { date: "2026-05-05", title: "Weekly Squadron Meeting", time: "1900–2100", loc: "Squadron Classroom" },
    { date: "2026-05-12", title: "Safety Briefing Night", time: "1900–2100", loc: "Squadron Classroom" },
    { date: "2026-05-14", title: "Safety — BFR session", time: "1830–2000", loc: "Squadron Classroom", tag: "BFR" },
    { date: "2026-05-19", title: "Red Ribbon Leadership Academy", time: "1900–2100", loc: "Squadron Classroom" },
  ];

  const FILE_CATEGORIES = [
    "Aerospace Education",
    "Emergency Services",
    "Safety",
    "Senior Member Training",
    "Cadet Programs",
    "Meeting Minutes",
    "Biannual Flight Review",
    "Inspection Prep",
    "Squadron Admin",
  ];

  const STEWARD_PROMPTS = [
    "Build next month's meeting schedule",
    "Show overdue flight reviews",
    "Prepare inspection readiness checklist",
    "Find latest uploaded safety files",
    "Help update the organization chart",
    "Show open inspection items",
  ];

  const STEWARD_CAP_PROMPTS = [
    "Find CAP regulations",
    "Search uniform standards",
    "Find inspection guidance",
    "Search aerospace education resources",
    "Find emergency services guidance",
    "Find safety resources",
  ];

  const STEWARD_ORG_PROMPTS = [
    "Help build the squadron org chart.",
    "Show vacant operational positions.",
    "Recommend org chart improvements.",
    "What positions are normally present in a CAP squadron?",
    "Help reorganize staff assignments.",
  ];

  const STEWARD_RESPONSES = {
    monthly:
      "This month, focus on the monthly activity report, safety briefing log, squadron calendar, and staff meeting minutes. Open Squadron Overview on the home page to see what is due.",
    agenda:
      "A simple senior member meeting can include: opening, safety moment, commander remarks, department updates, flight review update, training, and announcements. Save minutes under Files & Forms when approved.",
    inspection:
      "Inspection prep includes safety records, cadet protection, finances, vehicles, and department checklists. Use Inspection Prep in the menu to work through open items.",
    bfr:
      "Flight review items include department packets, scheduled review nights on the calendar, and any overdue paperwork. Open Flight Reviews in the menu for the full list.",
    files:
      "When you upload a file, Steward can suggest a folder category. Staff can change the category before filing. Check Files & Forms for uploads that need review.",
    orgchart:
      "A typical CAP composite squadron includes Commander, Deputy Commanders, and directors for Operations, Cadet Programs, AE, ES, Safety, Communications, Logistics, Admin, and Finance. Open Organization Chart to mark vacancies and acting assignments.",
    orgvacant:
      "Filter Organization Chart by “Show vacancies only” or use View Vacancies on the chart page. Assign members when you have a qualified senior member ready for the billet.",
    orgcap:
      "Standard senior staff billets align with CAPR organization — your wing may add assistant officers. Keep command positions at the top of the Command section; other departments can list officers flat until drag-and-drop hierarchy is enabled.",
  };

  const STEWARD_PLACEHOLDER_RESPONSES = Object.values(STEWARD_RESPONSES);

  global.SMTN170_DATA = {
    ROLES,
    ACCOUNT_STATUS,
    get MOCK_USER() {
      return buildMockUser();
    },
    PENDING_MEMBERS,
    READINESS_TASKS,
    MISSION_READINESS,
    UPCOMING_MEETINGS,
    ANNOUNCEMENTS,
    THIS_WEEK,
    FILE_CATEGORIES,
    STEWARD_PROMPTS,
    STEWARD_CAP_PROMPTS,
    STEWARD_ORG_PROMPTS,
    STEWARD_RESPONSES,
    STEWARD_PLACEHOLDER_RESPONSES,
  };

  Object.defineProperty(global.SMTN170_DATA, "MOCK_USER", {
    get: buildMockUser,
    enumerable: true,
  });
})(window);
