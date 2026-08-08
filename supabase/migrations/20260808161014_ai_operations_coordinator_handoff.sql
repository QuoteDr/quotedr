-- Reviewable, administrator-only handoff from support intake to engineering.
-- This records a structured manual handoff. It does not contact Codex, launch
-- an agent, change code, deploy, merge, message a customer, or grant credit.

alter table public.ai_engineering_work_items
  add column if not exists coordinator_handoff_status text not null default 'not_sent'
    check (coordinator_handoff_status in ('not_sent', 'handed_off')),
  add column if not exists coordinator_handoff_at timestamptz,
  add column if not exists coordinator_handoff_by uuid references auth.users(id) on delete restrict,
  add column if not exists coordinator_handoff_by_email text not null default ''
    check (char_length(coordinator_handoff_by_email) <= 320),
  add column if not exists coordinator_handoff_count integer not null default 0
    check (coordinator_handoff_count >= 0),
  add column if not exists coordinator_brief text not null default ''
    check (char_length(coordinator_brief) <= 100000),
  add column if not exists coordinator_brief_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(coordinator_brief_payload) = 'object');

do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'ai_engineering_work_items_coordinator_handoff_state_check'
      and conrelid = 'public.ai_engineering_work_items'::pg_catalog.regclass
  ) then
    alter table public.ai_engineering_work_items
      add constraint ai_engineering_work_items_coordinator_handoff_state_check check (
        (
          coordinator_handoff_status = 'not_sent'
          and coordinator_handoff_count = 0
          and coordinator_handoff_at is null
          and coordinator_handoff_by is null
          and coordinator_handoff_by_email = ''
          and coordinator_brief = ''
          and coordinator_brief_payload = '{}'::jsonb
        )
        or
        (
          coordinator_handoff_status = 'handed_off'
          and coordinator_handoff_count >= 1
          and coordinator_handoff_at is not null
          and coordinator_handoff_by is not null
          and char_length(pg_catalog.btrim(coordinator_handoff_by_email)) > 0
          and char_length(pg_catalog.btrim(coordinator_brief)) > 0
          and coordinator_brief_payload ? 'case'
          and coordinator_brief_payload ? 'classification'
          and coordinator_brief_payload ? 'current_customer_response'
          and coordinator_brief_payload ? 'product_impact'
          and coordinator_brief_payload ? 'requested_engineering_outcome'
          and coordinator_brief_payload ? 'safety_boundaries'
        )
      );
  end if;
end
$do$;

create index if not exists ai_engineering_work_items_handoff_idx
  on public.ai_engineering_work_items(coordinator_handoff_status, coordinator_handoff_at desc);

create or replace function quotedr_private.ai_operations_guard_coordinator_handoff()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.coordinator_handoff_count < old.coordinator_handoff_count then
    raise exception 'coordinator handoff count cannot be reduced';
  end if;

  if tg_op = 'UPDATE' and (
    new.coordinator_handoff_status is distinct from old.coordinator_handoff_status
    or new.coordinator_handoff_at is distinct from old.coordinator_handoff_at
    or new.coordinator_handoff_by is distinct from old.coordinator_handoff_by
    or new.coordinator_handoff_by_email is distinct from old.coordinator_handoff_by_email
    or new.coordinator_handoff_count is distinct from old.coordinator_handoff_count
    or new.coordinator_brief is distinct from old.coordinator_brief
    or new.coordinator_brief_payload is distinct from old.coordinator_brief_payload
  ) then
    if new.coordinator_handoff_status <> 'handed_off'
       or new.coordinator_handoff_count <> old.coordinator_handoff_count + 1
       or new.coordinator_handoff_at is null
       or new.coordinator_handoff_by is null
       or char_length(pg_catalog.btrim(new.coordinator_handoff_by_email)) = 0
       or char_length(pg_catalog.btrim(new.coordinator_brief)) = 0 then
      raise exception 'coordinator handoff requires a reviewed brief, actor, timestamp, and incremented audit count';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function quotedr_private.ai_operations_guard_coordinator_handoff()
  from public, anon, authenticated;

create or replace function quotedr_private.ai_operations_audit_coordinator_handoff()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
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
      'brief_snapshot', new.coordinator_brief_payload,
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

drop trigger if exists ai_engineering_work_items_coordinator_handoff_guard
  on public.ai_engineering_work_items;
create trigger ai_engineering_work_items_coordinator_handoff_guard
before insert or update on public.ai_engineering_work_items
for each row execute function quotedr_private.ai_operations_guard_coordinator_handoff();

drop trigger if exists ai_engineering_work_items_coordinator_handoff_audit
  on public.ai_engineering_work_items;
create trigger ai_engineering_work_items_coordinator_handoff_audit
after update on public.ai_engineering_work_items
for each row
when (new.coordinator_handoff_count > old.coordinator_handoff_count)
execute function quotedr_private.ai_operations_audit_coordinator_handoff();
