create table if not exists public.labor_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  device_name text not null default '',
  push_token text,
  tracking_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  app_version text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create index if not exists labor_devices_user_updated_idx
  on public.labor_devices (user_id, updated_at desc);

create table if not exists public.labor_location_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.labor_devices(id) on delete set null,
  device_key text not null default '',
  job_site_id uuid references public.labor_job_sites(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  event_type text not null check (event_type in ('enter', 'exit', 'dwell', 'permission', 'sync', 'error')),
  transition_source text not null default 'android_geofence',
  occurred_at timestamptz not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  accuracy_m numeric(8, 2),
  raw_payload jsonb not null default '{}'::jsonb,
  processed_session_id uuid references public.labor_time_sessions(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists labor_location_events_idempotency_idx
  on public.labor_location_events (user_id, device_key, job_site_id, event_type, occurred_at);

create index if not exists labor_location_events_user_occurred_idx
  on public.labor_location_events (user_id, occurred_at desc);

create index if not exists labor_location_events_site_occurred_idx
  on public.labor_location_events (job_site_id, occurred_at desc)
  where job_site_id is not null;

alter table public.labor_devices enable row level security;
alter table public.labor_location_events enable row level security;

drop policy if exists "Users can manage own labor devices" on public.labor_devices;
create policy "Users can manage own labor devices"
  on public.labor_devices
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own labor location events" on public.labor_location_events;
create policy "Users can manage own labor location events"
  on public.labor_location_events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
