create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  source_page text,
  consent_source text not null default 'quotedr_marketing_newsletter',
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Newsletter subscribers are private" on public.newsletter_subscribers;

create policy "Newsletter subscribers are private"
  on public.newsletter_subscribers
  for all
  using (false)
  with check (false);
