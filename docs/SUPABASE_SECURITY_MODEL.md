# TN-170 Portal — Supabase Security Model

**SMTN-170 Oak Ridge Composite Squadron · Senior Member management portal**

This document defines access control for the squadron portal. The portal is for **approved Senior Members only**. Roles do **not** hide normal operational pages.

---

## Principles

1. **Login / authentication** controls who may enter the portal at all.
2. **Account approval** (`account_status`) controls whether a signed-in user sees the shared workspace or a pending-approval screen.
3. **Once approved**, every Senior Member sees the **same operational workspace** (meetings, calendar, files, flight reviews, inspection prep, CAP references, Steward, etc.).
4. **Roles** are for identity, UI labels, audit attribution, Steward context, and **admin tooling** — not for hiding standard pages from normal users.
5. **Dangerous actions** are restricted to **Commander** and **Command Staff** only.

There are **no cadet roles**, **no parent roles**, and **no separate cadet/parent portal areas** in this product.

---

## Account status

| Status | Portal experience |
|--------|-------------------|
| `awaiting_verification` | Pending approval page only (no workspace) |
| `approved` | Full shared Senior Member workspace |

Approval is performed by Commander or Command Staff via admin tools.

---

## Roles (identity only — not page ACLs)

| Role ID | Label | Notes |
|---------|-------|--------|
| `commander` | Commander | Admin actions allowed |
| `command_staff` | Command Staff | Admin actions allowed |
| `senior_member` | Senior Member | Full workspace; standard operations |
| `senior_member_limited` | Senior Member Limited | Full workspace; same visibility as Senior Member (role label for wing/unit policy) |
| `awaiting_verification` | Awaiting Verification | Used until approved; should not reach workspace |

**Do not use roles to hide:** meetings, files, flight reviews, inspection prep, schedules, CAP references, Steward, or other normal operational modules from approved users.

---

## What is shared (all approved users)

- Home / dashboard  
- Calendar & meeting planner  
- Files & forms  
- Flight reviews  
- Inspection prep  
- Squadron overview / readiness views  
- CAP references  
- Steward for CAP  
- Profile & personal Steward history  
- Organization chart (staff positions & assignments)  

---

## Admin-only actions (Commander + Command Staff)

Restricted via RLS + app checks — **not** by hiding nav items alone:

| Action | Description |
|--------|-------------|
| `approve_users` | Approve or deny portal access requests |
| `change_roles` | Assign or change member role labels |
| `delete_records` | Hard-delete squadron records |
| `global_settings` | Portal-wide settings, categories, announcements config |
| `supabase_config` | Supabase-connected configuration (keys, webhooks, integrations) |

All other create/update operations on operational data are available to **any approved** user, with audit metadata captured.

---

## Record metadata (audit trail)

Shared records should store attribution fields (Supabase `profiles` FK where noted):

| Field | Purpose |
|-------|---------|
| `created_at` | Row creation timestamp |
| `updated_at` | Last modification timestamp |
| `created_by` | Profile ID of creator |
| `updated_by` | Profile ID of last editor |
| `last_worked_by` | Profile ID of last person who opened/saved (UX “Last worked by”) |
| `last_worked_at` | Timestamp for last worked |
| `assigned_to` | Optional assignee for tasks/items |
| `reviewed_by` | Optional reviewer (e.g. inspection sign-off) |
| `completed_by` | Optional completer |

**UI requirement:** Show “Last worked by {rank name} · {relative time}” on shared records where applicable.

---

## Supabase tables (reference)

### `profiles`

- `id` (uuid, PK, matches `auth.users.id`)
- `email`, `rank`, `display_name`
- `role` — enum: commander, command_staff, senior_member, senior_member_limited
- `account_status` — enum: awaiting_verification, approved
- `approved_at`, `approved_by`
- `created_at`, `updated_at`

### Operational tables (examples)

Apply metadata columns to: `meetings`, `schedules`, `files`, `flight_review_items`, `inspection_items`, `announcements`, etc.

---

## RLS policy pattern

```text
-- Portal entry: authenticated + approved profile
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.account_status = 'approved'
  )
)

-- Admin-only writes (example)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('commander', 'command_staff')
    AND p.account_status = 'approved'
  )
)

-- Operational writes: any approved user
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.account_status = 'approved'
  )
)
```

**Do not** write RLS policies that filter rows by `role` for standard operational SELECT on meetings, files, BFR, SUI, etc.

---

## Steward

- Available to all **approved** users.
- Chat history stored per `profile_id`.
- Role may tune prompt context (e.g. Commander vs Senior Member) but does **not** block access.

---

## Frontend auth

See `js/portal-auth.js` for Supabase session, route guards, and admin capability checks. Only `login.html` is public; all operational pages require an approved profile.

---

*Built by Faith Based Innovations · Steward for CAP · TN-170*
