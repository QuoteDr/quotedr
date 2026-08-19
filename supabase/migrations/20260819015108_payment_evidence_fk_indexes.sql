-- Cover document foreign keys for payment-evidence cleanup and joins.

begin;

create index if not exists payment_evidence_quote_id_fkey_idx
  on public.payment_evidence(quote_id);
create index if not exists payment_evidence_invoice_id_fkey_idx
  on public.payment_evidence(invoice_id);

commit;
