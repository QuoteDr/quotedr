-- Change orders use an explicit fixed payment-to-continue obligation.
-- This is intentionally distinct from quote and invoice deposits.
alter table public.payment_records
    drop constraint if exists payment_records_payment_type_check;

alter table public.payment_records
    add constraint payment_records_payment_type_check
    check (payment_type in (
        'deposit',
        'invoice_full',
        'invoice_deposit',
        'change_order_continue'
    ));
