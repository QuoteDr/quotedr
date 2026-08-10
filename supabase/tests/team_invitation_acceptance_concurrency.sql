-- Deterministic concurrent acceptance fixture for the disposable local stack.
-- Never run against a linked or production project.
\if :{?qd_disposable_db_password}
\else
  \warn 'Set qd_disposable_db_password to the local disposable database password.'
  \quit 3
\endif

begin;

drop trigger if exists quotedr_test_hold_concurrent_acceptance on public.account_memberships;
drop function if exists private.quotedr_test_hold_concurrent_acceptance();

delete from auth.users
where id in (
  '72000000-0000-0000-0000-000000000010',
  '72000000-0000-0000-0000-000000000011'
);

create extension if not exists dblink with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'invitation-concurrent-owner@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'invitation-concurrent@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp());

insert into public.account_invitations (
  account_id, email, role_id, token_hash, expires_at, invited_by_user_id
)
select
  a.id,
  'invitation-concurrent@example.invalid',
  r.id,
  extensions.digest(convert_to('qd-concurrent-invitation-token-00000001', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '1 day',
  a.owner_user_id
from public.accounts a
join public.account_roles r on r.account_id is null and r.role_key = 'estimator'
where a.owner_user_id = '72000000-0000-0000-0000-000000000010';

-- The first acceptance holds the invitation row while this trigger waits on
-- an advisory lock owned by the controller session. That lets the second call
-- reach the same locked invitation before the first transaction is released.
create function private.quotedr_test_hold_concurrent_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $test$
begin
  if new.user_id = '72000000-0000-0000-0000-000000000011' then
    perform pg_catalog.pg_advisory_xact_lock(720011);
  end if;
  return new;
end;
$test$;

create trigger quotedr_test_hold_concurrent_acceptance
before insert on public.account_memberships
for each row execute function private.quotedr_test_hold_concurrent_acceptance();

commit;

create temporary table concurrent_acceptance_results (
  attempt text not null,
  account_id uuid not null,
  owner_user_id uuid not null,
  role_key text not null,
  role_name text not null
);

select extensions.dblink_connect(
  'invitation_accept_1',
  format(
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=%s application_name=quotedr_invitation_accept_1',
    :'qd_disposable_db_password'
  )
);
select extensions.dblink_connect(
  'invitation_accept_2',
  format(
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=%s application_name=quotedr_invitation_accept_2',
    :'qd_disposable_db_password'
  )
);
select extensions.dblink_exec('invitation_accept_1', 'set role authenticated');
select extensions.dblink_exec('invitation_accept_2', 'set role authenticated');
select *
from extensions.dblink(
  'invitation_accept_1',
  $$select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000011', false)$$
) as configured(value text);
select *
from extensions.dblink(
  'invitation_accept_2',
  $$select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000011', false)$$
) as configured(value text);

select pg_catalog.pg_advisory_lock(720011);
select extensions.dblink_send_query(
  'invitation_accept_1',
  $$select * from public.quotedr_accept_team_invitation('qd-concurrent-invitation-token-00000001')$$
);

do $test$
declare
  v_attempt integer;
begin
  for v_attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity a
      where a.application_name = 'quotedr_invitation_accept_1'
        and a.wait_event_type = 'Lock'
        and a.wait_event = 'advisory'
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_stat_activity a
    where a.application_name = 'quotedr_invitation_accept_1'
      and a.wait_event_type = 'Lock'
      and a.wait_event = 'advisory'
  ) then
    raise exception 'first acceptance did not reach the deterministic concurrency gate';
  end if;
end;
$test$;

select extensions.dblink_send_query(
  'invitation_accept_2',
  $$select * from public.quotedr_accept_team_invitation('qd-concurrent-invitation-token-00000001')$$
);

do $test$
declare
  v_attempt integer;
begin
  for v_attempt in 1..100 loop
    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity a
      where a.application_name = 'quotedr_invitation_accept_2'
        and a.wait_event_type = 'Lock'
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_stat_activity a
    where a.application_name = 'quotedr_invitation_accept_2'
      and a.wait_event_type = 'Lock'
  ) then
    raise exception 'second acceptance did not overlap the first locked invitation';
  end if;
end;
$test$;

select pg_catalog.pg_advisory_unlock(720011);

insert into concurrent_acceptance_results
select 'first', result.*
from extensions.dblink_get_result('invitation_accept_1')
  as result(account_id uuid, owner_user_id uuid, role_key text, role_name text);

insert into concurrent_acceptance_results
select 'second', result.*
from extensions.dblink_get_result('invitation_accept_2')
  as result(account_id uuid, owner_user_id uuid, role_key text, role_name text);

select extensions.dblink_disconnect('invitation_accept_1');
select extensions.dblink_disconnect('invitation_accept_2');

begin;

drop trigger quotedr_test_hold_concurrent_acceptance on public.account_memberships;
drop function private.quotedr_test_hold_concurrent_acceptance();

do $test$
declare
  v_account_id uuid;
  v_invitation_id uuid;
begin
  select id into strict v_account_id
  from public.accounts
  where owner_user_id = '72000000-0000-0000-0000-000000000010';
  select id into strict v_invitation_id
  from public.account_invitations
  where account_id = v_account_id
    and normalized_email = 'invitation-concurrent@example.invalid';

  if (select count(*) from concurrent_acceptance_results) <> 2
     or exists (
       select 1 from concurrent_acceptance_results
       where account_id <> v_account_id
          or owner_user_id <> '72000000-0000-0000-0000-000000000010'
          or role_key <> 'estimator'
          or role_name <> 'Estimator'
     ) then
    raise exception 'concurrent calls did not both return the same estimator acceptance result';
  end if;
  if (select count(*) from public.account_memberships
      where account_id = v_account_id
        and user_id = '72000000-0000-0000-0000-000000000011'
        and status = 'active') <> 1 then
    raise exception 'concurrent acceptance created duplicate or invalid membership state';
  end if;
  if not exists (
    select 1 from public.account_invitations
    where id = v_invitation_id
      and accepted_by_user_id = '72000000-0000-0000-0000-000000000011'
      and accepted_at is not null
  ) then
    raise exception 'concurrent acceptance did not bind the invitation once';
  end if;
  if (select count(*) from public.account_audit_events
      where account_id = v_account_id
        and event_type = 'team.invitation.accepted'
        and target_id = v_invitation_id::text) <> 1 then
    raise exception 'concurrent acceptance wrote more than one audit event';
  end if;
end;
$test$;

delete from auth.users
where id in (
  '72000000-0000-0000-0000-000000000010',
  '72000000-0000-0000-0000-000000000011'
);

drop extension dblink;

select 'concurrent team invitation acceptance fixture passed' as result;
commit;
