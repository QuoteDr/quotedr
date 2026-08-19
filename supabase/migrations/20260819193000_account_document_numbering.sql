-- Account-scoped client and document numbering.
-- Existing quote_number values and document links are deliberately untouched.

begin;

alter table public.accounts
  add column if not exists document_numbering_settings jsonb not null default '{}'::jsonb;

alter table public.accounts
  drop constraint if exists accounts_document_numbering_settings_object;
alter table public.accounts
  add constraint accounts_document_numbering_settings_object
  check (jsonb_typeof(document_numbering_settings) = 'object');

alter table public.clients
  add column if not exists client_number bigint;

with ranked_clients as (
  select
    c.id,
    coalesce((
      select max(existing.client_number)
      from public.clients existing
      where existing.user_id = c.user_id
    ), 0) + row_number() over (
      partition by c.user_id
      order by c.created_at nulls last, c.id
    )::bigint as assigned_number
  from public.clients c
  where c.client_number is null
)
update public.clients c
set client_number = ranked_clients.assigned_number
from ranked_clients
where c.id = ranked_clients.id
  and c.client_number is null;

create unique index if not exists clients_user_client_number_uidx
  on public.clients (user_id, client_number)
  where client_number is not null;

create table if not exists public.account_document_sequences (
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_type text not null,
  period_key text not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (account_id, document_type, period_key),
  constraint account_document_sequences_type_check
    check (document_type in ('client', 'quote', 'invoice', 'change_order', 'revision')),
  constraint account_document_sequences_period_present
    check (length(btrim(period_key)) between 1 and 16),
  constraint account_document_sequences_next_positive
    check (next_value > 0)
);

create table if not exists public.account_document_numbers (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  document_type text not null,
  document_number text not null,
  normalized_number text generated always as (lower(btrim(document_number))) stored,
  sequence_value bigint not null,
  period_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint account_document_numbers_type_check
    check (document_type in ('quote', 'invoice', 'change_order', 'revision')),
  constraint account_document_numbers_value_present
    check (length(btrim(document_number)) between 1 and 100),
  unique (account_id, normalized_number)
);

create index if not exists account_document_numbers_client_idx
  on public.account_document_numbers (account_id, client_id, created_at desc);
create index if not exists account_document_numbers_type_idx
  on public.account_document_numbers (account_id, document_type, created_at desc);

insert into public.account_document_sequences (account_id, document_type, period_key, next_value)
select
  a.id,
  'client',
  'all',
  coalesce(max(c.client_number), 0) + 1
from public.accounts a
left join public.clients c on c.user_id = a.owner_user_id
group by a.id
on conflict (account_id, document_type, period_key) do update
set next_value = greatest(
  public.account_document_sequences.next_value,
  excluded.next_value
),
updated_at = now();

create or replace function private.assign_quotedr_client_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.client_number is not null then
      new.client_number := old.client_number;
      return new;
    end if;
  end if;
  select a.id into v_account_id
  from public.accounts a
  where a.owner_user_id = new.user_id;
  if v_account_id is null then
    new.client_number := null;
    return new;
  end if;
  insert into public.account_document_sequences
    (account_id, document_type, period_key, next_value, updated_at)
  values
    (v_account_id, 'client', 'all', 2, now())
  on conflict (account_id, document_type, period_key) do update
  set next_value = public.account_document_sequences.next_value + 1,
      updated_at = now()
  returning next_value - 1 into new.client_number;
  return new;
end;
$function$;

drop trigger if exists clients_assign_quotedr_client_number on public.clients;
create trigger clients_assign_quotedr_client_number
before insert or update of client_number on public.clients
for each row execute function private.assign_quotedr_client_number();

alter table public.account_document_sequences enable row level security;
alter table public.account_document_numbers enable row level security;

revoke all on table public.account_document_sequences from public, anon, authenticated;
revoke all on table public.account_document_numbers from public, anon, authenticated;
grant all on table public.account_document_sequences to service_role;
grant all on table public.account_document_numbers to service_role;
grant usage, select on sequence public.account_document_numbers_id_seq to service_role;

create or replace function public.quotedr_reserve_document_number(
  p_account_id uuid,
  p_document_type text,
  p_client_id uuid,
  p_actor_user_id uuid,
  p_document_year integer default extract(year from now())::integer
)
returns table (
  document_number text,
  client_number bigint,
  sequence_value bigint,
  numbering_settings jsonb
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner_user_id uuid;
  v_client_number bigint;
  v_sequence bigint;
  v_settings jsonb;
  v_document_code text;
  v_company_code text;
  v_company_position text;
  v_format_style text;
  v_year_style text;
  v_year_token text;
  v_period_key text;
  v_client_padding integer;
  v_sequence_padding integer;
  v_candidate text;
  v_parts text[];
  v_inserted bigint;
begin
  if p_document_type not in ('quote', 'invoice', 'change_order', 'revision') then
    raise exception 'Unsupported document type' using errcode = '22023';
  end if;
  if p_document_year not between 2000 and 9999 then
    raise exception 'Invalid document year' using errcode = '22023';
  end if;

  select a.owner_user_id, a.document_numbering_settings
  into v_owner_user_id, v_settings
  from public.accounts a
  where a.id = p_account_id;
  if v_owner_user_id is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.account_memberships m
    where m.account_id = p_account_id
      and m.user_id = p_actor_user_id
      and m.status = 'active'
  ) then
    raise exception 'Account membership required' using errcode = '42501';
  end if;

  select c.client_number
  into v_client_number
  from public.clients c
  where c.id = p_client_id
    and c.user_id = v_owner_user_id
  for update;
  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if v_client_number is null then
    update public.clients
    set client_number = 0,
        updated_at = now()
    where id = p_client_id
      and user_id = v_owner_user_id
      and client_number is null;

    select c.client_number
    into v_client_number
    from public.clients c
    where c.id = p_client_id
      and c.user_id = v_owner_user_id;
  end if;

  v_settings := coalesce(v_settings, '{}'::jsonb);
  v_company_code := left(regexp_replace(upper(coalesce(v_settings ->> 'companyCode', '')), '[^A-Z0-9]', '', 'g'), 12);
  v_company_position := case lower(coalesce(v_settings ->> 'companyCodePosition', 'suffix'))
    when 'prefix' then 'prefix'
    when 'none' then 'none'
    else 'suffix'
  end;
  v_format_style := case lower(coalesce(v_settings ->> 'formatStyle', 'document_first'))
    when 'client_first' then 'client_first'
    else 'document_first'
  end;
  v_year_style := case lower(coalesce(v_settings ->> 'yearStyle', 'four_digit'))
    when 'none' then 'none'
    when 'two_digit' then 'two_digit'
    else 'four_digit'
  end;
  v_client_padding := greatest(2, least(8, case
    when coalesce(v_settings ->> 'clientPadding', '') ~ '^[0-9]+$'
      then (v_settings ->> 'clientPadding')::integer
    else 4
  end));
  v_sequence_padding := greatest(2, least(8, case
    when coalesce(v_settings ->> 'sequencePadding', '') ~ '^[0-9]+$'
      then (v_settings ->> 'sequencePadding')::integer
    else 3
  end));
  v_document_code := case p_document_type
    when 'quote' then 'Q'
    when 'invoice' then 'I'
    when 'change_order' then 'CO'
    else 'R'
  end;
  v_year_token := case v_year_style
    when 'two_digit' then right(p_document_year::text, 2)
    when 'none' then ''
    else p_document_year::text
  end;
  v_period_key := case when v_year_style = 'none' then 'all' else p_document_year::text end;

  loop
    insert into public.account_document_sequences
      (account_id, document_type, period_key, next_value, updated_at)
    values
      (p_account_id, p_document_type, v_period_key, 2, now())
    on conflict (account_id, document_type, period_key) do update
    set next_value = public.account_document_sequences.next_value + 1,
        updated_at = now()
    returning next_value - 1 into v_sequence;

    if v_format_style = 'client_first' then
      v_parts := array[
        'C' || lpad(v_client_number::text, v_client_padding, '0'),
        v_document_code
      ];
    else
      v_parts := array[
        v_document_code
      ];
    end if;
    if v_year_token <> '' then v_parts := array_append(v_parts, v_year_token); end if;
    if v_format_style <> 'client_first' then
      v_parts := array_append(v_parts, 'C' || lpad(v_client_number::text, v_client_padding, '0'));
    end if;
    v_parts := array_append(v_parts, lpad(v_sequence::text, v_sequence_padding, '0'));
    if v_company_code <> '' and v_company_position = 'prefix' then
      v_parts := array_prepend(v_company_code, v_parts);
    elsif v_company_code <> '' and v_company_position = 'suffix' then
      v_parts := array_append(v_parts, v_company_code);
    end if;
    v_candidate := array_to_string(v_parts, '-');

    if exists (
      select 1
      from public.quotes q
      where q.user_id = v_owner_user_id
        and lower(btrim(q.quote_number)) = lower(v_candidate)
    ) then
      continue;
    end if;

    insert into public.account_document_numbers (
      account_id,
      client_id,
      document_type,
      document_number,
      sequence_value,
      period_key,
      actor_user_id
    ) values (
      p_account_id,
      p_client_id,
      p_document_type,
      v_candidate,
      v_sequence,
      v_period_key,
      p_actor_user_id
    )
    on conflict (account_id, normalized_number) do nothing
    returning id into v_inserted;
    if v_inserted is not null then exit; end if;
  end loop;

  document_number := v_candidate;
  client_number := v_client_number;
  sequence_value := v_sequence;
  numbering_settings := jsonb_build_object(
    'version', 1,
    'companyCode', v_company_code,
    'companyCodePosition', v_company_position,
    'formatStyle', v_format_style,
    'yearStyle', v_year_style,
    'clientPadding', v_client_padding,
    'sequencePadding', v_sequence_padding,
    'documentCodes', jsonb_build_object(
      'quote', 'Q',
      'invoice', 'I',
      'change_order', 'CO',
      'revision', 'R'
    )
  );
  return next;
end;
$function$;

revoke all on function public.quotedr_reserve_document_number(uuid, text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.quotedr_reserve_document_number(uuid, text, uuid, uuid, integer)
  to service_role;

comment on column public.clients.client_number is
  'Stable account-scoped client number. Existing clients are backfilled without changing names or quote links.';
comment on table public.account_document_numbers is
  'Immutable registry of human-readable account document numbers. Internal quote UUIDs remain authoritative.';

notify pgrst, 'reload schema';

commit;
