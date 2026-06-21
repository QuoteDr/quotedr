create table if not exists public.app_broadcast_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null,
  message_type text not null default 'info'
    check (message_type in ('info', 'maintenance', 'promo', 'warning', 'thank_you')),
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  show_mode text not null default 'once'
    check (show_mode in ('once', 'until_date', 'until_off')),
  cta_label text not null default '',
  cta_url text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_broadcast_receipts (
  message_id uuid not null references public.app_broadcast_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shown_count integer not null default 0 check (shown_count >= 0),
  last_shown_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists app_broadcast_messages_status_time_idx
  on public.app_broadcast_messages(status, starts_at, ends_at, created_at desc);

create index if not exists app_broadcast_receipts_user_idx
  on public.app_broadcast_receipts(user_id, dismissed_at);

alter table public.app_broadcast_messages enable row level security;
alter table public.app_broadcast_receipts enable row level security;

grant select, insert, update, delete on table public.app_broadcast_messages to authenticated;
grant select, insert, update, delete on table public.app_broadcast_receipts to authenticated;

drop policy if exists "Admin can manage broadcast messages" on public.app_broadcast_messages;
create policy "Admin can manage broadcast messages"
  on public.app_broadcast_messages
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca');

drop policy if exists "Users can view active broadcast messages" on public.app_broadcast_messages;
create policy "Users can view active broadcast messages"
  on public.app_broadcast_messages
  for select
  to authenticated
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "Users can view own broadcast receipts" on public.app_broadcast_receipts;
create policy "Users can view own broadcast receipts"
  on public.app_broadcast_receipts
  for select
  to authenticated
  using (auth.uid() = user_id or lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca');

drop policy if exists "Users can insert own broadcast receipts" on public.app_broadcast_receipts;
create policy "Users can insert own broadcast receipts"
  on public.app_broadcast_receipts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own broadcast receipts" on public.app_broadcast_receipts;
create policy "Users can update own broadcast receipts"
  on public.app_broadcast_receipts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
