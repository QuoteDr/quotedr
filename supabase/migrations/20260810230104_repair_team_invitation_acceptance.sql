-- Repair the invitation acceptance RPC without weakening the account-member
-- uniqueness guarantee. The function's RETURNS TABLE output variable named
-- account_id made the original column-list conflict target ambiguous inside
-- PL/pgSQL (SQLSTATE 42702).

create or replace function public.quotedr_accept_team_invitation(p_token text)
returns table (
  account_id uuid,
  owner_user_id uuid,
  role_key text,
  role_name text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation public.account_invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token is null or length(p_token) < 32 or length(p_token) > 500 then
    raise exception 'Invitation token is invalid' using errcode = '22023';
  end if;

  select i.*
  into v_invitation
  from public.account_invitations i
  where i.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
  for update;

  if not found
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'Invitation is invalid or unavailable' using errcode = '22023';
  end if;

  select lower(btrim(u.email))
  into v_user_email
  from auth.users u
  where u.id = v_user_id
    and u.email_confirmed_at is not null;

  if v_user_email is null or v_user_email <> v_invitation.normalized_email then
    raise exception 'Sign in with the email address that was invited' using errcode = '42501';
  end if;

  -- Revalidate at acceptance time. An invitation may outlive a role change,
  -- and only an assignable role belonging to this account may be applied.
  if not private.account_role_is_valid(
    v_invitation.account_id,
    v_user_id,
    v_invitation.role_id
  ) then
    raise exception 'Invitation role is no longer available' using errcode = '23514';
  end if;

  if v_invitation.accepted_at is not null then
    -- A retry by the original invitee is read-only and returns the original
    -- outcome. Replays by another user, or after membership/role removal, do
    -- not recreate or modify membership state.
    if v_invitation.accepted_by_user_id is distinct from v_user_id
       or not exists (
         select 1
         from public.account_memberships m
         where m.account_id = v_invitation.account_id
           and m.user_id = v_user_id
           and m.role_id = v_invitation.role_id
           and m.status = 'active'
       ) then
      raise exception 'Invitation is invalid or unavailable' using errcode = '22023';
    end if;

    return query
    select a.id, a.owner_user_id, r.role_key, r.name
    from public.accounts a
    join public.account_roles r on r.id = v_invitation.role_id
    where a.id = v_invitation.account_id;
    return;
  end if;

  insert into public.account_memberships
    (account_id, user_id, role_id, status, invited_by_user_id)
  values
    (v_invitation.account_id, v_user_id, v_invitation.role_id, 'active', v_invitation.invited_by_user_id)
  on conflict on constraint account_memberships_account_id_user_id_key do update set
    role_id = excluded.role_id,
    status = 'active',
    invited_by_user_id = excluded.invited_by_user_id,
    updated_at = now();

  update public.account_invitations i
  set accepted_by_user_id = v_user_id,
      accepted_at = now()
  where i.id = v_invitation.id
    and i.accepted_at is null;

  if not found then
    raise exception 'Invitation is invalid or unavailable' using errcode = '22023';
  end if;

  insert into public.account_audit_events (
    account_id, actor_user_id, event_type, target_type, target_id, details
  ) values (
    v_invitation.account_id,
    v_user_id,
    'team.invitation.accepted',
    'invitation',
    v_invitation.id::text,
    jsonb_build_object(
      'email', v_invitation.normalized_email,
      'roleId', v_invitation.role_id
    )
  );

  return query
  select a.id, a.owner_user_id, r.role_key, r.name
  from public.accounts a
  join public.account_roles r on r.id = v_invitation.role_id
  where a.id = v_invitation.account_id;
end;
$function$;

revoke all on function public.quotedr_accept_team_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.quotedr_accept_team_invitation(text)
  to authenticated;
