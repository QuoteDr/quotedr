begin;

create or replace function public.quotedr_list_quote_summaries()
returns table (
  id uuid,
  user_id uuid,
  quote_number text,
  client_name text,
  client_email text,
  total numeric,
  status text,
  type text,
  parent_quote_id uuid,
  change_order_number integer,
  data jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.id,
    q.user_id,
    q.quote_number,
    q.client_name,
    q.client_email,
    q.total,
    q.status,
    q.type,
    q.parent_quote_id,
    q.change_order_number,
    jsonb_strip_nulls(jsonb_build_object(
      'type', q.data -> 'type',
      'documentType', q.data -> 'documentType',
      '_type', q.data -> '_type',
      'quoteTitle', q.data -> 'quoteTitle',
      'invoiceTitle', q.data -> 'invoiceTitle',
      'title', q.data -> 'title',
      'quoteNumber', q.data -> 'quoteNumber',
      'clientName', q.data -> 'clientName',
      'client_name', q.data -> 'client_name',
      'clientEmail', q.data -> 'clientEmail',
      'client_email', q.data -> 'client_email',
      'email', q.data -> 'email',
      'client', q.data -> 'client',
      'grandTotal', q.data -> 'grandTotal',
      'total', q.data -> 'total',
      'status', q.data -> 'status',
      'savedAt', q.data -> 'savedAt',
      'paymentStatus', q.data -> 'paymentStatus',
      'payment_status', q.data -> 'payment_status',
      'payments', q.data -> 'payments',
      'deposit_paid', q.data -> 'deposit_paid',
      'invoice_paid', q.data -> 'invoice_paid',
      'invoice_paid_at', q.data -> 'invoice_paid_at',
      'payment_paid_at', q.data -> 'payment_paid_at',
      'client_upgraded', q.data -> 'client_upgraded',
      'junk_deleted_at', q.data -> 'junk_deleted_at',
      'junk_delete_after', q.data -> 'junk_delete_after',
      'junk_was_portal_visible', q.data -> 'junk_was_portal_visible',
      'portal_visible', q.data -> 'portal_visible',
      'portal_id', q.data -> 'portal_id',
      'portal_name', q.data -> 'portal_name',
      'portal_client_name', q.data -> 'portal_client_name',
      'portal_client_email', q.data -> 'portal_client_email',
      'portal_pin', q.data -> 'portal_pin',
      'portal_added_at', q.data -> 'portal_added_at',
      'portal_placeholder', q.data -> 'portal_placeholder',
      'portal_theme', case
        when coalesce(q.data #>> '{portal_theme,portalLogo}', '') like 'data:image/%'
          then (q.data -> 'portal_theme') - 'portalLogo'
        else q.data -> 'portal_theme'
      end,
      'portal_share_token', q.data -> 'portal_share_token',
      'portal_share_anchor_id', q.data -> 'portal_share_anchor_id',
      'portal_share_created_at', q.data -> 'portal_share_created_at',
      'parentQuoteId', q.data -> 'parentQuoteId',
      'changeOrderNumber', q.data -> 'changeOrderNumber',
      'revisionOf', q.data -> 'revisionOf',
      'revisionCreatedAt', q.data -> 'revisionCreatedAt',
      'review_request_sent_at', q.data -> 'review_request_sent_at',
      'review_request_nudge_ignored', q.data -> 'review_request_nudge_ignored'
    )) as data,
    q.created_at,
    q.updated_at
  from public.quotes q
  where q.user_id = auth.uid()
    and coalesce(q.status, '') <> 'backup'
    and coalesce(q.quote_number, '') <> '__ITEMS_BACKUP__'
  order by q.updated_at desc;
$$;

revoke all on function public.quotedr_list_quote_summaries() from public;
revoke all on function public.quotedr_list_quote_summaries() from anon;
grant execute on function public.quotedr_list_quote_summaries() to authenticated;

notify pgrst, 'reload schema';

commit;
