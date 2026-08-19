-- Least-privilege receiving-side support for the trusted local AI Operations
-- coordinator. This migration does not create a scheduler, expose the inbox to
-- browser roles, launch Codex, send an email, or authorize a deployment.

alter table public.ai_engineering_coordinator_inbox
  add column if not exists coordinator_bridge text not null default ''
    check (char_length(coordinator_bridge) <= 120),
  add column if not exists claim_idempotency_key text not null default ''
    check (char_length(claim_idempotency_key) <= 180),
  add column if not exists heartbeat_idempotency_key text not null default ''
    check (char_length(heartbeat_idempotency_key) <= 180),
  add column if not exists outcome_idempotency_key text not null default ''
    check (char_length(outcome_idempotency_key) <= 180),
  add column if not exists cancel_idempotency_key text not null default ''
    check (char_length(cancel_idempotency_key) <= 180),
  add column if not exists last_heartbeat_at timestamptz;

create unique index if not exists ai_engineering_coordinator_inbox_claim_key_idx
  on public.ai_engineering_coordinator_inbox(claim_idempotency_key)
  where claim_idempotency_key <> '';
create unique index if not exists ai_engineering_coordinator_inbox_heartbeat_key_idx
  on public.ai_engineering_coordinator_inbox(heartbeat_idempotency_key)
  where heartbeat_idempotency_key <> '';
create unique index if not exists ai_engineering_coordinator_inbox_outcome_key_idx
  on public.ai_engineering_coordinator_inbox(outcome_idempotency_key)
  where outcome_idempotency_key <> '';
create unique index if not exists ai_engineering_coordinator_inbox_cancel_key_idx
  on public.ai_engineering_coordinator_inbox(cancel_idempotency_key)
  where cancel_idempotency_key <> '';

create table if not exists public.ai_engineering_coordinator_action_audit (
  id bigint generated always as identity primary key,
  inbox_id uuid references public.ai_engineering_coordinator_inbox(id) on delete restrict,
  action_type text not null check (action_type in (
    'poll', 'claim', 'heartbeat', 'review', 'task_created', 'retry_required',
    'cancel_synthetic_test', 'notification_prepared', 'notification_accepted',
    'notification_failed', 'notification_confirmed', 'owner_decision',
    'request_rejected'
  )),
  idempotency_key text not null unique
    check (char_length(pg_catalog.btrim(idempotency_key)) between 1 and 180),
  actor_type text not null default 'trusted_local_coordinator'
    check (actor_type in ('trusted_local_coordinator', 'database_guard')),
  actor_label text not null check (char_length(pg_catalog.btrim(actor_label)) between 1 and 160),
  synthetic_test boolean not null default false,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  check (
    pg_catalog.regexp_replace(details::text, 'admin@quotedr\.io', '', 'gi')
      !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
  ),
  check (details::text !~* 'https?://[^[:space:]]+[?&](token|access_token|signature|sig|key|secret|auth)='),
  check (details::text !~* '(bearer[[:space:]]+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})')
);

create index if not exists ai_engineering_coordinator_action_audit_inbox_idx
  on public.ai_engineering_coordinator_action_audit(inbox_id, occurred_at desc);

create table if not exists public.ai_engineering_coordinator_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  inbox_id uuid not null references public.ai_engineering_coordinator_inbox(id) on delete restrict,
  notification_kind text not null check (notification_kind in ('synthetic_test', 'owner_deploy_review')),
  recipient text not null check (pg_catalog.lower(pg_catalog.btrim(recipient)) = 'admin@quotedr.io'),
  subject text not null check (char_length(pg_catalog.btrim(subject)) between 1 and 500),
  body_text text not null check (char_length(pg_catalog.btrim(body_text)) between 1 and 5000),
  case_reference text not null check (char_length(pg_catalog.btrim(case_reference)) between 1 and 80),
  title text not null check (char_length(pg_catalog.btrim(title)) between 1 and 300),
  severity text not null check (severity in ('low', 'sensitive', 'critical')),
  review_url text not null check (char_length(pg_catalog.btrim(review_url)) between 1 and 1000),
  status text not null default 'prepared'
    check (status in ('prepared', 'accepted', 'failed', 'confirmed')),
  idempotency_key text not null unique
    check (char_length(pg_catalog.btrim(idempotency_key)) between 1 and 180),
  actor_label text not null check (char_length(pg_catalog.btrim(actor_label)) between 1 and 160),
  provider_message_id text not null default '' check (char_length(provider_message_id) <= 500),
  attempted_at timestamptz,
  provider_accepted_at timestamptz,
  confirmed_at timestamptz,
  confirmation_reference text not null default '' check (char_length(confirmation_reference) <= 500),
  failure_code text not null default '' check (char_length(failure_code) <= 80),
  failure_message text not null default '' check (char_length(failure_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbox_id, notification_kind),
  check (
    notification_kind <> 'synthetic_test'
    or pg_catalog.strpos(subject, '[TEST — NO ACTION REQUIRED] QuoteDr code review notification') = 1
  ),
  check ((subject || ' ' || body_text || ' ' || title) !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'),
  check ((subject || ' ' || body_text || ' ' || title || ' ' || review_url)
    !~* '(bearer[[:space:]]+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})'),
  check (
    notification_kind <> 'synthetic_test'
    or (
      pg_catalog.lower(body_text) like '%synthetic test%'
      and pg_catalog.lower(body_text) like '%no customer, code, or deployment action is required%'
    )
  ),
  check (review_url ~ '^https://quotedr\.io/ai-operations\.html\?coordinatorRequest=[0-9a-f-]{36}$'),
  check (status <> 'accepted' or (
    attempted_at is not null and provider_accepted_at is not null
    and char_length(pg_catalog.btrim(provider_message_id)) > 0
  )),
  check (status <> 'failed' or (
    attempted_at is not null and char_length(pg_catalog.btrim(failure_code)) > 0
    and char_length(pg_catalog.btrim(failure_message)) > 0
  )),
  check (status <> 'confirmed' or (
    confirmed_at is not null and char_length(pg_catalog.btrim(confirmation_reference)) > 0
  ))
);

create table if not exists public.ai_engineering_coordinator_owner_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  inbox_id uuid not null unique references public.ai_engineering_coordinator_inbox(id) on delete restrict,
  decision text not null check (decision in ('approved_local_only', 'rejected')),
  deployment_authorized boolean not null default false check (not deployment_authorized),
  local_task_reference text not null
    check (char_length(pg_catalog.btrim(local_task_reference)) between 1 and 500),
  local_commit_sha text not null
    check (local_commit_sha ~ '^[0-9a-f]{7,40}$'),
  verification_summary text not null
    check (char_length(pg_catalog.btrim(verification_summary)) between 1 and 2000),
  owner_decision_reference text not null
    check (char_length(pg_catalog.btrim(owner_decision_reference)) between 1 and 500),
  actor_label text not null check (char_length(pg_catalog.btrim(actor_label)) between 1 and 160),
  decided_at timestamptz not null default now(),
  check ((local_task_reference || ' ' || verification_summary || ' ' || owner_decision_reference)
    !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'),
  check ((local_task_reference || ' ' || verification_summary || ' ' || owner_decision_reference)
    !~* '(bearer[[:space:]]+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})')
);

alter table public.ai_engineering_coordinator_action_audit enable row level security;
alter table public.ai_engineering_coordinator_notifications enable row level security;
alter table public.ai_engineering_coordinator_owner_decisions enable row level security;

-- None of these receiving-side tables is available through a browser token.
-- The service-role key remains inside the authenticated Edge Function only.
revoke all on table public.ai_engineering_coordinator_action_audit
  from public, anon, authenticated, service_role;
revoke all on table public.ai_engineering_coordinator_notifications
  from public, anon, authenticated, service_role;
revoke all on table public.ai_engineering_coordinator_owner_decisions
  from public, anon, authenticated, service_role;
grant select, insert on table public.ai_engineering_coordinator_action_audit to service_role;
grant select, insert, update on table public.ai_engineering_coordinator_notifications to service_role;
grant select, insert on table public.ai_engineering_coordinator_owner_decisions to service_role;
grant usage, select on sequence public.ai_engineering_coordinator_action_audit_id_seq to service_role;

create or replace function quotedr_private.ai_operations_guard_coordinator_inbox()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_private_material text;
  v_is_heartbeat boolean;
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
       or new.cancelled_at is not null
       or new.coordinator_bridge <> ''
       or new.claim_idempotency_key <> ''
       or new.heartbeat_idempotency_key <> ''
       or new.outcome_idempotency_key <> ''
       or new.cancel_idempotency_key <> ''
       or new.last_heartbeat_at is not null then
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

  v_is_heartbeat := old.state = 'claimed'
    and new.state = 'claimed'
    and new.attempt_count = old.attempt_count
    and new.claimed_at is not distinct from old.claimed_at
    and new.claimed_by is not distinct from old.claimed_by
    and new.claimed_by_email is not distinct from old.claimed_by_email
    and new.claim_label is not distinct from old.claim_label
    and new.coordinator_bridge is not distinct from old.coordinator_bridge
    and new.claim_idempotency_key is not distinct from old.claim_idempotency_key
    and new.heartbeat_idempotency_key <> ''
    and new.heartbeat_idempotency_key is distinct from old.heartbeat_idempotency_key
    and new.last_heartbeat_at is not null
    and new.last_heartbeat_at >= pg_catalog.clock_timestamp() - interval '1 minute'
    and new.last_heartbeat_at <= pg_catalog.clock_timestamp() + interval '1 minute'
    and new.lease_expires_at > old.lease_expires_at
    and new.lease_expires_at <= pg_catalog.clock_timestamp() + interval '20 minutes';

  if new.state = old.state then
    if v_is_heartbeat then
      return new;
    end if;
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
      v_event_type := case
        when old.state = 'claimed' and new.attempt_count = old.attempt_count
          then 'coordinator_inbox_heartbeat'
        when old.state = 'claimed' then 'coordinator_inbox_reclaimed'
        else 'coordinator_inbox_claimed'
      end;
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
    inbox_id, case_id, work_item_id, event_type, from_state, to_state,
    actor_id, actor_email, details
  ) values (
    new.id, new.case_id, new.work_item_id, v_event_type, v_from_state, new.state,
    v_actor_id, v_actor_email,
    pg_catalog.jsonb_build_object(
      'handoff_revision', new.handoff_revision,
      'idempotency_key', new.idempotency_key,
      'owner_confirmed', new.owner_confirmed,
      'privacy_minimized', new.privacy_minimized,
      'attempt_count', new.attempt_count,
      'retry_count', new.retry_count,
      'coordinator_bridge', new.coordinator_bridge,
      'claim_idempotency_key', new.claim_idempotency_key,
      'heartbeat_idempotency_key', new.heartbeat_idempotency_key,
      'outcome_idempotency_key', new.outcome_idempotency_key,
      'cancel_idempotency_key', new.cancel_idempotency_key,
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

create or replace function quotedr_private.ai_operations_guard_coordinator_notification()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'prepared' or new.attempted_at is not null
       or new.provider_accepted_at is not null or new.confirmed_at is not null then
      raise exception 'coordinator notifications must be prepared before a single send attempt';
    end if;
    return new;
  end if;

  if new.inbox_id is distinct from old.inbox_id
     or new.notification_kind is distinct from old.notification_kind
     or new.recipient is distinct from old.recipient
     or new.subject is distinct from old.subject
     or new.body_text is distinct from old.body_text
     or new.case_reference is distinct from old.case_reference
     or new.title is distinct from old.title
     or new.severity is distinct from old.severity
     or new.review_url is distinct from old.review_url
     or new.idempotency_key is distinct from old.idempotency_key
     or new.actor_label is distinct from old.actor_label
     or new.created_at is distinct from old.created_at then
    raise exception 'coordinator notification content is immutable after preparation';
  end if;

  if old.status = 'prepared' and new.status = 'accepted'
     and new.attempted_at is not null and new.provider_accepted_at is not null
     and char_length(pg_catalog.btrim(new.provider_message_id)) > 0
     and new.confirmed_at is null and new.confirmation_reference = ''
     and new.failure_code = '' and new.failure_message = '' then
    return new;
  end if;
  if old.status = 'prepared' and new.status = 'failed'
     and new.attempted_at is not null and new.provider_accepted_at is null
     and new.provider_message_id = '' and new.confirmed_at is null
     and new.confirmation_reference = ''
     and char_length(pg_catalog.btrim(new.failure_code)) > 0
     and char_length(pg_catalog.btrim(new.failure_message)) > 0 then
    return new;
  end if;
  if old.status = 'accepted' and new.status = 'confirmed'
     and new.attempted_at is not distinct from old.attempted_at
     and new.provider_accepted_at is not distinct from old.provider_accepted_at
     and new.provider_message_id is not distinct from old.provider_message_id
     and new.failure_code is not distinct from old.failure_code
     and new.failure_message is not distinct from old.failure_message
     and new.confirmed_at is not null
     and char_length(pg_catalog.btrim(new.confirmation_reference)) > 0 then
    return new;
  end if;
  raise exception 'coordinator notification updates require an allowed one-way transition';
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_coordinator_notification()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_audit_coordinator_notification()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_action_type text;
begin
  v_action_type := case new.status
    when 'prepared' then 'notification_prepared'
    when 'accepted' then 'notification_accepted'
    when 'failed' then 'notification_failed'
    else 'notification_confirmed'
  end;
  insert into public.ai_engineering_coordinator_action_audit (
    inbox_id, action_type, idempotency_key, actor_type, actor_label,
    synthetic_test, details, occurred_at
  ) values (
    new.inbox_id,
    v_action_type,
    'notification:' || new.id::text || ':' || new.status,
    'database_guard',
    new.actor_label,
    new.notification_kind = 'synthetic_test',
    pg_catalog.jsonb_build_object(
      'notification_id', new.id,
      'notification_kind', new.notification_kind,
      'status', new.status,
      'recipient', new.recipient,
      'provider_accepted', new.status in ('accepted', 'confirmed'),
      'delivery_confirmed', new.status = 'confirmed',
      'customer_content_included', false,
      'deployment_performed', false
    ),
    coalesce(new.confirmed_at, new.provider_accepted_at, new.attempted_at, new.created_at)
  );
  return new;
end;
$function$;

create or replace function quotedr_private.ai_operations_audit_coordinator_owner_decision()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  insert into public.ai_engineering_coordinator_action_audit (
    inbox_id, action_type, idempotency_key, actor_type, actor_label,
    synthetic_test, details, occurred_at
  ) values (
    new.inbox_id,
    'owner_decision',
    'owner-decision:' || new.id::text,
    'database_guard',
    new.actor_label,
    true,
    pg_catalog.jsonb_build_object(
      'decision', new.decision,
      'deployment_authorized', false,
      'local_task_reference', new.local_task_reference,
      'local_commit_sha', new.local_commit_sha,
      'verification_summary', new.verification_summary
    ),
    new.decided_at
  );
  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_audit_coordinator_notification()
  from public, anon, authenticated;
revoke all on function quotedr_private.ai_operations_audit_coordinator_owner_decision()
  from public, anon, authenticated;

drop trigger if exists ai_engineering_coordinator_notification_guard
  on public.ai_engineering_coordinator_notifications;
create trigger ai_engineering_coordinator_notification_guard
before insert or update on public.ai_engineering_coordinator_notifications
for each row execute function quotedr_private.ai_operations_guard_coordinator_notification();

drop trigger if exists ai_engineering_coordinator_notification_touch_updated_at
  on public.ai_engineering_coordinator_notifications;
create trigger ai_engineering_coordinator_notification_touch_updated_at
before update on public.ai_engineering_coordinator_notifications
for each row execute function quotedr_private.ai_operations_touch_updated_at();

drop trigger if exists ai_engineering_coordinator_notification_audit
  on public.ai_engineering_coordinator_notifications;
create trigger ai_engineering_coordinator_notification_audit
after insert or update on public.ai_engineering_coordinator_notifications
for each row execute function quotedr_private.ai_operations_audit_coordinator_notification();

drop trigger if exists ai_engineering_coordinator_owner_decision_audit
  on public.ai_engineering_coordinator_owner_decisions;
create trigger ai_engineering_coordinator_owner_decision_audit
after insert on public.ai_engineering_coordinator_owner_decisions
for each row execute function quotedr_private.ai_operations_audit_coordinator_owner_decision();

-- No EXECUTE grant is added for browser roles, and no policy grants browser
-- access. The separate coordinator Edge Function is the only intended caller.
