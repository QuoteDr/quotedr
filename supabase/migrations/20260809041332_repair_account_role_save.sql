-- Repair custom-role creation, make same-name retries idempotent, and reserve
-- role-template administration for the account owner.

begin;

alter table public.account_permissions
  add column if not exists assignable_to_custom boolean not null default true;

update public.account_permissions
set assignable_to_custom = false
where permission_key = 'roles.manage';

do $block$
begin
  if exists (
    select 1
    from public.account_roles r
    where r.account_id is not null
      and r.archived_at is null
    group by r.account_id, lower(btrim(r.name))
    having count(*) > 1
  ) then
    raise exception 'Duplicate active custom role names must be resolved before applying this migration';
  end if;
end;
$block$;

create unique index if not exists account_roles_active_account_name_unique
  on public.account_roles(account_id, lower(btrim(name)))
  where account_id is not null and archived_at is null;

create or replace function public.quotedr_save_account_role(
  p_account_id uuid,
  p_role_id uuid,
  p_name text,
  p_description text,
  p_permission_keys text[],
  p_field_access jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_permission_keys text[];
  v_field_access jsonb := coalesce(p_field_access, '{}'::jsonb);
  v_visible_field_access jsonb := '{}'::jsonb;
  v_existing_name text;
  v_existing_description text;
  v_existing_permissions text[] := array[]::text[];
  v_existing_fields jsonb := '{}'::jsonb;
  v_field_rule_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and a.owner_user_id = auth.uid()
  ) or not private.user_has_account_permission(auth.uid(), p_account_id, 'roles.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Role name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if v_name ~ '[[:cntrl:]]' then
    raise exception 'Role name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if length(v_description) > 300 then
    raise exception 'Role description is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(v_field_access) <> 'object' then
    raise exception 'Field access must be an object' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_field_rule_count
  from jsonb_each_text(v_field_access);

  if v_field_rule_count > 200 then
    raise exception 'Role contains too many field rules' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_permission_keys
  from (
    select distinct btrim(value) as permission_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) as supplied(value)
    where value is not null and btrim(value) <> ''
  ) normalized;

  if cardinality(v_permission_keys) > 100 then
    raise exception 'Role contains an invalid number of permissions' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_permission_keys) as supplied(permission_key)
    where not exists (
      select 1
      from public.account_permissions p
      where p.permission_key = supplied.permission_key
    )
  ) then
    raise exception 'Role contains an unknown permission' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_permission_keys) as supplied(permission_key)
    join public.account_permissions p on p.permission_key = supplied.permission_key
    where not p.assignable_to_custom
  ) then
    raise exception 'Role contains an owner-only permission' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.account_permission_dependencies d
    where d.permission_key = any(v_permission_keys)
      and not (d.required_permission_key = any(v_permission_keys))
  ) then
    raise exception 'Role is missing a required permission' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(v_field_access) as supplied(field_key, access_level)
    left join public.account_fields f on f.field_key = supplied.field_key
    where f.field_key is null
       or supplied.access_level not in ('hidden', 'read', 'write')
  ) then
    raise exception 'Role contains an invalid field rule' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(v_field_access) as supplied(field_key, access_level)
    join public.account_fields f on f.field_key = supplied.field_key
    where supplied.access_level in ('read', 'write')
      and not (f.read_permission_key = any(v_permission_keys))
  ) then
    raise exception 'Field access requires its view permission' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(v_field_access) as supplied(field_key, access_level)
    join public.account_fields f on f.field_key = supplied.field_key
    where supplied.access_level = 'write'
      and (
        not f.supports_write
        or f.write_permission_key is null
        or not (f.write_permission_key = any(v_permission_keys))
      )
  ) then
    raise exception 'Field edit access requires its edit permission' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(supplied.field_key, supplied.access_level order by supplied.field_key), '{}'::jsonb)
  into v_visible_field_access
  from jsonb_each_text(v_field_access) as supplied(field_key, access_level)
  where supplied.access_level in ('read', 'write');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':' || lower(v_name), 0)
  );

  if exists (
    select 1
    from public.account_roles r
    where r.account_id is null
      and r.archived_at is null
      and lower(btrim(r.name)) = lower(v_name)
  ) then
    raise exception 'A role with this name already exists' using errcode = '23505';
  end if;

  if p_role_id is null then
    select r.id, r.name, r.description
    into v_role_id, v_existing_name, v_existing_description
    from public.account_roles r
    where r.account_id = p_account_id
      and r.archived_at is null
      and lower(btrim(r.name)) = lower(v_name)
    for update;

    if found then
      select coalesce(array_agg(rp.permission_key order by rp.permission_key), array[]::text[])
      into v_existing_permissions
      from public.account_role_permissions rp
      where rp.role_id = v_role_id;

      select coalesce(jsonb_object_agg(rf.field_key, rf.access_level order by rf.field_key), '{}'::jsonb)
      into v_existing_fields
      from public.account_role_fields rf
      where rf.role_id = v_role_id;

      if v_existing_name = v_name
         and v_existing_description = v_description
         and v_existing_permissions = v_permission_keys
         and v_existing_fields = v_visible_field_access then
        return v_role_id;
      end if;
      raise exception 'A role with this name already exists' using errcode = '23505';
    end if;

    insert into public.account_roles
      (account_id, role_key, name, description, is_system, is_assignable)
    values
      (p_account_id, 'custom_' || left(replace(extensions.gen_random_uuid()::text, '-', ''), 20),
       v_name, v_description, false, true)
    returning id into v_role_id;
  else
    select r.id, r.name, r.description
    into v_role_id, v_existing_name, v_existing_description
    from public.account_roles r
    where r.id = p_role_id
      and r.account_id = p_account_id
      and not r.is_system
      and r.archived_at is null
    for update;

    if not found then
      raise exception 'Custom role was not found' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.account_roles r
      where r.account_id = p_account_id
        and r.id <> v_role_id
        and r.archived_at is null
        and lower(btrim(r.name)) = lower(v_name)
    ) then
      raise exception 'A role with this name already exists' using errcode = '23505';
    end if;

    select coalesce(array_agg(rp.permission_key order by rp.permission_key), array[]::text[])
    into v_existing_permissions
    from public.account_role_permissions rp
    where rp.role_id = v_role_id;

    select coalesce(jsonb_object_agg(rf.field_key, rf.access_level order by rf.field_key), '{}'::jsonb)
    into v_existing_fields
    from public.account_role_fields rf
    where rf.role_id = v_role_id;

    if v_existing_name = v_name
       and v_existing_description = v_description
       and v_existing_permissions = v_permission_keys
       and v_existing_fields = v_visible_field_access then
      return v_role_id;
    end if;

    update public.account_roles
    set name = v_name,
        description = v_description,
        is_assignable = true,
        updated_at = now()
    where id = v_role_id;
  end if;

  delete from public.account_role_permissions where role_id = v_role_id;
  insert into public.account_role_permissions (role_id, permission_key)
  select v_role_id, supplied.permission_key
  from unnest(v_permission_keys) as supplied(permission_key);

  delete from public.account_role_fields where role_id = v_role_id;
  insert into public.account_role_fields (role_id, field_key, access_level)
  select v_role_id, supplied.field_key, supplied.access_level
  from jsonb_each_text(v_visible_field_access) as supplied(field_key, access_level);

  insert into public.account_audit_events
    (account_id, actor_user_id, event_type, target_type, target_id, details)
  values
    (p_account_id, auth.uid(),
     case when p_role_id is null then 'team.role.created' else 'team.role.updated' end,
     'role', v_role_id::text,
     jsonb_build_object(
       'permissionCount', cardinality(v_permission_keys),
       'fieldRuleCount', v_field_rule_count
     ));

  return v_role_id;
end;
$function$;

create or replace function public.quotedr_archive_account_role(
  p_account_id uuid,
  p_role_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and a.owner_user_id = auth.uid()
  ) or not private.user_has_account_permission(auth.uid(), p_account_id, 'roles.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  select r.id into v_role_id
  from public.account_roles r
  where r.id = p_role_id
    and r.account_id = p_account_id
    and not r.is_system
    and r.archived_at is null
  for update;

  if not found then
    raise exception 'Custom role was not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.account_memberships m where m.role_id = v_role_id) then
    raise exception 'Reassign members before archiving this role' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.account_invitations i
    where i.role_id = v_role_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  ) then
    raise exception 'Revoke pending invitations before archiving this role' using errcode = '23503';
  end if;

  update public.account_roles
  set is_assignable = false,
      archived_at = now(),
      updated_at = now()
  where id = v_role_id;

  insert into public.account_audit_events
    (account_id, actor_user_id, event_type, target_type, target_id, details)
  values
    (p_account_id, auth.uid(), 'team.role.archived', 'role', v_role_id::text, '{}'::jsonb);

  return true;
end;
$function$;

comment on column public.account_permissions.assignable_to_custom is
  'False for capabilities reserved to the account owner rather than assignable custom roles.';
comment on function public.quotedr_save_account_role(uuid, uuid, text, text, text[], jsonb) is
  'Atomically and idempotently creates or updates an owner-managed account role, enforcing capability prerequisites and field access.';

notify pgrst, 'reload schema';

commit;
