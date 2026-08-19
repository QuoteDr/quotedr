begin;

create or replace function public.quotedr_refresh_quote_payment_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quote_dashboard_summaries
  set data = (
    data
    - 'paymentsReceived'
    - 'paymentReceived'
    - 'deposit_due_cents'
    - 'balance_due_cents'
    - 'deposit_shortfall_accepted'
    - 'deposit_shortfall_accepted_at'
    - 'deposit_shortfall_accepted_paid_cents'
    - 'deposit_shortfall_required_cents'
  ) || jsonb_strip_nulls(jsonb_build_object(
    'paymentsReceived', new.data -> 'paymentsReceived',
    'paymentReceived', new.data -> 'paymentReceived',
    'deposit_due_cents', new.data -> 'deposit_due_cents',
    'balance_due_cents', new.data -> 'balance_due_cents',
    'deposit_shortfall_accepted', new.data -> 'deposit_shortfall_accepted',
    'deposit_shortfall_accepted_at', new.data -> 'deposit_shortfall_accepted_at',
    'deposit_shortfall_accepted_paid_cents', new.data -> 'deposit_shortfall_accepted_paid_cents',
    'deposit_shortfall_required_cents', new.data -> 'deposit_shortfall_required_cents'
  ))
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists zz_quotedr_refresh_quote_payment_summary_trigger on public.quotes;
create trigger zz_quotedr_refresh_quote_payment_summary_trigger
after insert or update of data on public.quotes
for each row execute function public.quotedr_refresh_quote_payment_summary();

update public.quote_dashboard_summaries summary
set data = (
  summary.data
  - 'paymentsReceived'
  - 'paymentReceived'
  - 'deposit_due_cents'
  - 'balance_due_cents'
  - 'deposit_shortfall_accepted'
  - 'deposit_shortfall_accepted_at'
  - 'deposit_shortfall_accepted_paid_cents'
  - 'deposit_shortfall_required_cents'
) || jsonb_strip_nulls(jsonb_build_object(
  'paymentsReceived', quote.data -> 'paymentsReceived',
  'paymentReceived', quote.data -> 'paymentReceived',
  'deposit_due_cents', quote.data -> 'deposit_due_cents',
  'balance_due_cents', quote.data -> 'balance_due_cents',
  'deposit_shortfall_accepted', quote.data -> 'deposit_shortfall_accepted',
  'deposit_shortfall_accepted_at', quote.data -> 'deposit_shortfall_accepted_at',
  'deposit_shortfall_accepted_paid_cents', quote.data -> 'deposit_shortfall_accepted_paid_cents',
  'deposit_shortfall_required_cents', quote.data -> 'deposit_shortfall_required_cents'
))
from public.quotes quote
where quote.id = summary.id;

revoke all on function public.quotedr_refresh_quote_payment_summary() from public;
revoke all on function public.quotedr_refresh_quote_payment_summary() from anon;
revoke all on function public.quotedr_refresh_quote_payment_summary() from authenticated;

commit;
