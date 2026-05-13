create table if not exists public.labor_job_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  quote_number text not null default '',
  client_name text not null default '',
  name text not null,
  address text not null default '',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geofence_radius_m integer not null default 75 check (geofence_radius_m between 25 and 1000),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists labor_job_sites_user_active_idx
  on public.labor_job_sites (user_id, active, updated_at desc);

create index if not exists labor_job_sites_quote_idx
  on public.labor_job_sites (quote_id)
  where quote_id is not null;

create table if not exists public.labor_time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_site_id uuid not null references public.labor_job_sites(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'gps', 'import', 'adjusted')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  worker_name text not null default '',
  notes text not null default '',
  raw_location jsonb not null default '{}'::jsonb,
  review_notes text not null default '',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_time_sessions_time_check check (ended_at is null or ended_at >= started_at)
);

create index if not exists labor_time_sessions_user_started_idx
  on public.labor_time_sessions (user_id, started_at desc);

create index if not exists labor_time_sessions_job_started_idx
  on public.labor_time_sessions (job_site_id, started_at desc);

create index if not exists labor_time_sessions_review_idx
  on public.labor_time_sessions (user_id, status, started_at desc);

alter table public.labor_job_sites enable row level security;
alter table public.labor_time_sessions enable row level security;

drop policy if exists "Users can manage own labor job sites" on public.labor_job_sites;
create policy "Users can manage own labor job sites"
  on public.labor_job_sites
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own labor time sessions" on public.labor_time_sessions;
create policy "Users can manage own labor time sessions"
  on public.labor_time_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
