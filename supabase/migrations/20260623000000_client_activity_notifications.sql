create table if not exists public.client_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_on_viewed boolean not null default false,
  email_on_accepted boolean not null default true,
  email_on_declined boolean not null default true,
  email_on_note boolean not null default true,
  email_to text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.quotes(id) on delete cascade,
  document_type text not null default 'quote',
  event_type text not null
    check (event_type in ('viewed', 'accepted', 'approved', 'declined', 'note_added', 'payment_started', 'payment_paid')),
  client_name text not null default '',
  client_email text not null default '',
  quote_number text not null default '',
  document_title text not null default '',
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  email_sent_at timestamptz,
  email_error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists client_activity_events_user_created_idx
  on public.client_activity_events(user_id, created_at desc);

create index if not exists client_activity_events_document_event_idx
  on public.client_activity_events(document_id, event_type, created_at desc);

alter table public.client_notification_preferences enable row level security;
alter table public.client_activity_events enable row level security;

grant select, insert, update on table public.client_notification_preferences to authenticated;
grant select, update on table public.client_activity_events to authenticated;

drop policy if exists "Users can manage own client notification preferences" on public.client_notification_preferences;
create policy "Users can manage own client notification preferences"
  on public.client_notification_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own client activity events" on public.client_activity_events;
create policy "Users can view own client activity events"
  on public.client_activity_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update own client activity events" on public.client_activity_events;
create policy "Users can update own client activity events"
  on public.client_activity_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
