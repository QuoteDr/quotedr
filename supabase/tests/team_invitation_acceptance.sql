-- Disposable local database fixture for quotedr_accept_team_invitation().
-- Never run against a linked or production project.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'invitation-owner-a@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'invitation-valid@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'invitation-unrelated@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'invitation-owner-b@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'invitation-expired@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'invitation-revoked@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'invitation-role-mismatch@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'invitation-unconfirmed@example.invalid', '', null, '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'invitation-atomic@example.invalid', '', clock_timestamp(), '{"provider":"email","providers":["email"]}', '{}', clock_timestamp(), clock_timestamp());

insert into public.account_roles (
  id, account_id, role_key, name, description, is_system, is_assignable
)
select
  '73000000-0000-0000-0000-000000000001',
  a.id,
  'custom_invitation_fixture',
  'Invitation fixture',
  'Synthetic role used only by the disposable invitation test.',
  false,
  true
from public.accounts a
where a.owner_user_id = '72000000-0000-0000-0000-000000000001';

with invitation_fixture(email, token, created_at, expires_at, revoked_at) as (
  values
    ('invitation-valid@example.invalid'::text, 'qd-valid-invitation-token-000000000001'::text, clock_timestamp(), clock_timestamp() + interval '1 day', null::timestamptz),
    ('invitation-expired@example.invalid', 'qd-expired-invitation-token-00000000001', clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day', null::timestamptz),
    ('invitation-revoked@example.invalid', 'qd-revoked-invitation-token-00000000001', clock_timestamp(), clock_timestamp() + interval '1 day', clock_timestamp()),
    ('invitation-unconfirmed@example.invalid', 'qd-unconfirmed-invitation-token-0000001', clock_timestamp(), clock_timestamp() + interval '1 day', null::timestamptz),
    ('invitation-atomic@example.invalid', 'qd-atomic-invitation-token-000000000001', clock_timestamp(), clock_timestamp() + interval '1 day', null::timestamptz)
)
insert into public.account_invitations (
  account_id, email, role_id, token_hash, created_at, expires_at,
  invited_by_user_id, revoked_at
)
select
  a.id,
  f.email,
  r.id,
  extensions.digest(convert_to(f.token, 'UTF8'), 'sha256'),
  f.created_at,
  f.expires_at,
  a.owner_user_id,
  f.revoked_at
from invitation_fixture f
cross join public.accounts a
cross join public.account_roles r
where a.owner_user_id = '72000000-0000-0000-0000-000000000001'
  and r.account_id is null
  and r.role_key = 'estimator';

insert into public.account_invitations (
  account_id, email, role_id, token_hash, expires_at, invited_by_user_id
)
select
  a.id,
  'invitation-role-mismatch@example.invalid',
  '73000000-0000-0000-0000-000000000001',
  extensions.digest(convert_to('qd-role-mismatch-invitation-token-000001', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '1 day',
  a.owner_user_id
from public.accounts a
where a.owner_user_id = '72000000-0000-0000-0000-000000000001';

-- Simulate a role becoming invalid after a legitimate invitation was created.
-- Acceptance must revalidate the role/account relationship at call time.
update public.account_roles
set account_id = (
  select id from public.accounts
  where owner_user_id = '72000000-0000-0000-0000-000000000004'
)
where id = '73000000-0000-0000-0000-000000000001';

create function pg_temp.expect_invitation_error(p_token text, p_expected_state text)
returns void
language plpgsql
set search_path = ''
as $test$
declare
  v_state text;
begin
  begin
    perform * from public.quotedr_accept_team_invitation(p_token);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if v_state is null then
    raise exception 'invitation call unexpectedly succeeded; expected SQLSTATE %', p_expected_state;
  end if;
  if v_state <> p_expected_state then
    raise exception 'invitation call returned SQLSTATE %, expected %', v_state, p_expected_state;
  end if;
end;
$test$;

do $test$
declare
  v_security_definer boolean;
  v_config text[];
begin
  select p.prosecdef, p.proconfig
  into strict v_security_definer, v_config
  from pg_catalog.pg_proc p
  where p.oid = 'public.quotedr_accept_team_invitation(text)'::regprocedure;

  if not v_security_definer or not ('search_path=""' = any(coalesce(v_config, array[]::text[]))) then
    raise exception 'invitation RPC must remain SECURITY DEFINER with an empty search_path';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.quotedr_accept_team_invitation(text)', 'execute') then
    raise exception 'anon unexpectedly has invitation RPC execute permission';
  end if;
  if pg_catalog.has_function_privilege('service_role', 'public.quotedr_accept_team_invitation(text)', 'execute') then
    raise exception 'service_role unexpectedly has invitation RPC execute permission';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.quotedr_accept_team_invitation(text)', 'execute') then
    raise exception 'authenticated invitees need invitation RPC execute permission';
  end if;
end;
$test$;

-- Malformed and unknown tokens fail before any account data is returned.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_invitation_error(null, '22023');
select pg_temp.expect_invitation_error('too-short', '22023');
select pg_temp.expect_invitation_error(repeat('x', 501), '22023');
select pg_temp.expect_invitation_error('qd-unknown-invitation-token-00000000001', '22023');
reset role;

-- Neither another account owner nor an unrelated signed-in user can accept it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select pg_temp.expect_invitation_error('qd-valid-invitation-token-000000000001', '42501');
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000003', true);
select pg_temp.expect_invitation_error('qd-valid-invitation-token-000000000001', '42501');
reset role;

-- Expiry, revocation, confirmed-email binding, and live role linkage remain
-- independently enforced by the database function.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000005', true);
select pg_temp.expect_invitation_error('qd-expired-invitation-token-00000000001', '22023');
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000006', true);
select pg_temp.expect_invitation_error('qd-revoked-invitation-token-00000000001', '22023');
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000008', true);
select pg_temp.expect_invitation_error('qd-unconfirmed-invitation-token-0000001', '42501');
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000007', true);
select pg_temp.expect_invitation_error('qd-role-mismatch-invitation-token-000001', '23514');
reset role;

-- Force a failure after membership and invitation writes would have occurred.
-- The single RPC statement must roll every write back, including its audit row.
create function private.quotedr_test_reject_invitation_audit()
returns trigger
language plpgsql
set search_path = ''
as $test$
begin
  if new.event_type = 'team.invitation.accepted'
     and new.details ->> 'email' = 'invitation-atomic@example.invalid' then
    raise exception 'synthetic invitation audit failure';
  end if;
  return new;
end;
$test$;

create trigger quotedr_test_reject_invitation_audit
before insert on public.account_audit_events
for each row execute function private.quotedr_test_reject_invitation_audit();

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000009', true);
select pg_temp.expect_invitation_error('qd-atomic-invitation-token-000000000001', 'P0001');
reset role;

drop trigger quotedr_test_reject_invitation_audit on public.account_audit_events;
drop function private.quotedr_test_reject_invitation_audit();

do $test$
declare
  v_account_id uuid;
begin
  select id into strict v_account_id
  from public.accounts
  where owner_user_id = '72000000-0000-0000-0000-000000000001';

  if exists (
    select 1 from public.account_memberships
    where account_id = v_account_id
      and user_id = '72000000-0000-0000-0000-000000000009'
  ) then
    raise exception 'post-write failure left a partial membership';
  end if;
  if exists (
    select 1 from public.account_invitations
    where account_id = v_account_id
      and normalized_email = 'invitation-atomic@example.invalid'
      and accepted_at is not null
  ) then
    raise exception 'post-write failure left the invitation accepted';
  end if;
  if exists (
    select 1 from public.account_audit_events
    where account_id = v_account_id
      and details ->> 'email' = 'invitation-atomic@example.invalid'
  ) then
    raise exception 'post-write failure left a partial audit event';
  end if;
end;
$test$;

-- A valid confirmed invitee receives the invited role. Repeating the same
-- acceptance is a read-only success and does not duplicate state or audit.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', true);
do $test$
declare
  v_result record;
begin
  select * into strict v_result
  from public.quotedr_accept_team_invitation('qd-valid-invitation-token-000000000001');
  if v_result.owner_user_id <> '72000000-0000-0000-0000-000000000001'
     or v_result.role_key <> 'estimator'
     or v_result.role_name <> 'Estimator' then
    raise exception 'valid invitation returned the wrong account or role';
  end if;

  select * into strict v_result
  from public.quotedr_accept_team_invitation('qd-valid-invitation-token-000000000001');
  if v_result.owner_user_id <> '72000000-0000-0000-0000-000000000001'
     or v_result.role_key <> 'estimator' then
    raise exception 'same-invitee retry did not return the original result';
  end if;
end;
$test$;
reset role;

do $test$
declare
  v_account_id uuid;
  v_invitation_id uuid;
  v_estimator_role_id uuid;
begin
  select id into strict v_account_id
  from public.accounts
  where owner_user_id = '72000000-0000-0000-0000-000000000001';
  select id into strict v_estimator_role_id
  from public.account_roles
  where account_id is null and role_key = 'estimator';
  select id into strict v_invitation_id
  from public.account_invitations
  where account_id = v_account_id
    and normalized_email = 'invitation-valid@example.invalid';

  if (select count(*) from public.account_memberships
      where account_id = v_account_id
        and user_id = '72000000-0000-0000-0000-000000000002'
        and role_id = v_estimator_role_id
        and status = 'active') <> 1 then
    raise exception 'valid acceptance did not create exactly one active estimator membership';
  end if;
  if not exists (
    select 1 from public.account_invitations
    where id = v_invitation_id
      and accepted_by_user_id = '72000000-0000-0000-0000-000000000002'
      and accepted_at is not null
  ) then
    raise exception 'valid acceptance did not bind the invitation to the invitee';
  end if;
  if (select count(*) from public.account_audit_events
      where account_id = v_account_id
        and actor_user_id = '72000000-0000-0000-0000-000000000002'
        and event_type = 'team.invitation.accepted'
        and target_type = 'invitation'
        and target_id = v_invitation_id::text) <> 1 then
    raise exception 'valid acceptance/retry did not produce exactly one audit event';
  end if;
end;
$test$;

-- A consumed token cannot be replayed by a different account identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000003', true);
select pg_temp.expect_invitation_error('qd-valid-invitation-token-000000000001', '42501');
reset role;

-- A later retry must not reactivate a membership that an owner suspended.
update public.account_memberships m
set status = 'suspended'
from public.accounts a
where m.account_id = a.id
  and a.owner_user_id = '72000000-0000-0000-0000-000000000001'
  and m.user_id = '72000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_invitation_error('qd-valid-invitation-token-000000000001', '22023');
reset role;

do $test$
begin
  if not exists (
    select 1
    from public.account_memberships m
    join public.accounts a on a.id = m.account_id
    where a.owner_user_id = '72000000-0000-0000-0000-000000000001'
      and m.user_id = '72000000-0000-0000-0000-000000000002'
      and m.status = 'suspended'
  ) then
    raise exception 'accepted-token retry changed a suspended membership';
  end if;
end;
$test$;

select 'team invitation acceptance fixture passed' as result;
rollback;
