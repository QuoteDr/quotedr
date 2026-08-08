-- Administrator-only support-to-product operations workflow.
-- This schema records decisions and verified release evidence. It does not send
-- customer messages, deploy code, or grant account credits.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists quotedr_private;
revoke all on schema quotedr_private from public, anon, authenticated;

create table if not exists public.ai_support_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  case_number bigint generated always as identity unique,
  source text not null default 'email'
    check (source in ('email', 'in_app', 'chatbot', 'phone', 'other')),
  customer_name text not null default '' check (char_length(customer_name) <= 160),
  customer_email text not null default '' check (char_length(customer_email) <= 320),
  subject text not null check (char_length(trim(subject)) between 1 and 240),
  summary text not null check (char_length(trim(summary)) between 1 and 5000),
  topic_key text not null default 'support_feedback' check (topic_key in (
    'ai_voice_to_quote', 'choice_groups', 'invoices_payments', 'quotes_approvals',
    'quote_builder', 'saved_items_pricing', 'client_portal', 'clients_contacts',
    'dashboard_sync', 'templates', 'ai_quote_copilot', 'smart_import',
    'floor_plan_scanner', 'quickbooks', 'job_tracking_expenses', 'change_orders',
    'photos_media', 'notifications_followups', 'account_plan', 'assistant_help',
    'support_feedback', 'other'
  )),
  improvement_type text not null check (improvement_type in (
    'documentation', 'ux', 'bug', 'feature'
  )),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'sensitive', 'critical')),
  sensitive_flags text[] not null default array[]::text[]
    check (sensitive_flags <@ array[
      'billing', 'payments', 'data_loss', 'privacy', 'access',
      'legal_signature', 'cross_device', 'broad_incident'
    ]::text[]),
  workflow_stage text not null default 'intake' check (workflow_stage in (
    'intake', 'engineering', 'verification', 'deploy_approval', 'follow_up', 'closed'
  )),
  is_likely_bug boolean not null default false,
  possible_solution text not null default '' check (char_length(possible_solution) <= 5000),
  safe_workaround text not null default '' check (char_length(safe_workaround) <= 5000),
  immediate_response_draft text not null default ''
    check (char_length(immediate_response_draft) <= 10000),
  immediate_response_status text not null default 'ready_for_human_review'
    check (immediate_response_status in ('draft', 'ready_for_human_review', 'sent')),
  human_review_required boolean not null default true,
  owner_review_required boolean not null default false,
  first_response_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or workflow_stage = 'closed'),
  check (first_response_at is null or immediate_response_status = 'sent')
);

create table if not exists public.ai_engineering_work_items (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references public.ai_support_cases(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  problem_statement text not null check (char_length(trim(problem_statement)) between 1 and 10000),
  proposed_solution text not null check (char_length(trim(proposed_solution)) between 1 and 10000),
  status text not null default 'queued' check (status in (
    'queued', 'in_progress', 'verification_pending', 'verified', 'blocked', 'cancelled'
  )),
  automatically_created boolean not null default true,
  coordinator_notes text not null default '' check (char_length(coordinator_notes) <= 10000),
  implementation_reference text not null default ''
    check (char_length(implementation_reference) <= 500),
  verification_summary text not null default ''
    check (char_length(verification_summary) <= 10000),
  verification_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(verification_evidence) = 'array'),
  started_at timestamptz,
  submitted_for_verification_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_deploy_approvals (
  id uuid primary key default extensions.gen_random_uuid(),
  work_item_id uuid not null unique references public.ai_engineering_work_items(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  requested_at timestamptz not null default now(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  decision_at timestamptz,
  decision_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '' check (char_length(decision_note) <= 5000),
  deployed_at timestamptz,
  deployed_by uuid references auth.users(id) on delete set null,
  release_reference text not null default '' check (char_length(release_reference) <= 500),
  deployment_evidence text not null default '' check (char_length(deployment_evidence) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_customer_followups (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references public.ai_support_cases(id) on delete cascade,
  work_item_id uuid references public.ai_engineering_work_items(id) on delete cascade,
  status text not null default 'waiting_on_release' check (status in (
    'waiting_on_release', 'draft', 'owner_review', 'approved', 'sent', 'closed'
  )),
  draft_body text not null default '' check (char_length(draft_body) <= 10000),
  claims_fix_live boolean not null default false,
  prepared_at timestamptz,
  prepared_by uuid references auth.users(id) on delete set null,
  owner_approved_at timestamptz,
  owner_approved_by uuid references auth.users(id) on delete set null,
  owner_decision_note text not null default ''
    check (char_length(owner_decision_note) <= 5000),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_goodwill_recommendations (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references public.ai_support_cases(id) on delete cascade,
  credit_type text not null default 'free_pro_month'
    check (credit_type in ('free_pro_month', 'account_credit', 'other')),
  recommendation_reason text not null
    check (char_length(trim(recommendation_reason)) between 1 and 5000),
  status text not null default 'recommended'
    check (status in ('recommended', 'approved', 'declined')),
  recommended_at timestamptz not null default now(),
  recommended_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '' check (char_length(decision_note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_operations_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.ai_support_cases(id) on delete cascade,
  work_item_id uuid references public.ai_engineering_work_items(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '' check (char_length(actor_email) <= 320),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_support_cases_queue_idx
  on public.ai_support_cases(workflow_stage, created_at desc);
create index if not exists ai_support_cases_topic_idx
  on public.ai_support_cases(topic_key, created_at desc);
create index if not exists ai_support_cases_improvement_idx
  on public.ai_support_cases(improvement_type, created_at desc);
create index if not exists ai_engineering_work_items_queue_idx
  on public.ai_engineering_work_items(status, updated_at desc);
create index if not exists ai_deploy_approvals_queue_idx
  on public.ai_deploy_approvals(status, requested_at desc);
create index if not exists ai_customer_followups_queue_idx
  on public.ai_customer_followups(status, updated_at desc);
create index if not exists ai_goodwill_recommendations_queue_idx
  on public.ai_goodwill_recommendations(status, updated_at desc);
create index if not exists ai_operations_events_case_idx
  on public.ai_operations_events(case_id, occurred_at desc);

alter table public.ai_support_cases enable row level security;
alter table public.ai_engineering_work_items enable row level security;
alter table public.ai_deploy_approvals enable row level security;
alter table public.ai_customer_followups enable row level security;
alter table public.ai_goodwill_recommendations enable row level security;
alter table public.ai_operations_events enable row level security;

-- Browser clients have no direct access. The authenticated administrator Edge
-- Function is the only supported entry point.
revoke all on table public.ai_support_cases from public, anon, authenticated;
revoke all on table public.ai_engineering_work_items from public, anon, authenticated;
revoke all on table public.ai_deploy_approvals from public, anon, authenticated;
revoke all on table public.ai_customer_followups from public, anon, authenticated;
revoke all on table public.ai_goodwill_recommendations from public, anon, authenticated;
revoke all on table public.ai_operations_events from public, anon, authenticated;

grant select, insert, update, delete on table public.ai_support_cases to service_role;
grant select, insert, update, delete on table public.ai_engineering_work_items to service_role;
grant select, insert, update, delete on table public.ai_deploy_approvals to service_role;
grant select, insert, update, delete on table public.ai_customer_followups to service_role;
grant select, insert, update, delete on table public.ai_goodwill_recommendations to service_role;
grant select, insert, update, delete on table public.ai_operations_events to service_role;
grant usage, select on sequence public.ai_support_cases_case_number_seq to service_role;
grant usage, select on sequence public.ai_operations_events_id_seq to service_role;

create or replace function quotedr_private.ai_operations_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_touch_updated_at()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_auto_create_work_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_item_id uuid;
begin
  if new.is_likely_bug and char_length(pg_catalog.btrim(new.possible_solution)) > 0 then
    insert into public.ai_engineering_work_items (
      case_id,
      title,
      problem_statement,
      proposed_solution,
      automatically_created,
      created_by,
      updated_by
    ) values (
      new.id,
      'Investigate: ' || new.subject,
      new.summary,
      new.possible_solution,
      true,
      new.created_by,
      new.created_by
    )
    returning id into v_work_item_id;

    insert into public.ai_customer_followups (
      case_id,
      work_item_id,
      status
    ) values (
      new.id,
      v_work_item_id,
      'waiting_on_release'
    );

    insert into public.ai_operations_events (
      case_id,
      work_item_id,
      event_type,
      actor_id,
      details
    ) values (
      new.id,
      v_work_item_id,
      'engineering_work_item_auto_created',
      new.created_by,
      pg_catalog.jsonb_build_object('possible_solution_present', true)
    );
  end if;
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_auto_create_work_item()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_guard_work_item()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status = 'verification_pending'
     and char_length(pg_catalog.btrim(new.implementation_reference)) = 0 then
    raise exception 'verification requires an implementation reference';
  end if;

  if new.status = 'verified' and (
    new.verified_at is null
    or new.verified_by is null
    or char_length(pg_catalog.btrim(new.verification_summary)) = 0
    or pg_catalog.jsonb_array_length(new.verification_evidence) = 0
  ) then
    raise exception 'verified work requires reviewer, summary, and evidence';
  end if;
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_work_item()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_guard_deploy()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_work_status text;
begin
  if new.status in ('approved', 'declined')
     and (new.decision_at is null or new.decision_by is null) then
    raise exception 'deployment decisions require an owner and decision time';
  end if;

  if new.deployed_at is not null then
    select work_item.status into v_work_status
      from public.ai_engineering_work_items work_item
     where work_item.id = new.work_item_id;

    if new.status <> 'approved'
       or new.deployed_by is null
       or char_length(pg_catalog.btrim(new.release_reference)) = 0
       or char_length(pg_catalog.btrim(new.deployment_evidence)) = 0
       or v_work_status is distinct from 'verified' then
      raise exception 'recorded deployment requires verified work and prior owner approval';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_deploy()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_guard_followup()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_work_status text;
  v_deploy_status text;
  v_deployed_at timestamptz;
begin
  if new.claims_fix_live then
    select work_item.status, approval.status, approval.deployed_at
      into v_work_status, v_deploy_status, v_deployed_at
      from public.ai_engineering_work_items work_item
      left join public.ai_deploy_approvals approval
        on approval.work_item_id = work_item.id
     where work_item.id = new.work_item_id;

    if v_work_status is distinct from 'verified'
       or v_deploy_status is distinct from 'approved'
       or v_deployed_at is null then
      raise exception 'a live-fix follow-up requires a verified and deployed release';
    end if;
  end if;

  if new.status in ('approved', 'sent') and (
    new.owner_approved_at is null
    or new.owner_approved_by is null
    or char_length(pg_catalog.btrim(new.draft_body)) = 0
  ) then
    raise exception 'customer follow-up requires owner approval';
  end if;

  if new.status = 'sent' and (new.sent_at is null or new.sent_by is null) then
    raise exception 'sent follow-up requires a human-recorded send time';
  end if;
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_followup()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_guard_goodwill()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status in ('approved', 'declined')
     and (new.decided_at is null or new.decided_by is null) then
    raise exception 'goodwill decisions require owner approval';
  end if;
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_goodwill()
  from public, anon, authenticated;

drop trigger if exists ai_support_cases_auto_work_item on public.ai_support_cases;
create trigger ai_support_cases_auto_work_item
after insert on public.ai_support_cases
for each row execute function quotedr_private.ai_operations_auto_create_work_item();

drop trigger if exists ai_support_cases_touch_updated_at on public.ai_support_cases;
create trigger ai_support_cases_touch_updated_at
before update on public.ai_support_cases
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_engineering_work_items_guard on public.ai_engineering_work_items;
create trigger ai_engineering_work_items_guard
before insert or update on public.ai_engineering_work_items
for each row execute function quotedr_private.ai_operations_guard_work_item();

drop trigger if exists ai_engineering_work_items_touch_updated_at on public.ai_engineering_work_items;
create trigger ai_engineering_work_items_touch_updated_at
before update on public.ai_engineering_work_items
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_deploy_approvals_guard on public.ai_deploy_approvals;
create trigger ai_deploy_approvals_guard
before insert or update on public.ai_deploy_approvals
for each row execute function quotedr_private.ai_operations_guard_deploy();

drop trigger if exists ai_deploy_approvals_touch_updated_at on public.ai_deploy_approvals;
create trigger ai_deploy_approvals_touch_updated_at
before update on public.ai_deploy_approvals
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_customer_followups_guard on public.ai_customer_followups;
create trigger ai_customer_followups_guard
before insert or update on public.ai_customer_followups
for each row execute function quotedr_private.ai_operations_guard_followup();

drop trigger if exists ai_customer_followups_touch_updated_at on public.ai_customer_followups;
create trigger ai_customer_followups_touch_updated_at
before update on public.ai_customer_followups
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_goodwill_recommendations_guard on public.ai_goodwill_recommendations;
create trigger ai_goodwill_recommendations_guard
before insert or update on public.ai_goodwill_recommendations
for each row execute function quotedr_private.ai_operations_guard_goodwill();

drop trigger if exists ai_goodwill_recommendations_touch_updated_at on public.ai_goodwill_recommendations;
create trigger ai_goodwill_recommendations_touch_updated_at
before update on public.ai_goodwill_recommendations
for each row execute function quotedr_private.ai_operations_touch_updated_at();
