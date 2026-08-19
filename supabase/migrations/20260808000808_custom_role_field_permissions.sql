-- Account-scoped role templates and field-level access controls.
--
-- Capabilities answer "may this role perform the operation?" Field access
-- answers "which customer-facing values may the role view or change?" Missing
-- field mappings are intentionally treated as hidden by the API.

begin;

alter table public.account_roles
  add column if not exists archived_at timestamptz;

create table public.account_permission_dependencies (
  permission_key text not null references public.account_permissions(permission_key) on delete cascade,
  required_permission_key text not null references public.account_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (permission_key, required_permission_key),
  constraint account_permission_dependencies_no_self
    check (permission_key <> required_permission_key)
);

create table public.account_fields (
  field_key text primary key,
  name text not null,
  description text not null default '',
  category text not null,
  sensitive boolean not null default false,
  supports_write boolean not null default true,
  read_permission_key text not null references public.account_permissions(permission_key) on delete restrict,
  write_permission_key text references public.account_permissions(permission_key) on delete restrict,
  sort_order integer not null default 0,
  constraint account_fields_key_format
    check (field_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint account_fields_name_present
    check (length(btrim(name)) between 1 and 120),
  constraint account_fields_write_consistency
    check (supports_write or write_permission_key is null)
);

create table public.account_role_fields (
  role_id uuid not null references public.account_roles(id) on delete cascade,
  field_key text not null references public.account_fields(field_key) on delete cascade,
  access_level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, field_key),
  constraint account_role_fields_access_level
    check (access_level in ('read', 'write'))
);

create index account_permission_dependencies_required_idx
  on public.account_permission_dependencies(required_permission_key, permission_key);
create index account_role_fields_field_idx
  on public.account_role_fields(field_key, role_id);
create index account_roles_active_account_idx
  on public.account_roles(account_id, name)
  where archived_at is null;

insert into public.account_permissions
  (permission_key, name, description, category, sensitive, sort_order)
values
  ('quotes.fields.write', 'Edit allowed quote fields', 'Edit quote fields whose field-level access is set to Edit. Creating or updating a quote still requires its own capability.', 'quotes', false, 125)
on conflict (permission_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sensitive = excluded.sensitive,
  sort_order = excluded.sort_order;

insert into public.account_permission_dependencies (permission_key, required_permission_key)
values
  ('team.manage', 'team.read'),
  ('roles.manage', 'team.read'),
  ('business.manage', 'business.read'),
  ('quotes.create', 'quotes.read'),
  ('quotes.update', 'quotes.read'),
  ('quotes.fields.write', 'quotes.read'),
  ('quotes.delete', 'quotes.read'),
  ('quotes.send', 'quotes.read'),
  ('quotes.pricing.read', 'quotes.read'),
  ('quotes.pricing.manage', 'quotes.pricing.read'),
  ('items.manage', 'items.read'),
  ('items.pricing.read', 'items.read'),
  ('clients.manage', 'clients.read'),
  ('clients.delete', 'clients.read'),
  ('templates.manage', 'templates.read'),
  ('payments.manage', 'payments.read'),
  ('billing.manage', 'billing.read'),
  ('labor.manage', 'labor.read')
on conflict do nothing;

insert into public.account_fields
  (field_key, name, description, category, sensitive, supports_write,
   read_permission_key, write_permission_key, sort_order)
values
  ('quotes.number', 'Quote number', 'Quote and change-order reference numbers.', 'quotes', false, true, 'quotes.read', 'quotes.fields.write', 100),
  ('quotes.title', 'Quote title', 'Customer-facing quote title.', 'quotes', false, true, 'quotes.read', 'quotes.fields.write', 110),
  ('quotes.client_name', 'Client name', 'Client name shown on the quote.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 120),
  ('quotes.client_phone', 'Client phone', 'Client phone number stored on the quote.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 130),
  ('quotes.client_email', 'Client email', 'Client email address stored on the quote.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 140),
  ('quotes.project_address', 'Project address', 'Job address and location stored on the quote.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 150),
  ('quotes.scope', 'Scope and line items', 'Rooms, quantities, descriptions, and job-specific line notes.', 'quotes', false, true, 'quotes.read', 'quotes.fields.write', 160),
  ('quotes.customer_pricing', 'Customer pricing', 'Sell rates, discounts, tax, subtotals, and customer totals. Internal costs and margins require separate capabilities.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 170),
  ('quotes.notes', 'Quote notes', 'General quote notes outside individual scope lines.', 'quotes', true, true, 'quotes.read', 'quotes.fields.write', 180),
  ('quotes.terms', 'Terms and payment terms', 'Customer-facing terms and payment schedule wording.', 'quotes', false, true, 'quotes.read', 'quotes.fields.write', 190),
  ('quotes.dates', 'Quote dates', 'Quote date and validity date.', 'quotes', false, true, 'quotes.read', 'quotes.fields.write', 200),

  ('clients.name', 'Client name', 'Client or company name in the saved client list.', 'clients', true, true, 'clients.read', 'clients.manage', 300),
  ('clients.phone', 'Client phone', 'Phone number in the saved client list.', 'clients', true, true, 'clients.read', 'clients.manage', 310),
  ('clients.email', 'Client email', 'Email address in the saved client list.', 'clients', true, true, 'clients.read', 'clients.manage', 320),
  ('clients.address', 'Client address', 'Street address, city, province, and postal code.', 'clients', true, true, 'clients.read', 'clients.manage', 330),
  ('clients.notes', 'Client notes', 'Private notes saved on the client record.', 'clients', true, true, 'clients.read', 'clients.manage', 340),
  ('clients.crm', 'Client history and properties', 'Saved properties and client relationship details.', 'clients', true, true, 'clients.read', 'clients.manage', 350),

  ('business.company_name', 'Company name', 'Customer-facing company name.', 'business', false, false, 'business.read', null, 400),
  ('business.tagline', 'Company tagline', 'Customer-facing company tagline.', 'business', false, false, 'business.read', null, 405),
  ('business.owner_name', 'Owner name', 'Owner or primary contact shown on documents.', 'business', true, false, 'business.read', null, 410),
  ('business.address', 'Company address', 'Company street address, city, province, and postal code.', 'business', true, false, 'business.read', null, 420),
  ('business.phone', 'Company phone', 'Customer-facing company phone number.', 'business', true, false, 'business.read', null, 430),
  ('business.email', 'Company email', 'Customer-facing company email address.', 'business', true, false, 'business.read', null, 440),
  ('business.tax_number', 'Tax number', 'HST, GST, or other tax registration number.', 'business', true, false, 'business.read', null, 450),
  ('business.logo', 'Company logo', 'Customer-facing company logo.', 'business', false, false, 'business.read', null, 460),

  ('items.name', 'Saved item name', 'Name or label of a saved item.', 'items', false, false, 'items.read', null, 500),
  ('items.description', 'Saved item description', 'Reusable description and notes for a saved item.', 'items', false, false, 'items.read', null, 510),
  ('items.sell_price', 'Saved item sell price', 'Customer-facing rate or price. Material cost and margin remain separately protected.', 'items', true, false, 'items.read', null, 520),
  ('items.photos', 'Saved item photos', 'Photos attached to reusable saved items.', 'items', true, false, 'items.read', null, 530)
on conflict (field_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sensitive = excluded.sensitive,
  supports_write = excluded.supports_write,
  read_permission_key = excluded.read_permission_key,
  write_permission_key = excluded.write_permission_key,
  sort_order = excluded.sort_order;

insert into public.account_role_permissions (role_id, permission_key)
select r.id, 'quotes.fields.write'
from public.account_roles r
where r.account_id is null and r.role_key in ('owner', 'estimator')
on conflict do nothing;

-- Owners receive every available field. Read-only fields remain read-only in
-- the team API even though owners keep their legacy direct-table access.
insert into public.account_role_fields (role_id, field_key, access_level)
select
  r.id,
  f.field_key,
  case when f.supports_write then 'write' else 'read' end
from public.account_roles r
cross join public.account_fields f
where r.account_id is null and r.role_key = 'owner'
on conflict (role_id, field_key) do update set
  access_level = excluded.access_level,
  updated_at = now();

-- The default estimator can build quotes and manage client details while only
-- viewing the customer-facing business profile and saved-item catalog.
insert into public.account_role_fields (role_id, field_key, access_level)
select r.id, seeded.field_key, seeded.access_level
from public.account_roles r
cross join (values
  ('quotes.number', 'write'),
  ('quotes.title', 'write'),
  ('quotes.client_name', 'write'),
  ('quotes.client_phone', 'write'),
  ('quotes.client_email', 'write'),
  ('quotes.project_address', 'write'),
  ('quotes.scope', 'write'),
  ('quotes.customer_pricing', 'write'),
  ('quotes.notes', 'write'),
  ('quotes.terms', 'write'),
  ('quotes.dates', 'write'),
  ('clients.name', 'write'),
  ('clients.phone', 'write'),
  ('clients.email', 'write'),
  ('clients.address', 'write'),
  ('clients.notes', 'write'),
  ('clients.crm', 'write'),
  ('business.company_name', 'read'),
  ('business.tagline', 'read'),
  ('business.owner_name', 'read'),
  ('business.address', 'read'),
  ('business.phone', 'read'),
  ('business.email', 'read'),
  ('business.tax_number', 'read'),
  ('business.logo', 'read'),
  ('items.name', 'read'),
  ('items.description', 'read'),
  ('items.sell_price', 'read'),
  ('items.photos', 'read')
) as seeded(field_key, access_level)
where r.account_id is null and r.role_key = 'estimator'
on conflict (role_id, field_key) do update set
  access_level = excluded.access_level,
  updated_at = now();

create or replace function private.account_role_is_valid(p_account_id uuid, p_user_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.account_roles r
    join public.accounts a on a.id = p_account_id
    where r.id = p_role_id
      and r.archived_at is null
      and (r.account_id is null or r.account_id = p_account_id)
      and (
        (r.is_system and r.role_key = 'owner' and p_user_id = a.owner_user_id)
        or (r.is_assignable and r.role_key <> 'owner' and p_user_id <> a.owner_user_id)
      )
  );
$function$;

create or replace function private.validate_account_invitation_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.account_roles r
    where r.id = new.role_id
      and r.is_assignable
      and r.archived_at is null
      and r.role_key <> 'owner'
      and (r.account_id is null or r.account_id = new.account_id)
  ) then
    raise exception 'Role is not assignable for this account invitation' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create or replace function public.quotedr_account_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(context_row.account_json order by context_row.account_name), '[]'::jsonb)
  from (
    select
      a.name as account_name,
      jsonb_build_object(
        'accountId', a.id,
        'ownerUserId', a.owner_user_id,
        'name', a.name,
        'membershipId', m.id,
        'role', jsonb_build_object(
          'id', r.id,
          'key', r.role_key,
          'name', r.name
        ),
        'permissions', coalesce((
          select jsonb_agg(rp.permission_key order by p.sort_order, rp.permission_key)
          from public.account_role_permissions rp
          join public.account_permissions p on p.permission_key = rp.permission_key
          where rp.role_id = r.id
        ), '[]'::jsonb),
        'fields', coalesce((
          select jsonb_object_agg(rf.field_key, rf.access_level order by f.sort_order, rf.field_key)
          from public.account_role_fields rf
          join public.account_fields f on f.field_key = rf.field_key
          where rf.role_id = r.id
        ), '{}'::jsonb)
      ) as account_json
    from public.accounts a
    join public.account_memberships m on m.account_id = a.id
    join public.account_roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.status = 'active'
      and r.archived_at is null
  ) context_row;
$function$;

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
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.user_has_account_permission(auth.uid(), p_account_id, 'roles.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Role name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if length(v_description) > 300 then
    raise exception 'Role description is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(v_field_access) <> 'object' then
    raise exception 'Field access must be an object' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_permission_keys
  from (
    select distinct btrim(value) as permission_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) as supplied(value)
    where value is not null and btrim(value) <> ''
  ) normalized;

  if exists (
    select 1
    from unnest(v_permission_keys) as supplied(permission_key)
    where not exists (
      select 1 from public.account_permissions p
      where p.permission_key = supplied.permission_key
    )
  ) then
    raise exception 'Role contains an unknown permission' using errcode = '22023';
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

  if p_role_id is null then
    insert into public.account_roles
      (account_id, role_key, name, description, is_system, is_assignable)
    values
      (p_account_id, 'custom_' || left(replace(extensions.gen_random_uuid()::text, '-', ''), 20),
       v_name, v_description, false, true)
    returning id into v_role_id;
  else
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
  from jsonb_each_text(v_field_access) as supplied(field_key, access_level)
  where supplied.access_level in ('read', 'write');

  insert into public.account_audit_events
    (account_id, actor_user_id, event_type, target_type, target_id, details)
  values
    (p_account_id, auth.uid(),
     case when p_role_id is null then 'team.role.created' else 'team.role.updated' end,
     'role', v_role_id::text,
     jsonb_build_object(
       'permissionCount', cardinality(v_permission_keys),
       'fieldRuleCount', jsonb_object_length(v_field_access)
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
  if not private.user_has_account_permission(auth.uid(), p_account_id, 'roles.manage') then
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

alter table public.account_permission_dependencies enable row level security;
alter table public.account_fields enable row level security;
alter table public.account_role_fields enable row level security;

revoke all on table public.account_permission_dependencies from public, anon, authenticated;
revoke all on table public.account_fields from public, anon, authenticated;
revoke all on table public.account_role_fields from public, anon, authenticated;

grant all on table public.account_permission_dependencies to service_role;
grant all on table public.account_fields to service_role;
grant all on table public.account_role_fields to service_role;

revoke all on function public.quotedr_account_context() from public, anon, authenticated;
revoke all on function public.quotedr_save_account_role(uuid, uuid, text, text, text[], jsonb) from public, anon, authenticated;
revoke all on function public.quotedr_archive_account_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.quotedr_account_context() to authenticated;
grant execute on function public.quotedr_save_account_role(uuid, uuid, text, text, text[], jsonb) to authenticated;
grant execute on function public.quotedr_archive_account_role(uuid, uuid) to authenticated;

comment on table public.account_permission_dependencies is
  'Data-driven capability prerequisites used by the role editor and enforced when a custom role is saved.';
comment on table public.account_fields is
  'Stable customer-facing field catalog. A missing per-role mapping means hidden.';
comment on table public.account_role_fields is
  'Per-role field visibility and edit levels. Authorization remains capability plus field access.';
comment on function public.quotedr_save_account_role(uuid, uuid, text, text, text[], jsonb) is
  'Atomically creates or updates an account-scoped role after a live roles.manage check.';

notify pgrst, 'reload schema';

commit;
