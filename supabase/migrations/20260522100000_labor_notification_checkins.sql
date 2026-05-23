-- Daily labor reminder/check-in foundation.
--
-- The mobile app stores a push token in labor_devices. This schema stores
-- each user's notification schedule, sent logs, daily check-ins, and the
-- learned production rates that power future timeline estimates.

create table if not exists public.labor_notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  morning_enabled boolean not null default true,
  evening_enabled boolean not null default true,
  timezone text not null default 'America/Toronto',
  morning_time time not null default '08:00',
  evening_time time not null default '17:30',
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.labor_devices(id) on delete set null,
  notification_type text not null check (notification_type in ('morning', 'evening')),
  local_date date not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists labor_notification_logs_user_type_date_idx
  on public.labor_notification_logs (user_id, notification_type, local_date);

create index if not exists labor_notification_logs_user_created_idx
  on public.labor_notification_logs (user_id, created_at desc);

create table if not exists public.labor_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.labor_devices(id) on delete set null,
  checkin_date date not null,
  job_site_id uuid references public.labor_job_sites(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  item_category text not null default '',
  item_name text not null,
  item_unit text not null default '',
  quantity numeric(12, 2) not null check (quantity > 0),
  hours numeric(8, 2) not null check (hours > 0),
  units_per_hour numeric(12, 4) not null check (units_per_hour > 0),
  notes text not null default '',
  source text not null default 'mobile_daily_prompt' check (source in ('mobile_daily_prompt', 'manual', 'import')),
  raw_payload jsonb not null default '{}'::jsonb,
  reviewed boolean not null default false,
  applied_to_saved_item boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists labor_daily_checkins_user_date_idx
  on public.labor_daily_checkins (user_id, checkin_date desc, created_at desc);

create index if not exists labor_daily_checkins_item_idx
  on public.labor_daily_checkins (user_id, item_category, item_name);

create table if not exists public.labor_item_production_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  item_category text not null default '',
  item_name text not null,
  item_unit text not null default '',
  units_per_hour numeric(12, 4) not null check (units_per_hour > 0),
  sample_count integer not null default 1 check (sample_count > 0),
  total_quantity numeric(14, 2) not null default 0 check (total_quantity >= 0),
  total_hours numeric(10, 2) not null default 0 check (total_hours >= 0),
  last_checkin_id uuid references public.labor_daily_checkins(id) on delete set null,
  last_checkin_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists labor_item_production_rates_user_updated_idx
  on public.labor_item_production_rates (user_id, updated_at desc);

alter table public.labor_notification_settings enable row level security;
alter table public.labor_notification_logs enable row level security;
alter table public.labor_daily_checkins enable row level security;
alter table public.labor_item_production_rates enable row level security;

drop policy if exists "Users can manage own labor notification settings" on public.labor_notification_settings;
create policy "Users can manage own labor notification settings"
  on public.labor_notification_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own labor notification logs" on public.labor_notification_logs;
create policy "Users can read own labor notification logs"
  on public.labor_notification_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own labor daily checkins" on public.labor_daily_checkins;
create policy "Users can manage own labor daily checkins"
  on public.labor_daily_checkins
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own labor production rates" on public.labor_item_production_rates;
create policy "Users can manage own labor production rates"
  on public.labor_item_production_rates
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'invoke-labor-notification-dispatch'
  ) then
    perform cron.unschedule('invoke-labor-notification-dispatch');
  end if;
end $$;

select cron.schedule(
  'invoke-labor-notification-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://axmoffknvblluibuitrq.supabase.co/functions/v1/labor-notification-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'QuoteDr Supabase Cron'
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'job', 'invoke-labor-notification-dispatch',
      'scheduled_at', now()
    )
  ) as request_id;
  $$
);
