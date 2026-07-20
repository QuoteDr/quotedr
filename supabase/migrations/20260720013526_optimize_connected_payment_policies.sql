drop policy if exists "Contractors can view own Stripe connection" on public.stripe_connected_accounts;
create policy "Contractors can view own Stripe connection"
    on public.stripe_connected_accounts
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Contractors can view own payment records" on public.payment_records;
create policy "Contractors can view own payment records"
    on public.payment_records
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create index if not exists payment_records_confirmed_by_idx
    on public.payment_records(confirmed_by)
    where confirmed_by is not null;
