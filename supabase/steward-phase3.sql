-- Steward Phase 3 — server-side brain (Edge Function) support

alter table public.steward_conversations
  add column if not exists pending_action jsonb;

comment on column public.steward_conversations.pending_action is
  'Steward pending sensitive/destructive action awaiting user confirmation';
