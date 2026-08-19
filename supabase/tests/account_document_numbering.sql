\set ON_ERROR_STOP on

begin;

insert into auth.users (id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.account_roles (
  id,
  account_id,
  role_key,
  name,
  is_system,
  is_assignable
) values (
  '33333333-3333-4333-8333-333333333333',
  null,
  'owner',
  'Owner',
  true,
  false
);

insert into public.accounts (
  id,
  owner_user_id,
  name,
  document_numbering_settings
) values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'Synthetic Numbering Test',
  jsonb_build_object(
    'companyCode', 'ALD',
    'companyCodePosition', 'suffix',
    'formatStyle', 'document_first',
    'yearStyle', 'four_digit',
    'clientPadding', 4,
    'sequencePadding', 3
  )
);

insert into public.account_memberships (
  account_id,
  user_id,
  role_id,
  status
) values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'active'
);

insert into public.clients (
  id,
  user_id,
  name
) values (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'Synthetic Client'
);

do $test$
declare
  result record;
  current_client_number bigint;
begin
  select client_number
  into current_client_number
  from public.clients
  where id = '55555555-5555-4555-8555-555555555555';

  if current_client_number <> 1 then
    raise exception 'Expected first client number 1, received %', current_client_number;
  end if;

  update public.clients
  set client_number = 999
  where id = '55555555-5555-4555-8555-555555555555';

  select client_number
  into current_client_number
  from public.clients
  where id = '55555555-5555-4555-8555-555555555555';

  if current_client_number <> 1 then
    raise exception 'Client number changed after assignment';
  end if;

  select * into result
  from public.quotedr_reserve_document_number(
    '44444444-4444-4444-8444-444444444444',
    'quote',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    2026
  );
  if result.document_number <> 'Q-2026-C0001-001-ALD' then
    raise exception 'Unexpected quote number: %', result.document_number;
  end if;

  select * into result
  from public.quotedr_reserve_document_number(
    '44444444-4444-4444-8444-444444444444',
    'quote',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    2026
  );
  if result.document_number <> 'Q-2026-C0001-002-ALD' then
    raise exception 'Quote sequence did not increment: %', result.document_number;
  end if;

  select * into result
  from public.quotedr_reserve_document_number(
    '44444444-4444-4444-8444-444444444444',
    'invoice',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    2026
  );
  if result.document_number <> 'I-2026-C0001-001-ALD' then
    raise exception 'Unexpected invoice number: %', result.document_number;
  end if;

  select * into result
  from public.quotedr_reserve_document_number(
    '44444444-4444-4444-8444-444444444444',
    'change_order',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    2026
  );
  if result.document_number <> 'CO-2026-C0001-001-ALD' then
    raise exception 'Unexpected change-order number: %', result.document_number;
  end if;

  select * into result
  from public.quotedr_reserve_document_number(
    '44444444-4444-4444-8444-444444444444',
    'revision',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    2026
  );
  if result.document_number <> 'R-2026-C0001-001-ALD' then
    raise exception 'Unexpected revision number: %', result.document_number;
  end if;

  begin
    perform public.quotedr_reserve_document_number(
      '44444444-4444-4444-8444-444444444444',
      'quote',
      '55555555-5555-4555-8555-555555555555',
      '22222222-2222-4222-8222-222222222222',
      2026
    );
    raise exception 'Non-member reservation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  if has_function_privilege(
    'anon',
    'public.quotedr_reserve_document_number(uuid,text,uuid,uuid,integer)',
    'execute'
  ) then
    raise exception 'anon must not execute document-number reservations';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.quotedr_reserve_document_number(uuid,text,uuid,uuid,integer)',
    'execute'
  ) then
    raise exception 'authenticated must not execute document-number reservations directly';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.quotedr_reserve_document_number(uuid,text,uuid,uuid,integer)',
    'execute'
  ) then
    raise exception 'service_role must execute document-number reservations';
  end if;
end
$test$;

rollback;
