-- Service-only atomic receipt + quote projection. Authorization is performed by
-- document-payment using payments.manage before invoking this transaction.
create or replace function public.record_owner_deposit(
  p_owner uuid, p_document uuid, p_expected_updated_at timestamptz,
  p_expected_records jsonb, p_record jsonb, p_next_data jsonb, p_next_status text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  q public.quotes%rowtype;
  existing public.payment_records%rowtype;
  actual_records jsonb;
  expected_records jsonb;
begin
  select * into q from public.quotes where id = p_document and user_id = p_owner for update;
  if not found then raise exception 'Payment document not found'; end if;
  select * into existing from public.payment_records where idempotency_key = p_record->>'idempotency_key';
  if found then
    if existing.user_id <> p_owner or existing.quote_id is distinct from p_document
      or existing.amount_cents <> (p_record->>'amount_cents')::bigint
      or existing.method <> p_record->>'method'
      or existing.metadata->>'source' is distinct from 'dashboard_owner_deposit' then
      raise exception 'Receipt conflicts with an earlier attempt';
    end if;
    return jsonb_build_object('id', existing.id, 'replayed', true);
  end if;
  if q.updated_at is distinct from p_expected_updated_at then
    raise exception 'The quote changed. Refresh before recording this deposit';
  end if;
  perform id from public.payment_records where quote_id = p_document or invoice_id = p_document for update;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status, 'amount_cents', amount_cents) order by id), '[]'::jsonb)
    into actual_records from public.payment_records where quote_id = p_document or invoice_id = p_document;
  select coalesce(jsonb_agg(value order by value->>'id'), '[]'::jsonb) into expected_records from jsonb_array_elements(p_expected_records);
  if actual_records <> expected_records then raise exception 'Payments changed. Refresh before recording this deposit'; end if;
  if p_record->>'provider' <> 'manual' or p_record->>'payment_type' <> 'deposit'
    or p_record->>'status' <> 'confirmed' or (p_record->>'amount_cents')::bigint <= 0
    or (p_record->>'user_id')::uuid <> p_owner or (p_record->>'quote_id')::uuid <> p_document then
    raise exception 'Invalid deposit receipt';
  end if;
  insert into public.payment_records(id, user_id, quote_id, payment_type, status, provider, method,
    amount_cents, currency, confirmed_at, confirmed_by, paid_at, updated_at, description, idempotency_key, metadata)
  values ((p_record->>'id')::uuid, p_owner, p_document, 'deposit', 'confirmed', 'manual', p_record->>'method',
    (p_record->>'amount_cents')::bigint, p_record->>'currency', (p_record->>'confirmed_at')::timestamptz,
    (p_record->>'confirmed_by')::uuid, (p_record->>'paid_at')::timestamptz, (p_record->>'updated_at')::timestamptz,
    p_record->>'description', p_record->>'idempotency_key', p_record->'metadata');
  update public.quotes set data = p_next_data, status = p_next_status,
    updated_at = (p_record->>'updated_at')::timestamptz where id = p_document and user_id = p_owner;
  return jsonb_build_object('id', p_record->>'id', 'replayed', false);
end $$;
revoke all on function public.record_owner_deposit(uuid, uuid, timestamptz, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_owner_deposit(uuid, uuid, timestamptz, jsonb, jsonb, jsonb, text) to service_role;
