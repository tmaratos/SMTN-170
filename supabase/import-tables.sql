-- TN-170 Smart Import — run in Supabase SQL Editor after core portal tables exist.
-- Stores parsed content and import job audit trail.

create table if not exists public.parsed_documents (
  id uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references public.uploaded_files(id) on delete cascade,
  extracted_text text,
  extracted_json jsonb not null default '{}'::jsonb,
  parser_version text not null default '1.0',
  created_at timestamptz not null default now()
);

create index if not exists parsed_documents_file_idx on public.parsed_documents (uploaded_file_id, created_at desc);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references public.uploaded_files(id) on delete cascade,
  detected_type text not null default 'needs_review',
  target_type text,
  confidence numeric(5,4) default 0,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'completed', 'failed', 'needs_review')),
  error_message text,
  record_count int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists import_jobs_file_idx on public.import_jobs (uploaded_file_id, created_at desc);
create index if not exists import_jobs_status_idx on public.import_jobs (status, created_at desc);

-- Optional metadata on uploaded_files (safe if columns already exist)
alter table public.uploaded_files add column if not exists upload_area text;
alter table public.uploaded_files add column if not exists file_type text;

alter table public.parsed_documents enable row level security;
alter table public.import_jobs enable row level security;

drop policy if exists "parsed_documents_approved_rw" on public.parsed_documents;
create policy "parsed_documents_approved_rw" on public.parsed_documents
  for all using (public.is_approved_member(auth.uid()))
  with check (public.is_approved_member(auth.uid()));

drop policy if exists "import_jobs_approved_rw" on public.import_jobs;
create policy "import_jobs_approved_rw" on public.import_jobs
  for all using (public.is_approved_member(auth.uid()))
  with check (public.is_approved_member(auth.uid()));
