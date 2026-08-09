-- Secure inbound support intake. Raw customer messages never enter the
-- coordinator inbox; browser roles have no table or function access.

alter table public.ai_support_cases
  add column if not exists intake_key text,
  add column if not exists agent_status text not null default 'not_requested'
    check (agent_status in ('not_requested', 'unavailable', 'mock', 'completed', 'failed')),
  add column if not exists agent_assessment jsonb not null default '{}'::jsonb
    check (jsonb_typeof(agent_assessment) = 'object');

create unique index if not exists ai_support_cases_intake_key_unique
  on public.ai_support_cases(intake_key)
  where intake_key is not null;

create table if not exists public.ai_support_raw_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.ai_support_cases(id) on delete cascade,
  source text not null check (source in ('email', 'in_app_feedback')),
  provider text not null check (char_length(trim(provider)) between 1 and 80),
  provider_message_id text not null check (char_length(trim(provider_message_id)) between 1 and 500),
  provider_thread_id text not null default '' check (char_length(provider_thread_id) <= 500),
  in_reply_to text not null default '' check (char_length(in_reply_to) <= 500),
  reference_ids text[] not null default array[]::text[] check (cardinality(reference_ids) <= 40),
  recipient_address text not null default '' check (char_length(recipient_address) <= 320),
  sender_email text not null default '' check (char_length(sender_email) <= 320),
  sender_display_name text not null default '' check (char_length(sender_display_name) <= 160),
  subject text not null default '' check (char_length(subject) <= 500),
  received_at timestamptz,
  body_plaintext text not null default '' check (char_length(body_plaintext) <= 120000),
  body_sanitized_html text not null default '' check (char_length(body_sanitized_html) <= 160000),
  quoted_text text not null default '' check (char_length(quoted_text) <= 120000),
  attachment_metadata jsonb not null default '[]'::jsonb check (jsonb_typeof(attachment_metadata) = 'array'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  purge_after timestamptz not null default (now() + interval '90 days'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_message_id)
);

create table if not exists public.ai_support_intake_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_key text not null unique check (char_length(trim(delivery_key)) between 1 and 600),
  source text not null check (source in ('email', 'in_app_feedback')),
  provider text not null check (char_length(trim(provider)) between 1 and 80),
  provider_message_id text not null check (char_length(trim(provider_message_id)) between 1 and 500),
  provider_thread_id text not null default '' check (char_length(provider_thread_id) <= 500),
  state text not null default 'received' check (state in ('received', 'processed', 'duplicate', 'retry_required', 'dead_letter')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 20),
  last_error_code text not null default '' check (char_length(last_error_code) <= 120),
  case_id uuid references public.ai_support_cases(id) on delete set null,
  raw_message_id uuid references public.ai_support_raw_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_support_agent_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.ai_support_cases(id) on delete cascade,
  raw_message_id uuid references public.ai_support_raw_messages(id) on delete set null,
  adapter_version text not null check (adapter_version = 'support-agent/v1'),
  mode text not null check (mode in ('unavailable', 'mock', 'live')),
  status text not null check (status in ('unavailable', 'completed', 'failed')),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  failure_code text not null default '' check (char_length(failure_code) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists ai_support_raw_messages_case_idx on public.ai_support_raw_messages(case_id, created_at desc);
create index if not exists ai_support_raw_messages_purge_idx on public.ai_support_raw_messages(purge_after) where deleted_at is null;
create index if not exists ai_support_intake_deliveries_state_idx on public.ai_support_intake_deliveries(state, updated_at);
create index if not exists ai_support_agent_runs_case_idx on public.ai_support_agent_runs(case_id, created_at desc);

alter table public.ai_support_raw_messages enable row level security;
alter table public.ai_support_intake_deliveries enable row level security;
alter table public.ai_support_agent_runs enable row level security;

revoke all on table public.ai_support_raw_messages from public, anon, authenticated;
revoke all on table public.ai_support_intake_deliveries from public, anon, authenticated;
revoke all on table public.ai_support_agent_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_support_raw_messages to service_role;
grant select, insert, update, delete on table public.ai_support_intake_deliveries to service_role;
grant select, insert, update, delete on table public.ai_support_agent_runs to service_role;

create or replace function quotedr_private.ai_support_intake_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_support_intake_touch_updated_at() from public, anon, authenticated;

drop trigger if exists ai_support_intake_deliveries_touch_updated_at on public.ai_support_intake_deliveries;
create trigger ai_support_intake_deliveries_touch_updated_at
before update on public.ai_support_intake_deliveries
for each row execute function quotedr_private.ai_support_intake_touch_updated_at();
