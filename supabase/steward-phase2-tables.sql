-- Steward Phase 2 — operational tables + audit log (run in Supabase SQL Editor)
-- Shared workspace: approved members read/write; deletes on files/meetings admin-only where noted

-- ---------------------------------------------------------------------------
-- MEETINGS
-- ---------------------------------------------------------------------------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  meeting_time text,
  location text,
  uniform text,
  notes text,
  agenda_draft text,
  status text not null default 'planned'
    check (status in ('draft', 'planned', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

create index if not exists meetings_date_idx on public.meetings (meeting_date);

-- ---------------------------------------------------------------------------
-- PORTAL TASKS
-- ---------------------------------------------------------------------------
create table if not exists public.portal_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'due_soon', 'completed', 'cancelled')),
  due_date date,
  priority text default 'normal',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

create index if not exists portal_tasks_status_idx on public.portal_tasks (status, due_date);

-- ---------------------------------------------------------------------------
-- FLIGHT REVIEWS
-- ---------------------------------------------------------------------------
create table if not exists public.flight_reviews (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  status text not null default 'current'
    check (status in ('current', 'due_soon', 'overdue', 'scheduled', 'completed', 'needs_review')),
  last_review_date date,
  next_review_due_date date,
  assigned_reviewer text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- INSPECTION ITEMS (SUI prep)
-- ---------------------------------------------------------------------------
create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  work_unit text,
  status text not null default 'open'
    check (status in ('open', 'due_soon', 'completed', 'needs_review')),
  due_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

create index if not exists inspection_items_status_idx on public.inspection_items (status, due_date);

-- ---------------------------------------------------------------------------
-- AUDIT LOG (Steward + portal writes)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meetings enable row level security;
alter table public.portal_tasks enable row level security;
alter table public.flight_reviews enable row level security;
alter table public.inspection_items enable row level security;
alter table public.audit_log enable row level security;

create policy "meetings_select" on public.meetings for select using (public.is_approved_member(auth.uid()));
create policy "meetings_write" on public.meetings for all using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

create policy "tasks_select" on public.portal_tasks for select using (public.is_approved_member(auth.uid()));
create policy "tasks_write" on public.portal_tasks for all using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

create policy "fr_select" on public.flight_reviews for select using (public.is_approved_member(auth.uid()));
create policy "fr_write" on public.flight_reviews for all using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

create policy "insp_select" on public.inspection_items for select using (public.is_approved_member(auth.uid()));
create policy "insp_write" on public.inspection_items for all using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

create policy "audit_select" on public.audit_log for select using (public.is_approved_member(auth.uid()));
create policy "audit_insert" on public.audit_log for insert with check (actor_id = auth.uid() and public.is_approved_member(auth.uid()));
