create table public.labor_web_push_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  subscription jsonb,
  reminder_time time not null default '17:30' check (reminder_time >= time '08:00' and reminder_time < time '20:00'),
  timezone text not null default 'America/Toronto',
  weekends boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not enabled or subscription is not null)
);
create unique index labor_web_push_active_endpoint on public.labor_web_push_settings ((subscription->>'endpoint')) where enabled;
alter table public.labor_web_push_settings enable row level security;
revoke all on public.labor_web_push_settings from public, anon, authenticated;
grant select on public.labor_web_push_settings to authenticated;
grant all on public.labor_web_push_settings to service_role;
create policy own_reminder_settings on public.labor_web_push_settings for select to authenticated using (user_id = (select auth.uid()));

create table public.labor_web_push_tests (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, bucket)
);
alter table public.labor_web_push_tests enable row level security;
revoke all on public.labor_web_push_tests from public, anon, authenticated;
grant all on public.labor_web_push_tests to service_role;
-- No schedule is activated by this migration. See docs/LABOUR-PUSH-SETUP.md.
