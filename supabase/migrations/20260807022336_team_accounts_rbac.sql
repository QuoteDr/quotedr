-- QuoteDr multi-user account and permission foundation.
--
-- Existing operational rows keep their user_id owner for backwards compatibility.
-- Team members never receive direct access to sensitive operational tables. The
-- authenticated team-account Edge Function authorizes each operation in Postgres,
-- then returns a purpose-built, redacted representation.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My company',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_name_present check (length(btrim(name)) between 1 and 120)
);

create table public.account_permissions (
  permission_key text primary key,
  name text not null,
  description text not null default '',
  category text not null,
  sensitive boolean not null default false,
  sort_order integer not null default 0,
  constraint account_permissions_key_format
    check (permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create table public.account_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  is_assignable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_roles_key_format check (role_key ~ '^[a-z][a-z0-9_]*$'),
  constraint account_roles_scope_check check (
    (is_system and account_id is null)
    or (not is_system and account_id is not null)
  ),
  constraint account_roles_owner_reserved check (
    role_key <> 'owner'
    or (is_system and account_id is null and is_assignable = false)
  ),
  unique nulls not distinct (account_id, role_key)
);

create table public.account_role_permissions (
  role_id uuid not null references public.account_roles(id) on delete cascade,
  permission_key text not null references public.account_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table public.account_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.account_roles(id) on delete restrict,
  status text not null default 'active',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_memberships_status_check check (status in ('active', 'suspended')),
  unique (account_id, user_id)
);

create table public.account_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  normalized_email text generated always as (lower(btrim(email))) stored,
  role_id uuid not null references public.account_roles(id) on delete restrict,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_invitations_email_present check (position('@' in email) > 1),
  constraint account_invitations_expiry_check check (expires_at > created_at),
  constraint account_invitations_acceptance_check check (
    (accepted_at is null and accepted_by_user_id is null)
    or (accepted_at is not null and accepted_by_user_id is not null)
  )
);

create table public.account_audit_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_audit_event_type_format check (event_type ~ '^[a-z][a-z0-9_.-]*$')
);

create index account_roles_account_id_idx on public.account_roles(account_id);
create index account_role_permissions_permission_idx on public.account_role_permissions(permission_key, role_id);
create index account_memberships_user_account_idx on public.account_memberships(user_id, account_id) include (role_id, status);
create index account_memberships_account_status_idx on public.account_memberships(account_id, status);
create index account_invitations_account_idx on public.account_invitations(account_id, created_at desc);
create unique index account_invitations_open_email_idx on public.account_invitations(account_id, normalized_email)
  where accepted_at is null and revoked_at is null;
create index account_audit_events_account_idx on public.account_audit_events(account_id, created_at desc);

insert into public.account_permissions
  (permission_key, name, description, category, sensitive, sort_order)
values
  ('account.read', 'View account', 'View basic company and membership context.', 'account', false, 10),
  ('team.read', 'View team', 'View team members, roles, and pending invitations.', 'team', false, 20),
  ('team.manage', 'Manage team', 'Invite, suspend, remove, and change team members.', 'team', true, 30),
  ('roles.manage', 'Manage roles', 'Create roles and change their permissions.', 'team', true, 40),
  ('business.read', 'View business profile', 'View customer-facing company details.', 'business', false, 50),
  ('business.manage', 'Manage business profile', 'Change customer-facing company details.', 'business', true, 60),
  ('settings.manage', 'Manage account settings', 'Change company-wide application settings.', 'account', true, 70),
  ('quotes.read', 'View quotes', 'View quote content with fields allowed by pricing permissions.', 'quotes', false, 100),
  ('quotes.create', 'Create quotes', 'Create quotes for this account.', 'quotes', false, 110),
  ('quotes.update', 'Edit quotes', 'Edit quotes while preserving protected fields.', 'quotes', false, 120),
  ('quotes.delete', 'Delete quotes', 'Permanently delete quotes.', 'quotes', true, 130),
  ('quotes.send', 'Send quotes', 'Create client links and send quotes to customers.', 'quotes', true, 140),
  ('quotes.pricing.read', 'View quote costs and margins', 'View costs, markups, margins, and profit.', 'pricing', true, 150),
  ('quotes.pricing.manage', 'Manage quote costs and margins', 'Change costs, markups, and margin settings.', 'pricing', true, 160),
  ('items.read', 'View saved items', 'Use saved items with fields allowed by pricing permissions.', 'items', false, 200),
  ('items.manage', 'Manage saved items', 'Create, update, and delete saved items.', 'items', true, 210),
  ('items.pricing.read', 'View saved item costs', 'View material costs and supplier information.', 'pricing', true, 220),
  ('clients.read', 'View clients', 'View client contact and project details.', 'clients', false, 300),
  ('clients.manage', 'Manage clients', 'Create and update client records.', 'clients', false, 310),
  ('clients.delete', 'Delete clients', 'Permanently delete client records.', 'clients', true, 320),
  ('templates.read', 'View templates', 'Use account quote templates.', 'templates', false, 400),
  ('templates.manage', 'Manage templates', 'Create, update, and delete templates.', 'templates', true, 410),
  ('payments.read', 'View payment records', 'View customer payments and payout status.', 'payments', true, 500),
  ('payments.manage', 'Manage payment settings', 'Connect Stripe and change payment rules.', 'payments', true, 510),
  ('billing.read', 'View QuoteDr billing', 'View plan, invoices, and subscription status.', 'billing', true, 600),
  ('billing.manage', 'Manage QuoteDr billing', 'Change plan and subscription.', 'billing', true, 610),
  ('integrations.manage', 'Manage integrations', 'Connect or change QuickBooks and other integrations.', 'integrations', true, 700),
  ('labor.read', 'View labor', 'View labor records and internal rates.', 'labor', true, 800),
  ('labor.manage', 'Manage labor', 'Change labor records and internal rates.', 'labor', true, 810),
  ('analytics.read', 'View analytics', 'View account performance analytics.', 'analytics', true, 900)
on conflict (permission_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sensitive = excluded.sensitive,
  sort_order = excluded.sort_order;

insert into public.account_roles (account_id, role_key, name, description, is_system, is_assignable)
values
  (null, 'owner', 'Owner', 'Full account access, including team, margins, payments, and billing.', true, false),
  (null, 'estimator', 'Estimator', 'Build quotes and use shared data without access to protected costs or account administration.', true, true)
on conflict (account_id, role_key) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  is_assignable = excluded.is_assignable;

insert into public.account_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.account_roles r
cross join public.account_permissions p
where r.account_id is null and r.role_key = 'owner'
on conflict do nothing;

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
      and (r.account_id is null or r.account_id = p_account_id)
      and (
        (r.is_system and r.role_key = 'owner' and p_user_id = a.owner_user_id)
        or (r.is_assignable and r.role_key <> 'owner' and p_user_id <> a.owner_user_id)
      )
  );
$function$;

create or replace function private.validate_account_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.accounts a
    where a.id = new.account_id
      and a.owner_user_id = new.user_id
  ) and new.status <> 'active' then
    raise exception 'The account owner membership must remain active' using errcode = '23514';
  end if;
  if not private.account_role_is_valid(new.account_id, new.user_id, new.role_id) then
    raise exception 'Role is not valid for this account member' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
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
        ), '[]'::jsonb)
      ) as account_json
    from public.accounts a
    join public.account_memberships m on m.account_id = a.id
    join public.account_roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.status = 'active'
  ) context_row;
$function$;

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
  v_user_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invitation is invalid' using errcode = '22023';
  end if;

  select i.*
  into v_invitation
  from public.account_invitations i
  where i.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
  for update;

  if not found
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;

  select lower(btrim(u.email))
  into v_user_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_user_email is null or v_user_email <> v_invitation.normalized_email then
    raise exception 'Sign in with the email address that was invited' using errcode = '42501';
  end if;

  insert into public.account_memberships
    (account_id, user_id, role_id, status, invited_by_user_id)
  values
    (v_invitation.account_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by_user_id)
  on conflict (account_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    invited_by_user_id = excluded.invited_by_user_id,
    updated_at = now();

  update public.account_invitations
  set accepted_by_user_id = auth.uid(), accepted_at = now()
  where id = v_invitation.id;

  insert into public.account_audit_events
    (account_id, actor_user_id, event_type, target_type, target_id, details)
  values
    (v_invitation.account_id, auth.uid(), 'team.invitation.accepted', 'membership', auth.uid()::text,
     jsonb_build_object('invitationId', v_invitation.id));

  return query
  select a.id, a.owner_user_id, r.role_key, r.name
  from public.accounts a
  join public.account_roles r on r.id = v_invitation.role_id
  where a.id = v_invitation.account_id;
end;
$function$;

create trigger account_memberships_validate_role
before insert or update of account_id, user_id, role_id, status
on public.account_memberships
for each row execute function private.validate_account_membership_role();

create trigger account_invitations_validate_role
before insert or update of account_id, role_id
on public.account_invitations
for each row execute function private.validate_account_invitation_role();

create or replace function private.user_is_account_member(p_user_id uuid, p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.account_memberships m
    where m.user_id = p_user_id
      and m.account_id = p_account_id
      and m.status = 'active'
  );
$function$;

create or replace function private.user_has_account_permission(
  p_user_id uuid,
  p_account_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.account_memberships m
    join public.account_role_permissions rp on rp.role_id = m.role_id
    where m.user_id = p_user_id
      and m.account_id = p_account_id
      and m.status = 'active'
      and rp.permission_key = p_permission_key
  );
$function$;

create or replace function private.current_user_has_account_permission(
  p_account_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.user_has_account_permission(auth.uid(), p_account_id, p_permission_key);
$function$;

create or replace function private.current_user_has_owner_permission(
  p_owner_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.accounts a
    where a.owner_user_id = p_owner_user_id
      and private.user_has_account_permission(auth.uid(), a.id, p_permission_key)
  );
$function$;

create or replace function public.quotedr_authorize_account(
  p_account_id uuid,
  p_permission_key text
)
returns table (
  account_id uuid,
  owner_user_id uuid,
  membership_id uuid,
  role_id uuid,
  role_key text,
  role_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select a.id, a.owner_user_id, m.id, r.id, r.role_key, r.name
  from public.accounts a
  join public.account_memberships m on m.account_id = a.id
  join public.account_roles r on r.id = m.role_id
  join public.account_role_permissions rp on rp.role_id = r.id
  where a.id = p_account_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and rp.permission_key = p_permission_key
  limit 1;

  if not found then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.quotedr_authorize_account(uuid, text) from public, anon;
revoke all on function public.quotedr_account_context() from public, anon;
revoke all on function public.quotedr_accept_team_invitation(text) from public, anon;
grant execute on function public.quotedr_authorize_account(uuid, text) to authenticated;
grant execute on function public.quotedr_account_context() to authenticated;
grant execute on function public.quotedr_accept_team_invitation(text) to authenticated;

insert into public.account_role_permissions (role_id, permission_key)
select r.id, seeded.permission_key
from public.account_roles r
cross join (values
  ('account.read'),
  ('business.read'),
  ('quotes.read'),
  ('quotes.create'),
  ('quotes.update'),
  ('items.read'),
  ('clients.read'),
  ('clients.manage'),
  ('templates.read')
) as seeded(permission_key)
where r.account_id is null and r.role_key = 'estimator'
on conflict do nothing;

create or replace function private.provision_quotedr_owner_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid;
  v_owner_role_id uuid;
  v_account_name text;
begin
  -- User metadata is only a hint. Suppression also requires a live invitation
  -- row created by the trusted team API for this exact email address.
  if lower(coalesce(new.raw_user_meta_data ->> 'quotedr_team_invite', 'false')) = 'true'
     and exists (
       select 1
       from public.account_invitations i
       where i.id::text = coalesce(new.raw_user_meta_data ->> 'quotedr_invitation_id', '')
         and i.normalized_email = lower(btrim(new.email))
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > now()
     ) then
    return new;
  end if;

  v_account_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'business_name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'My company'
  ), 120);

  insert into public.accounts (owner_user_id, name)
  values (new.id, v_account_name)
  on conflict (owner_user_id) do update set owner_user_id = excluded.owner_user_id
  returning id into v_account_id;

  select id into v_owner_role_id
  from public.account_roles
  where account_id is null and role_key = 'owner';

  insert into public.account_memberships (account_id, user_id, role_id, status)
  values (v_account_id, new.id, v_owner_role_id, 'active')
  on conflict (account_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();

  return new;
end;
$function$;

create trigger quotedr_provision_owner_account
after insert on auth.users
for each row execute function private.provision_quotedr_owner_account();

insert into public.accounts (owner_user_id, name)
select
  u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'business_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'My company'
  ), 120)
from auth.users u
on conflict (owner_user_id) do nothing;

insert into public.account_memberships (account_id, user_id, role_id, status)
select a.id, a.owner_user_id, r.id, 'active'
from public.accounts a
join public.account_roles r on r.account_id is null and r.role_key = 'owner'
on conflict (account_id, user_id) do update set
  role_id = excluded.role_id,
  status = 'active',
  updated_at = now();

alter table public.quotes
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;
alter table public.items
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;
alter table public.clients
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;
alter table public.templates
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;

update public.quotes set created_by_user_id = user_id, updated_by_user_id = user_id
where created_by_user_id is null or updated_by_user_id is null;
update public.items set created_by_user_id = user_id, updated_by_user_id = user_id
where created_by_user_id is null or updated_by_user_id is null;
update public.clients set created_by_user_id = user_id, updated_by_user_id = user_id
where created_by_user_id is null or updated_by_user_id is null;
update public.templates set created_by_user_id = user_id, updated_by_user_id = user_id
where created_by_user_id is null or updated_by_user_id is null;

create or replace function private.set_quotedr_data_actor()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := coalesce(v_actor, new.created_by_user_id, new.user_id);
    new.updated_by_user_id := coalesce(v_actor, new.updated_by_user_id, new.created_by_user_id, new.user_id);
  else
    new.created_by_user_id := old.created_by_user_id;
    new.updated_by_user_id := coalesce(v_actor, new.updated_by_user_id, old.updated_by_user_id, new.user_id);
  end if;
  return new;
end;
$function$;

create trigger quotes_set_data_actor before insert or update on public.quotes
for each row execute function private.set_quotedr_data_actor();
create trigger items_set_data_actor before insert or update on public.items
for each row execute function private.set_quotedr_data_actor();
create trigger clients_set_data_actor before insert or update on public.clients
for each row execute function private.set_quotedr_data_actor();
create trigger templates_set_data_actor before insert or update on public.templates
for each row execute function private.set_quotedr_data_actor();

-- Operational rows deliberately remain owner-only at the database boundary.
-- These restrictive policies are an additional AND condition, so adding a
-- permissive policy later cannot accidentally expose raw rows to team members.
alter table public.quotes enable row level security;
alter table public.items enable row level security;
alter table public.clients enable row level security;
alter table public.templates enable row level security;
alter table public.user_data enable row level security;
alter table public.stripe_connected_accounts enable row level security;
alter table public.payment_records enable row level security;

create policy quotedr_quotes_owner_boundary
on public.quotes as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_items_owner_boundary
on public.items as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_clients_owner_boundary
on public.clients as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_templates_owner_boundary
on public.templates as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_user_data_owner_boundary
on public.user_data as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_stripe_accounts_owner_boundary
on public.stripe_connected_accounts as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy quotedr_payment_records_owner_boundary
on public.payment_records as restrictive for all to anon, authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table public.accounts enable row level security;
alter table public.account_permissions enable row level security;
alter table public.account_roles enable row level security;
alter table public.account_role_permissions enable row level security;
alter table public.account_memberships enable row level security;
alter table public.account_invitations enable row level security;
alter table public.account_audit_events enable row level security;

create policy accounts_select_member
on public.accounts for select to authenticated
using (private.user_is_account_member((select auth.uid()), id));

create policy account_permissions_select_authenticated
on public.account_permissions for select to authenticated
using (true);

create policy account_roles_select_member
on public.account_roles for select to authenticated
using (
  account_id is null
  or private.user_is_account_member((select auth.uid()), account_id)
);

create policy account_role_permissions_select_member
on public.account_role_permissions for select to authenticated
using (
  exists (
    select 1
    from public.account_roles r
    where r.id = role_id
      and (
        r.account_id is null
        or private.user_is_account_member((select auth.uid()), r.account_id)
      )
  )
);

create policy account_memberships_select_self_or_team_reader
on public.account_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_user_has_account_permission(account_id, 'team.read')
);

-- Invitation hashes and audit details are API-only. No authenticated policies
-- or grants are created for these tables.

revoke all on table public.accounts from public, anon, authenticated;
revoke all on table public.account_permissions from public, anon, authenticated;
revoke all on table public.account_roles from public, anon, authenticated;
revoke all on table public.account_role_permissions from public, anon, authenticated;
revoke all on table public.account_memberships from public, anon, authenticated;
revoke all on table public.account_invitations from public, anon, authenticated;
revoke all on table public.account_audit_events from public, anon, authenticated;

grant all on table public.accounts to service_role;
grant all on table public.account_permissions to service_role;
grant all on table public.account_roles to service_role;
grant all on table public.account_role_permissions to service_role;
grant all on table public.account_memberships to service_role;
grant all on table public.account_invitations to service_role;
grant all on table public.account_audit_events to service_role;
grant usage, select on sequence public.account_audit_events_id_seq to service_role;

comment on table public.accounts is
  'QuoteDr company accounts. Existing data continues to use owner_user_id as its tenant key.';
comment on table public.account_permissions is
  'Stable capabilities used by API and UI; roles are data, not authorization branches.';
comment on table public.account_invitations is
  'Hashed, expiring, single-use team invitations. Read and write only through the authenticated API.';
comment on table public.quotes is
  'Sensitive base records remain owner-only under RLS; team access uses the redacting team-account API.';
comment on table public.items is
  'Sensitive base records remain owner-only under RLS; team access uses the redacting team-account API.';

notify pgrst, 'reload schema';

commit;
