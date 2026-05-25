-- Profile fields for SMTN-170 Senior Member portal

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists preferred_name text;
alter table public.profiles add column if not exists cap_id text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists duty_position text;
alter table public.profiles add column if not exists profile_photo_url text;

-- display_name kept for legacy reads; app computes on save

create policy "profiles_update_own_fields" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
