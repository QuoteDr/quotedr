-- Portal document activity log.
-- Public clients never query this table directly; they log through the client-document Edge Function.

create table if not exists public.portal_document_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portal_id uuid,
  document_id uuid not null references public.quotes(id) on delete cascade,
  portal_anchor_id uuid references public.quotes(id) on delete set null,
  event_type text not null check (
    event_type in (
      'document_opened',
      'document_view_duration',
      'pdf_opened',
      'payment_clicked',
      'signature_started',
      'document_signed',
      'document_rejected'
    )
  ),
  session_id text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portal_document_events_user_document_created_idx
  on public.portal_document_events (user_id, document_id, created_at desc);

create index if not exists portal_document_events_user_portal_created_idx
  on public.portal_document_events (user_id, portal_id, created_at desc);

create index if not exists portal_document_events_session_created_idx
  on public.portal_document_events (session_id, created_at desc);

alter table public.portal_document_events enable row level security;

revoke all on public.portal_document_events from anon, public;
grant select on public.portal_document_events to authenticated;
grant all on public.portal_document_events to service_role;

drop policy if exists "Contractors read own portal document events" on public.portal_document_events;
create policy "Contractors read own portal document events"
  on public.portal_document_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
