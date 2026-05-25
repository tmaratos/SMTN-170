/**
 * TN-170 portal — shared constants (roles, categories, Steward prompts).
 * Operational records load from Supabase per page.
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
    "Help build the squadron org chart",
    "Show vacant operational positions",
    "What positions are normally present in a CAP squadron?",
    "Help reorganize staff assignments",
  ];

  global.SMTN170_DATA = {
    ROLES,
    ACCOUNT_STATUS,
    FILE_CATEGORIES,
    STEWARD_PROMPTS,
    STEWARD_CAP_PROMPTS,
    STEWARD_ORG_PROMPTS,
  };
})(window);
