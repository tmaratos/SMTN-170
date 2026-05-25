/**
 * TN-170 portal — placeholder data layer.
 * Future: replace with Supabase queries (auth, profiles, files, readiness, Steward history).
 */
(function initPortalData(global) {
  const ROLES = {
    COMMANDER: { id: "commander", label: "Commander" },
    COMMAND_STAFF: { id: "command_staff", label: "Command Staff" },
    SENIOR_MEMBER: { id: "senior_member", label: "Senior Member" },
    PARENT: { id: "parent", label: "CAP Parent / Observer" },
    CADET_STAFF: { id: "cadet_staff", label: "Cadet Staff" },
    CADET: { id: "cadet", label: "Cadet" },
  };

  const MOCK_USER = {
    id: "user-demo-1",
    name: "Capt. M. Ellis",
    rank: "Capt",
    role: ROLES.SENIOR_MEMBER.id,
    unit: "TN-170 Oak Ridge Composite Squadron",
    email: "senior.member@example.com",
  };

  const READINESS_TASKS = {
    monthly: [
      { id: "m1", label: "Submit monthly activity report", status: "current", due: "2026-05-31" },
      { id: "m2", label: "Safety briefing logged", status: "current", due: "2026-05-12" },
      { id: "m3", label: "Update squadron calendar", status: "due_soon", due: "2026-05-08" },
      { id: "m4", label: "Staff meeting minutes filed", status: "needs_review", due: "2026-05-15" },
    ],
    annual: [
      { id: "a1", label: "Subordinate unit inspection prep", status: "due_soon", due: "2026-09-01" },
      { id: "a2", label: "Awards board documentation", status: "current", due: "2026-11-30" },
      { id: "a3", label: "Emergency services currency review", status: "current", due: "2026-12-31" },
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
    "What monthly tasks should our squadron complete?",
    "Help prepare a senior member meeting agenda.",
    "What inspection items should we check this month?",
    "Find Biannual Flight Review readiness items.",
    "Help categorize uploaded files.",
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
  };

  const STEWARD_PLACEHOLDER_RESPONSES = Object.values(STEWARD_RESPONSES);

  global.SMTN170_DATA = {
    ROLES,
    MOCK_USER,
    READINESS_TASKS,
    MISSION_READINESS,
    UPCOMING_MEETINGS,
    THIS_WEEK,
    FILE_CATEGORIES,
    STEWARD_PROMPTS,
    STEWARD_RESPONSES,
    STEWARD_PLACEHOLDER_RESPONSES,
  };
})(window);
