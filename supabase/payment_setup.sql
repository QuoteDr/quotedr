-- QuoteDr payments and subscription setup
-- Run this in the Supabase SQL editor before deploying Stripe payment functions.

create table if not exists payment_records (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    quote_id uuid references quotes(id) on delete set null,
    invoice_id uuid references quotes(id) on delete set null,
    payment_type text not null check (payment_type in ('deposit','invoice_full','invoice_deposit')),
    status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
    amount_cents integer not null check (amount_cents >= 50),
    currency text not null default 'cad',
    client_email text default '',
    description text default '',
    stripe_checkout_session_id text unique,
    stripe_payment_intent_id text,
    stripe_customer_id text,
    paid_at timestamptz,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table payment_records enable row level security;

create policy "Users can view own payment records"
    on payment_records for select
    using (auth.uid() = user_id);

create policy "Users can update own payment record notes"
    on payment_records for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index if not exists payment_records_user_id_idx on payment_records(user_id);
create index if not exists payment_records_quote_id_idx on payment_records(quote_id);
create index if not exists payment_records_invoice_id_idx on payment_records(invoice_id);
create index if not exists payment_records_status_idx on payment_records(status);

-- Keep subscription state in the existing user_data key/value table:
-- key = 'subscription_status'
-- value example:
-- {
--   "status": "active",
--   "plan": "pro",
--   "stripe_customer_id": "cus_...",
--   "stripe_subscription_id": "sub_...",
--   "current_period_end": 1770000000
-- }
