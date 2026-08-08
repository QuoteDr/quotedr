-- Durable, administrator-only coordinator inbox for owner-confirmed engineering
-- requests. QuoteDr stores and audits these requests but does not connect to
-- Codex Desktop, poll the queue, launch an agent, deploy, message customers, or
-- grant goodwill credit.

create table if not exists public.ai_engineering_coordinator_inbox (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.ai_support_cases(id) on delete restrict,
  work_item_id uuid not null references public.ai_engineering_work_items(id) on delete restrict,
  handoff_revision integer not null check (handoff_revision > 0),
  idempotency_key text not null unique
    check (char_length(pg_catalog.btrim(idempotency_key)) between 1 and 180),
  state text not null default 'queued'
    check (state in ('queued', 'claimed', 'task_created', 'retry_required', 'cancelled')),
  task_brief text not null
    check (char_length(pg_catalog.btrim(task_brief)) between 1 and 100000),
  task_payload jsonb not null check (jsonb_typeof(task_payload) = 'object'),
  advisory_assessment jsonb not null check (jsonb_typeof(advisory_assessment) = 'object'),
  owner_confirmed boolean not null check (owner_confirmed),
  privacy_minimized boolean not null check (privacy_minimized),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_by_email text not null
    check (char_length(pg_catalog.btrim(submitted_by_email)) between 1 and 320),
  queued_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete restrict,
  claimed_by_email text not null default '' check (char_length(claimed_by_email) <= 320),
  claim_label text not null default '' check (char_length(claim_label) <= 160),
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error_code text not null default '' check (char_length(last_error_code) <= 80),
  last_error_message text not null default '' check (char_length(last_error_message) <= 1000),
  last_error_at timestamptz,
  task_created_at timestamptz,
  task_reference text not null default '' check (char_length(task_reference) <= 500),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text not null default '' check (char_length(cancellation_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_item_id, handoff_revision),
  check (coalesce(task_payload #>> '{case,customer_name_included}', '') = 'false'),
  check (coalesce(task_payload #>> '{case,customer_email_included}', '') = 'false'),
  check (coalesce(task_payload #>> '{privacy,privacy_minimized}', '') = 'true'),
  check (coalesce(task_payload #>> '{privacy,secure_links_or_tokens_included}', '') = 'false'),
  check (coalesce(task_payload #>> '{coordinator_inbox,owner_confirmed}', '') = 'true'),
  check (coalesce(task_payload #>> '{safety_boundaries,live_codex_desktop_connection}', '') = 'false'),
  check (state <> 'claimed' or (
    claimed_at is not null and claimed_by is not null
    and char_length(pg_catalog.btrim(claimed_by_email)) > 0
    and char_length(pg_catalog.btrim(claim_label)) > 0
    and lease_expires_at is not null and attempt_count > 0
  )),
  check (state <> 'task_created' or (
    task_created_at is not null and char_length(pg_catalog.btrim(task_reference)) > 0
  )),
  check (state <> 'retry_required' or (
    last_error_at is not null and retry_count > 0
    and char_length(pg_catalog.btrim(last_error_code)) > 0
    and char_length(pg_catalog.btrim(last_error_message)) > 0
  )),
  check (state <> 'cancelled' or (
    cancelled_at is not null and cancelled_by is not null
    and char_length(pg_catalog.btrim(cancellation_reason)) > 0
  ))
);

create table if not exists public.ai_engineering_coordinator_inbox_events (
  id bigint generated always as identity primary key,
  inbox_id uuid not null references public.ai_engineering_coordinator_inbox(id) on delete restrict,
  case_id uuid not null references public.ai_support_cases(id) on delete restrict,
  work_item_id uuid not null references public.ai_engineering_work_items(id) on delete restrict,
  event_type text not null check (char_length(pg_catalog.btrim(event_type)) between 1 and 120),
  from_state text not null default ''
    check (from_state in ('', 'queued', 'claimed', 'task_created', 'retry_required', 'cancelled')),
  to_state text not null
    check (to_state in ('queued', 'claimed', 'task_created', 'retry_required', 'cancelled')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '' check (char_length(actor_email) <= 320),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_engineering_coordinator_inbox_case_idx
  on public.ai_engineering_coordinator_inbox(case_id, queued_at desc);
create index if not exists ai_engineering_coordinator_inbox_poll_idx
  on public.ai_engineering_coordinator_inbox(state, available_at, queued_at)
  where state in ('queued', 'retry_required');
create index if not exists ai_engineering_coordinator_inbox_events_inbox_idx
  on public.ai_engineering_coordinator_inbox_events(inbox_id, occurred_at desc);
create index if not exists ai_engineering_coordinator_inbox_events_case_idx
  on public.ai_engineering_coordinator_inbox_events(case_id, occurred_at desc);

alter table public.ai_engineering_coordinator_inbox enable row level security;
alter table public.ai_engineering_coordinator_inbox_events enable row level security;

-- Browser roles never access the queue directly. The authenticated AI
-- Operations Edge Function verifies the administrator or owner allowlist first.
revoke all on table public.ai_engineering_coordinator_inbox
  from public, anon, authenticated, service_role;
revoke all on table public.ai_engineering_coordinator_inbox_events
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.ai_engineering_coordinator_inbox
  to service_role;
grant select, insert on table public.ai_engineering_coordinator_inbox_events
  to service_role;
grant usage, select on sequence public.ai_engineering_coordinator_inbox_events_id_seq
  to service_role;

create or replace function quotedr_private.ai_operations_guard_coordinator_inbox()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_private_material text;
begin
  v_private_material := new.task_brief || ' ' || new.task_payload::text;
  if v_private_material ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
     or v_private_material ~* 'https?://[^[:space:]]+[?&](token|access_token|signature|sig|key|secret|auth)='
     or v_private_material ~* '(bearer[[:space:]]+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})' then
    raise exception 'coordinator inbox brief contains an email address, secure link, or token-like value';
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'queued'
       or new.attempt_count <> 0
       or new.retry_count <> 0
       or new.claimed_at is not null
       or new.claimed_by is not null
       or new.task_created_at is not null
       or new.cancelled_at is not null then
      raise exception 'new coordinator inbox requests must enter the queued state unclaimed';
    end if;
    return new;
  end if;

  if new.case_id is distinct from old.case_id
     or new.work_item_id is distinct from old.work_item_id
     or new.handoff_revision is distinct from old.handoff_revision
     or new.idempotency_key is distinct from old.idempotency_key
     or new.task_brief is distinct from old.task_brief
     or new.task_payload is distinct from old.task_payload
     or new.advisory_assessment is distinct from old.advisory_assessment
     or new.owner_confirmed is distinct from old.owner_confirmed
     or new.privacy_minimized is distinct from old.privacy_minimized
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_by_email is distinct from old.submitted_by_email
     or new.queued_at is distinct from old.queued_at then
    raise exception 'coordinator inbox request revisions and privacy snapshots are immutable';
  end if;

  if old.state in ('task_created', 'cancelled') then
    raise exception 'completed or cancelled coordinator inbox requests are immutable';
  end if;

  if new.state = old.state then
    if new.state <> 'claimed'
       or old.lease_expires_at is null
       or old.lease_expires_at > pg_catalog.clock_timestamp()
       or new.attempt_count <> old.attempt_count + 1
       or new.claimed_at is null
       or new.claimed_by is null
       or new.lease_expires_at <= new.claimed_at then
      raise exception 'coordinator inbox updates require an allowed state transition';
    end if;
    return new;
  end if;

  if new.state = 'claimed' then
    if old.state not in ('queued', 'retry_required')
       or (old.state = 'retry_required' and old.available_at > pg_catalog.clock_timestamp())
       or new.attempt_count <> old.attempt_count + 1
       or new.claimed_at is null
       or new.claimed_by is null
       or char_length(pg_catalog.btrim(new.claimed_by_email)) = 0
       or char_length(pg_catalog.btrim(new.claim_label)) = 0
       or new.lease_expires_at <= new.claimed_at then
      raise exception 'claiming requires an available request, administrator ownership, and a bounded lease';
    end if;
  elsif new.state = 'task_created' then
    if old.state <> 'claimed'
       or new.claimed_by is distinct from old.claimed_by
       or new.task_created_at is null
       or char_length(pg_catalog.btrim(new.task_reference)) = 0 then
      raise exception 'task-created state must be recorded by the administrator holding the claim';
    end if;
  elsif new.state = 'retry_required' then
    if old.state <> 'claimed'
       or new.retry_count <> old.retry_count + 1
       or new.last_error_at is null
       or new.available_at <= new.last_error_at
       or char_length(pg_catalog.btrim(new.last_error_code)) = 0
       or char_length(pg_catalog.btrim(new.last_error_message)) = 0 then
      raise exception 'retry-required state needs a sanitized error and a future availability time';
    end if;
  elsif new.state = 'cancelled' then
    if old.state not in ('queued', 'claimed', 'retry_required')
       or new.cancelled_at is null
       or new.cancelled_by is null
       or char_length(pg_catalog.btrim(new.cancellation_reason)) = 0 then
      raise exception 'cancelling a coordinator request requires an owner and reason';
    end if;
  else
    raise exception 'invalid coordinator inbox state transition';
  end if;

  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_coordinator_inbox()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_audit_coordinator_inbox()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_event_type text;
  v_from_state text;
begin
  if tg_op = 'INSERT' then
    v_actor_id := new.submitted_by;
    v_actor_email := new.submitted_by_email;
    v_event_type := 'coordinator_inbox_queued';
    v_from_state := '';
  else
    v_from_state := old.state;
    if new.state = 'claimed' then
      v_actor_id := new.claimed_by;
      v_actor_email := new.claimed_by_email;
      v_event_type := case when old.state = 'claimed'
        then 'coordinator_inbox_reclaimed'
        else 'coordinator_inbox_claimed' end;
    elsif new.state = 'task_created' then
      v_actor_id := new.claimed_by;
      v_actor_email := new.claimed_by_email;
      v_event_type := 'coordinator_inbox_task_created_recorded';
    elsif new.state = 'retry_required' then
      v_actor_id := new.claimed_by;
      v_actor_email := new.claimed_by_email;
      v_event_type := 'coordinator_inbox_retry_required';
    else
      v_actor_id := new.cancelled_by;
      v_actor_email := '';
      v_event_type := 'coordinator_inbox_cancelled';
    end if;
  end if;

  insert into public.ai_engineering_coordinator_inbox_events (
    inbox_id,
    case_id,
    work_item_id,
    event_type,
    from_state,
    to_state,
    actor_id,
    actor_email,
    details
  ) values (
    new.id,
    new.case_id,
    new.work_item_id,
    v_event_type,
    v_from_state,
    new.state,
    v_actor_id,
    v_actor_email,
    pg_catalog.jsonb_build_object(
      'handoff_revision', new.handoff_revision,
      'idempotency_key', new.idempotency_key,
      'owner_confirmed', new.owner_confirmed,
      'privacy_minimized', new.privacy_minimized,
      'attempt_count', new.attempt_count,
      'retry_count', new.retry_count,
      'external_delivery_performed', false,
      'agent_launched', false,
      'deployment_performed', false,
      'customer_message_sent', false,
      'credit_granted', false
    )
  );
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_audit_coordinator_inbox()
  from public, anon, authenticated;

drop trigger if exists ai_engineering_coordinator_inbox_guard
  on public.ai_engineering_coordinator_inbox;
create trigger ai_engineering_coordinator_inbox_guard
before insert or update on public.ai_engineering_coordinator_inbox
for each row execute function quotedr_private.ai_operations_guard_coordinator_inbox();

drop trigger if exists ai_engineering_coordinator_inbox_touch_updated_at
  on public.ai_engineering_coordinator_inbox;
create trigger ai_engineering_coordinator_inbox_touch_updated_at
before update on public.ai_engineering_coordinator_inbox
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_engineering_coordinator_inbox_audit
  on public.ai_engineering_coordinator_inbox;
create trigger ai_engineering_coordinator_inbox_audit
after insert or update on public.ai_engineering_coordinator_inbox
for each row execute function quotedr_private.ai_operations_audit_coordinator_inbox();

-- Replace the earlier manual-handoff audit trigger target. The work-item update,
-- inbox insert, and both audit records now succeed or fail in one transaction.
create or replace function quotedr_private.ai_operations_audit_coordinator_handoff()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_inbox_id uuid;
begin
  if new.coordinator_brief_payload #>> '{coordinator_inbox,owner_confirmed}' <> 'true'
     or new.coordinator_brief_payload #>> '{privacy,privacy_minimized}' <> 'true'
     or new.coordinator_brief_payload #>> '{privacy,secure_links_or_tokens_included}' <> 'false'
     or new.coordinator_brief_payload #>> '{case,customer_email_included}' <> 'false'
     or new.coordinator_brief_payload #>> '{safety_boundaries,live_codex_desktop_connection}' <> 'false'
     or not (new.coordinator_brief_payload ? 'advisory_assessment') then
    raise exception 'coordinator inbox handoff requires owner confirmation, advisory rationale, and privacy minimization';
  end if;

  insert into public.ai_engineering_coordinator_inbox (
    case_id,
    work_item_id,
    handoff_revision,
    idempotency_key,
    state,
    task_brief,
    task_payload,
    advisory_assessment,
    owner_confirmed,
    privacy_minimized,
    submitted_by,
    submitted_by_email,
    queued_at,
    available_at
  ) values (
    new.case_id,
    new.id,
    new.coordinator_handoff_count,
    'engineering-handoff:' || new.id::text || ':r' || new.coordinator_handoff_count::text,
    'queued',
    new.coordinator_brief,
    new.coordinator_brief_payload,
    new.coordinator_brief_payload -> 'advisory_assessment',
    true,
    true,
    new.coordinator_handoff_by,
    new.coordinator_handoff_by_email,
    new.coordinator_handoff_at,
    new.coordinator_handoff_at
  )
  on conflict (work_item_id, handoff_revision) do nothing
  returning id into v_inbox_id;

  if v_inbox_id is null then
    select inbox.id into v_inbox_id
      from public.ai_engineering_coordinator_inbox inbox
     where inbox.work_item_id = new.id
       and inbox.handoff_revision = new.coordinator_handoff_count;
  end if;

  insert into public.ai_operations_events (
    case_id,
    work_item_id,
    event_type,
    actor_id,
    actor_email,
    details,
    occurred_at
  ) values (
    new.case_id,
    new.id,
    'engineering_coordinator_handoff_recorded',
    new.coordinator_handoff_by,
    new.coordinator_handoff_by_email,
    pg_catalog.jsonb_build_object(
      'handoff_count', new.coordinator_handoff_count,
      'coordinator_inbox_id', v_inbox_id,
      'brief_snapshot', new.coordinator_brief_payload,
      'owner_confirmed', true,
      'privacy_minimized', true,
      'external_delivery_performed', false,
      'agent_launched', false,
      'deployment_performed', false,
      'merge_performed', false,
      'customer_message_sent', false,
      'credit_granted', false
    ),
    new.coordinator_handoff_at
  );
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_audit_coordinator_handoff()
  from public, anon, authenticated;
