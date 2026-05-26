export const PARSER_VERSION = "2.0";

export const IMPORT_TYPES: Record<
  string,
  { label: string; target: string; table: string | null; href: string }
> = {
  meeting_schedule: {
    label: "Meeting schedule",
    target: "Calendar & Meetings",
    table: "meetings",
    href: "schedule.html",
  },
  cap_calendar: {
    label: "CAP calendar",
    target: "Calendar",
    table: "meetings",
    href: "calendar.html",
  },
  org_chart: {
    label: "Organization chart",
    target: "Organization Chart",
    table: "org_positions",
    href: "orgchart.html",
  },
  duty_assignments: {
    label: "Duty assignments",
    target: "Organization Chart",
    table: "org_positions",
    href: "orgchart.html",
  },
  senior_roster: {
    label: "Senior member roster",
    target: "Senior Member Workspace",
    table: null,
    href: "senior-member.html",
  },
  cadet_roster: {
    label: "Cadet roster",
    target: "Cadet Programs (reference)",
    table: null,
    href: "senior-member.html",
  },
  flight_review: {
    label: "Flight review tracker",
    target: "Flight Reviews",
    table: "flight_reviews",
    href: "flight-review.html",
  },
  inspection_checklist: {
    label: "Inspection checklist",
    target: "Inspection Prep",
    table: "inspection_items",
    href: "sui-readiness.html",
  },
  training_tracker: {
    label: "Training tracker",
    target: "Training (reference)",
    table: null,
    href: "documents.html",
  },
  task_list: {
    label: "Task list",
    target: "Tasks",
    table: "portal_tasks",
    href: "tasks.html",
  },
  reference_document: {
    label: "Reference document",
    target: "Files / CAP References",
    table: null,
    href: "documents.html",
  },
  needs_review: {
    label: "Needs review",
    target: "Import review",
    table: null,
    href: "documents.html",
  },
};

export function typeToTable(detectedType: string): string | null {
  const map: Record<string, string> = {
    org_chart: "org_positions",
    duty_assignments: "org_positions",
    meeting_schedule: "meetings",
    cap_calendar: "meetings",
    flight_review: "flight_reviews",
    inspection_checklist: "inspection_items",
    task_list: "portal_tasks",
  };
  return map[detectedType] ?? null;
}

export function ext(name: string): string {
  const p = (name || "").split(".");
  return p.length > 1 ? p.pop()!.toLowerCase() : "";
}
