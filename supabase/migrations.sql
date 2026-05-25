-- SMTN-170 Portal — run in Supabase SQL Editor
-- Shared workspace: approved members read/write operational data

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  preferred_name text,
  rank text,
  cap_id text,
  phone text,
  duty_position text,
  profile_photo_url text,
  display_name text not null default '',
  role text not null default 'senior_member'
    check (role in ('commander', 'command_staff', 'senior_member', 'senior_member_limited')),
  account_status text not null default 'awaiting_verification'
    check (account_status in ('awaiting_verification', 'approved')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ORG POSITIONS
-- ---------------------------------------------------------------------------
create table if not exists public.org_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  parent_id uuid references public.org_positions(id) on delete set null,
  sort_order int not null default 0,
  assigned_member_name text,
  assigned_profile_id uuid references public.profiles(id),
  status text not null default 'vacant'
    check (status in ('filled', 'vacant', 'acting')),
  is_command boolean not null default false,
  responsibilities text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- STEWARD CHAT
-- ---------------------------------------------------------------------------
create table if not exists public.steward_chat (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'steward')),
  message text not null,
  context text,
  created_at timestamptz not null default now()
);

create index if not exists steward_chat_profile_idx on public.steward_chat (profile_id, created_at);

-- ---------------------------------------------------------------------------
-- SCHEDULES
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  template_name text not null default 'Monthly Meeting Schedule',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz,
  unique (month_key)
);

-- ---------------------------------------------------------------------------
-- UPLOADED FILES (metadata; binaries in storage bucket squadron-files)
-- ---------------------------------------------------------------------------
create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  folder text not null default 'General',
  storage_path text not null,
  mime_type text,
  size_bytes bigint default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id),
  last_worked_by uuid references public.profiles(id),
  last_worked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_member(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.account_status = 'approved'
  );
$$;

create or replace function public.is_admin_member(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.account_status = 'approved'
      and p.role in ('commander', 'command_staff')
  );
$$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, account_status)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    'awaiting_verification'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.org_positions enable row level security;
alter table public.steward_chat enable row level security;
alter table public.schedules enable row level security;
alter table public.uploaded_files enable row level security;

-- Profiles: users read own; approved read all; update own
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_select_approved" on public.profiles for select using (public.is_approved_member(auth.uid()));
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Operational tables: approved members
create policy "org_select" on public.org_positions for select using (public.is_approved_member(auth.uid()));
create policy "org_insert" on public.org_positions for insert with check (public.is_approved_member(auth.uid()));
create policy "org_update" on public.org_positions for update using (public.is_approved_member(auth.uid()));
create policy "org_delete" on public.org_positions for delete using (public.is_admin_member(auth.uid()));

create policy "steward_select" on public.steward_chat for select using (profile_id = auth.uid());
create policy "steward_insert" on public.steward_chat for insert with check (profile_id = auth.uid() and public.is_approved_member(auth.uid()));

create policy "schedules_select" on public.schedules for select using (public.is_approved_member(auth.uid()));
create policy "schedules_all" on public.schedules for all using (public.is_approved_member(auth.uid())) with check (public.is_approved_member(auth.uid()));

create policy "files_select" on public.uploaded_files for select using (public.is_approved_member(auth.uid()));
create policy "files_insert" on public.uploaded_files for insert with check (public.is_approved_member(auth.uid()));
create policy "files_update" on public.uploaded_files for update using (public.is_approved_member(auth.uid()));
create policy "files_delete" on public.uploaded_files for delete using (public.is_admin_member(auth.uid()));

-- Storage bucket policies (create bucket "squadron-files" in dashboard first)
-- insert into storage.buckets (id, name, public) values ('squadron-files', 'squadron-files', false);
