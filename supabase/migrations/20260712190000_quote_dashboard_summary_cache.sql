begin;

set local statement_timeout = '120s';

create table if not exists public.quote_dashboard_summaries (
  id uuid primary key references public.quotes(id) on delete cascade,
  user_id uuid not null,
  quote_number text,
  client_name text,
  client_email text,
  total numeric,
  status text,
  type text,
  parent_quote_id uuid,
  change_order_number integer,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create index if not exists idx_quote_dashboard_summaries_user_updated
  on public.quote_dashboard_summaries(user_id, updated_at desc);

alter table public.quote_dashboard_summaries enable row level security;

drop policy if exists "Users can view own quote dashboard summaries" on public.quote_dashboard_summaries;
create policy "Users can view own quote dashboard summaries"
  on public.quote_dashboard_summaries
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.quote_dashboard_summaries from anon;
grant select on table public.quote_dashboard_summaries to authenticated;

create or replace function public.quotedr_quote_summary_data(source_data jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'type', source_data -> 'type',
    'documentType', source_data -> 'documentType',
    '_type', source_data -> '_type',
    'quoteTitle', source_data -> 'quoteTitle',
    'invoiceTitle', source_data -> 'invoiceTitle',
    'title', source_data -> 'title',
    'quoteNumber', source_data -> 'quoteNumber',
    'clientName', source_data -> 'clientName',
    'client_name', source_data -> 'client_name',
    'clientEmail', source_data -> 'clientEmail',
    'client_email', source_data -> 'client_email',
    'email', source_data -> 'email',
    'client', source_data -> 'client',
    'grandTotal', source_data -> 'grandTotal',
    'total', source_data -> 'total',
    'status', source_data -> 'status',
    'savedAt', source_data -> 'savedAt',
    'paymentStatus', source_data -> 'paymentStatus',
    'payment_status', source_data -> 'payment_status',
    'payments', source_data -> 'payments',
    'deposit_paid', source_data -> 'deposit_paid',
    'invoice_paid', source_data -> 'invoice_paid',
    'invoice_paid_at', source_data -> 'invoice_paid_at',
    'payment_paid_at', source_data -> 'payment_paid_at',
    'client_upgraded', source_data -> 'client_upgraded',
    'junk_deleted_at', source_data -> 'junk_deleted_at',
    'junk_delete_after', source_data -> 'junk_delete_after',
    'junk_was_portal_visible', source_data -> 'junk_was_portal_visible',
    'portal_visible', source_data -> 'portal_visible',
    'portal_id', source_data -> 'portal_id',
    'portal_name', source_data -> 'portal_name',
    'portal_client_name', source_data -> 'portal_client_name',
    'portal_client_email', source_data -> 'portal_client_email',
    'portal_pin', source_data -> 'portal_pin',
    'portal_added_at', source_data -> 'portal_added_at',
    'portal_placeholder', source_data -> 'portal_placeholder',
    'portal_theme', case
      when coalesce(source_data #>> '{portal_theme,portalLogo}', '') like 'data:image/%'
        then (source_data -> 'portal_theme') - 'portalLogo'
      else source_data -> 'portal_theme'
    end,
    'portal_share_token', source_data -> 'portal_share_token',
    'portal_share_anchor_id', source_data -> 'portal_share_anchor_id',
    'portal_share_created_at', source_data -> 'portal_share_created_at',
    'parentQuoteId', source_data -> 'parentQuoteId',
    'changeOrderNumber', source_data -> 'changeOrderNumber',
    'revisionOf', source_data -> 'revisionOf',
    'revisionCreatedAt', source_data -> 'revisionCreatedAt',
    'review_request_sent_at', source_data -> 'review_request_sent_at',
    'review_request_nudge_ignored', source_data -> 'review_request_nudge_ignored'
  ));
$$;

create or replace function public.quotedr_refresh_quote_dashboard_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') = 'backup' or coalesce(new.quote_number, '') = '__ITEMS_BACKUP__' then
    delete from public.quote_dashboard_summaries where id = new.id;
    return new;
  end if;

  insert into public.quote_dashboard_summaries (
    id, user_id, quote_number, client_name, client_email, total, status, type,
    parent_quote_id, change_order_number, data, created_at, updated_at
  ) values (
    new.id, new.user_id, new.quote_number, new.client_name, new.client_email, new.total,
    new.status, new.type, new.parent_quote_id, new.change_order_number,
    public.quotedr_quote_summary_data(coalesce(new.data, '{}'::jsonb)),
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    quote_number = excluded.quote_number,
    client_name = excluded.client_name,
    client_email = excluded.client_email,
    total = excluded.total,
    status = excluded.status,
    type = excluded.type,
    parent_quote_id = excluded.parent_quote_id,
    change_order_number = excluded.change_order_number,
    data = excluded.data,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists quotedr_refresh_quote_dashboard_summary_trigger on public.quotes;
create trigger quotedr_refresh_quote_dashboard_summary_trigger
after insert or update of user_id, quote_number, client_name, client_email, total, status, type,
  parent_quote_id, change_order_number, data, created_at, updated_at
on public.quotes
for each row execute function public.quotedr_refresh_quote_dashboard_summary();

insert into public.quote_dashboard_summaries (
  id, user_id, quote_number, client_name, client_email, total, status, type,
  parent_quote_id, change_order_number, data, created_at, updated_at
)
select
  q.id, q.user_id, q.quote_number, q.client_name, q.client_email, q.total, q.status, q.type,
  q.parent_quote_id, q.change_order_number,
  public.quotedr_quote_summary_data(coalesce(q.data, '{}'::jsonb)),
  q.created_at, q.updated_at
from public.quotes q
where coalesce(q.status, '') <> 'backup'
  and coalesce(q.quote_number, '') <> '__ITEMS_BACKUP__'
on conflict (id) do update set
  user_id = excluded.user_id,
  quote_number = excluded.quote_number,
  client_name = excluded.client_name,
  client_email = excluded.client_email,
  total = excluded.total,
  status = excluded.status,
  type = excluded.type,
  parent_quote_id = excluded.parent_quote_id,
  change_order_number = excluded.change_order_number,
  data = excluded.data,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

delete from public.quote_dashboard_summaries summary
using public.quotes q
where summary.id = q.id
  and (coalesce(q.status, '') = 'backup' or coalesce(q.quote_number, '') = '__ITEMS_BACKUP__');

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
    summary.id,
    summary.user_id,
    summary.quote_number,
    summary.client_name,
    summary.client_email,
    summary.total,
    summary.status,
    summary.type,
    summary.parent_quote_id,
    summary.change_order_number,
    summary.data,
    summary.created_at,
    summary.updated_at
  from public.quote_dashboard_summaries summary
  where summary.user_id = auth.uid()
  order by summary.updated_at desc;
$$;

revoke all on function public.quotedr_list_quote_summaries() from public;
revoke all on function public.quotedr_list_quote_summaries() from anon;
grant execute on function public.quotedr_list_quote_summaries() to authenticated;

notify pgrst, 'reload schema';

commit;
