-- TN-170 SMTN-170 Portal — Supabase schema reference (not executed by static site)
-- Senior Member management portal · roles do NOT gate operational page visibility

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

-- create type account_status as enum ('awaiting_verification', 'approved');
-- create type member_role as enum (
--   'commander',
--   'command_staff',
--   'senior_member',
--   'senior_member_limited'
-- );

-- ---------------------------------------------------------------------------
-- PROFILES (extends auth.users)
-- ---------------------------------------------------------------------------

-- create table profiles (
--   id uuid primary key references auth.users(id) on delete cascade,
--   email text not null,
--   rank text,
--   display_name text not null,
--   role member_role not null default 'senior_member',
--   account_status account_status not null default 'awaiting_verification',
--   approved_at timestamptz,
--   approved_by uuid references profiles(id),
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );

-- ---------------------------------------------------------------------------
-- AUDIT COLUMNS (add to operational tables)
-- created_by, updated_by, last_worked_by, assigned_to, reviewed_by, completed_by
-- created_at, updated_at, last_worked_at
-- ---------------------------------------------------------------------------

-- Example: squadron_files
-- create table squadron_files (
--   id uuid primary key default gen_random_uuid(),
--   title text not null,
--   category text not null,
--   storage_path text,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(),
--   created_by uuid not null references profiles(id),
--   updated_by uuid references profiles(id),
--   last_worked_by uuid references profiles(id),
--   last_worked_at timestamptz,
--   assigned_to uuid references profiles(id),
--   reviewed_by uuid references profiles(id),
--   completed_by uuid references profiles(id)
-- );

-- ---------------------------------------------------------------------------
-- ORG POSITIONS (squadron organization chart)
-- All approved Senior Members: SELECT + INSERT + UPDATE (shared staff tool)
-- DELETE: optional admin-only policy in production
-- ---------------------------------------------------------------------------

-- create type org_position_status as enum ('filled', 'vacant', 'acting');

-- create table org_positions (
--   id uuid primary key default gen_random_uuid(),
--   squadron_id uuid, -- optional multi-unit future
--   title text not null,
--   department text not null,
--   parent_id uuid references org_positions(id) on delete set null,
--   sort_order int not null default 0,
--   assigned_member_name text,
--   assigned_profile_id uuid references profiles(id),
--   status org_position_status not null default 'vacant',
--   is_command boolean not null default false,
--   responsibilities text,
--   notes text,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(),
--   created_by uuid references profiles(id),
--   updated_by uuid references profiles(id),
--   last_worked_by uuid references profiles(id),
--   last_worked_at timestamptz
-- );

-- create index org_positions_department_idx on org_positions (department);
-- create index org_positions_parent_idx on org_positions (parent_id);

-- Future: org_chart_snapshots (history, PDF export)
-- create table org_chart_snapshots (
--   id uuid primary key default gen_random_uuid(),
--   label text not null,
--   snapshot_json jsonb not null,
--   created_at timestamptz not null default now(),
--   created_by uuid references profiles(id)
-- );

-- alter table org_positions enable row level security;
-- create policy "approved_select_org_positions" on org_positions for select using (public.is_approved_member(auth.uid()));
-- create policy "approved_insert_org_positions" on org_positions for insert with check (public.is_approved_member(auth.uid()));
-- create policy "approved_update_org_positions" on org_positions for update using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: APPROVED USERS READ/WRITE OPERATIONAL DATA (same visibility for all roles)
-- ---------------------------------------------------------------------------

-- alter table squadron_files enable row level security;

-- create policy "approved_select_files"
--   on squadron_files for select
--   using (public.is_approved_member(auth.uid()));

-- create policy "approved_insert_files"
--   on squadron_files for insert
--   with check (public.is_approved_member(auth.uid()));

-- create policy "approved_update_files"
--   on squadron_files for update
--   using (public.is_approved_member(auth.uid()))
--   with check (public.is_approved_member(auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: ADMIN-ONLY (commander + command_staff)
-- ---------------------------------------------------------------------------

-- create policy "admin_delete_files"
--   on squadron_files for delete
--   using (public.is_admin_member(auth.uid()));

-- Helper functions (security definer, set search_path):
-- create function is_approved_member(uid uuid) returns boolean ...
-- create function is_admin_member(uid uuid) returns boolean
--   role in ('commander','command_staff') and account_status = 'approved'
