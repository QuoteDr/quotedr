begin;

alter table public.quotes
  add column if not exists public_share_token_hash text,
  add column if not exists public_share_token_created_at timestamptz,
  add column if not exists public_share_token_last4 text;

create index if not exists idx_quotes_public_share_token_hash
  on public.quotes(public_share_token_hash)
  where public_share_token_hash is not null;

notify pgrst, 'reload schema';

commit;
