create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  endpoint text not null,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  max_output_tokens integer not null default 0,
  input_chars integer not null default 0,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_feature_created_idx
  on public.ai_usage_events (user_id, feature, created_at desc);

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can view own AI usage events" on public.ai_usage_events;
create policy "Users can view own AI usage events"
  on public.ai_usage_events
  for select
  to authenticated
  using (auth.uid() = user_id);
