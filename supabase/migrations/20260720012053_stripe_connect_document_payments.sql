-- Stripe Connect and secure document-payment workflow.
-- QuoteDr does not collect an application fee. Card charges are created directly
-- on the contractor's connected Stripe account.

begin;

create table if not exists public.stripe_connected_accounts (
    user_id uuid primary key references auth.users(id) on delete cascade,
    stripe_account_id text not null unique,
    status text not null default 'pending'
        check (status in ('pending', 'restricted', 'ready', 'disabled')),
    charges_enabled boolean not null default false,
    payouts_enabled boolean not null default false,
    details_submitted boolean not null default false,
    country text,
    default_currency text,
    requirements jsonb not null default '{}'::jsonb,
    livemode boolean not null default false,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.stripe_connected_accounts enable row level security;

drop policy if exists "Contractors can view own Stripe connection" on public.stripe_connected_accounts;
create policy "Contractors can view own Stripe connection"
    on public.stripe_connected_accounts
    for select
    to authenticated
    using (auth.uid() = user_id);

revoke all on table public.stripe_connected_accounts from anon;
revoke all on table public.stripe_connected_accounts from authenticated;
grant select on table public.stripe_connected_accounts to authenticated;
grant all on table public.stripe_connected_accounts to service_role;

alter table public.payment_records
    add column if not exists provider text,
    add column if not exists method text,
    add column if not exists connected_account_id text,
    add column if not exists client_reference text,
    add column if not exists client_note text,
    add column if not exists reported_at timestamptz,
    add column if not exists confirmed_at timestamptz,
    add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
    add column if not exists stripe_event_id text;

update public.payment_records
set provider = coalesce(provider, 'stripe'),
    method = coalesce(method, 'card')
where provider is null or method is null;

alter table public.payment_records
    alter column provider set default 'stripe',
    alter column provider set not null,
    alter column method set default 'card',
    alter column method set not null;

alter table public.payment_records drop constraint if exists payment_records_payment_type_check;
alter table public.payment_records
    add constraint payment_records_payment_type_check
    check (payment_type in ('deposit', 'invoice_full', 'invoice_deposit'));

alter table public.payment_records drop constraint if exists payment_records_status_check;
alter table public.payment_records
    add constraint payment_records_status_check
    check (status in (
        'pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired',
        'client_reported', 'confirmed', 'rejected'
    ));

alter table public.payment_records drop constraint if exists payment_records_amount_cents_check;
alter table public.payment_records
    add constraint payment_records_amount_cents_check check (amount_cents >= 1);

alter table public.payment_records drop constraint if exists payment_records_provider_check;
alter table public.payment_records
    add constraint payment_records_provider_check check (provider in ('stripe', 'manual'));

alter table public.payment_records drop constraint if exists payment_records_method_check;
alter table public.payment_records
    add constraint payment_records_method_check check (method in ('card', 'etransfer', 'cheque', 'cash'));

drop policy if exists "Users can update own payment record notes" on public.payment_records;
drop policy if exists "Users can view own payment records" on public.payment_records;
create policy "Contractors can view own payment records"
    on public.payment_records
    for select
    to authenticated
    using (auth.uid() = user_id);

revoke all on table public.payment_records from anon;
revoke all on table public.payment_records from authenticated;
grant select on table public.payment_records to authenticated;
grant all on table public.payment_records to service_role;

create index if not exists payment_records_reported_status_idx
    on public.payment_records(user_id, status, reported_at desc)
    where status = 'client_reported';
create index if not exists payment_records_connected_account_idx
    on public.payment_records(connected_account_id)
    where connected_account_id is not null;

create table if not exists public.stripe_webhook_events (
    event_id text primary key,
    event_type text not null,
    connected_account_id text,
    status text not null default 'processing'
        check (status in ('processing', 'completed', 'failed')),
    attempts integer not null default 1 check (attempts > 0),
    last_error text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from anon;
revoke all on table public.stripe_webhook_events from authenticated;
grant all on table public.stripe_webhook_events to service_role;

create index if not exists stripe_webhook_events_status_idx
    on public.stripe_webhook_events(status, received_at desc);

commit;
