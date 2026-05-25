-- Steward Phase 1 — conversations + messages (run if not already created in Supabase)

create table if not exists public.steward_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists steward_conversations_profile_idx
  on public.steward_conversations (profile_id, updated_at desc);

create table if not exists public.steward_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.steward_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'steward')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists steward_chat_messages_convo_idx
  on public.steward_chat_messages (conversation_id, created_at);

alter table public.steward_conversations enable row level security;
alter table public.steward_chat_messages enable row level security;

create policy "steward_convo_select" on public.steward_conversations
  for select using (profile_id = auth.uid() and public.is_approved_member(auth.uid()));

create policy "steward_convo_insert" on public.steward_conversations
  for insert with check (profile_id = auth.uid() and public.is_approved_member(auth.uid()));

create policy "steward_convo_update" on public.steward_conversations
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "steward_msg_select" on public.steward_chat_messages
  for select using (profile_id = auth.uid());

create policy "steward_msg_insert" on public.steward_chat_messages
  for insert with check (
    profile_id = auth.uid()
    and public.is_approved_member(auth.uid())
    and exists (
      select 1 from public.steward_conversations c
      where c.id = conversation_id and c.profile_id = auth.uid()
    )
  );
