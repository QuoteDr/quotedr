-- Optional proof for manual document payments.
--
-- Files live in a private Storage bucket. Browser clients have no direct table
-- or bucket policy; document-payment issues path-bound upload tokens and
-- short-lived viewing URLs only after portal-token or account-permission checks.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'document-payment-evidence',
  'document-payment-evidence',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_record_id uuid not null references public.payment_records(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  invoice_id uuid references public.quotes(id) on delete cascade,
  object_path text not null unique check (char_length(object_path) between 20 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 120),
  mime_type text not null check (lower(mime_type) in ('image/jpeg', 'image/png', 'application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 8388608),
  upload_status text not null default 'upload_pending'
    check (upload_status in ('upload_pending', 'ready', 'deleted', 'failed')),
  uploaded_by_role text not null check (uploaded_by_role in ('client', 'contractor')),
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  portal_visible boolean not null default false,
  privacy_notice_version text not null check (char_length(privacy_notice_version) between 1 and 60),
  privacy_checked_at timestamptz not null,
  idempotency_key uuid not null,
  upload_deadline timestamptz not null default (now() + interval '2 hours'),
  finalized_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check ((quote_id is not null)::integer + (invoice_id is not null)::integer = 1),
  check (uploaded_by_role = 'contractor' or uploaded_by_user_id is null)
);

create index if not exists payment_evidence_document_quote_idx
  on public.payment_evidence(user_id, quote_id, created_at desc)
  where quote_id is not null and deleted_at is null;
create index if not exists payment_evidence_document_invoice_idx
  on public.payment_evidence(user_id, invoice_id, created_at desc)
  where invoice_id is not null and deleted_at is null;
create index if not exists payment_evidence_upload_deadline_idx
  on public.payment_evidence(upload_deadline)
  where upload_status = 'upload_pending' and deleted_at is null;
create index if not exists payment_evidence_uploaded_by_user_idx
  on public.payment_evidence(uploaded_by_user_id)
  where uploaded_by_user_id is not null;
create unique index if not exists payment_evidence_one_active_per_payment_idx
  on public.payment_evidence(payment_record_id, uploaded_by_role)
  where deleted_at is null;

alter table public.payment_evidence enable row level security;
revoke all on table public.payment_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.payment_evidence to service_role;

-- Deny direct browser access. Signed upload/view URLs are created by the
-- document-payment Edge Function after it verifies the payment and actor.
drop policy if exists "document_payment_evidence_select" on storage.objects;
drop policy if exists "document_payment_evidence_insert" on storage.objects;
drop policy if exists "document_payment_evidence_update" on storage.objects;
drop policy if exists "document_payment_evidence_delete" on storage.objects;

commit;
