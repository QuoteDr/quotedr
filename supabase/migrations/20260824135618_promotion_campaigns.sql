-- Owner-configurable QuoteDr promotions extend the existing app-wide message
-- system. Message content remains in app_broadcast_messages; benefit claims are
-- server-only and immutable to browsers.

alter table public.app_broadcast_messages
  add column if not exists target_audience text not null default 'all'
    check (target_audience in ('all', 'standard', 'pro')),
  add column if not exists promotion_reward_type text not null default 'none'
    check (promotion_reward_type in ('none', 'pro_access_days')),
  add column if not exists promotion_duration_days smallint
    check (promotion_duration_days between 1 and 90),
  add column if not exists promotion_max_claims integer
    check (promotion_max_claims is null or promotion_max_claims >= 1);

create table if not exists public.promotion_claims (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.app_broadcast_messages(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  reward_type text not null check (reward_type in ('pro_access_days')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  benefit_starts_at timestamptz not null,
  benefit_ends_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (promotion_id, user_id),
  check (benefit_ends_at > benefit_starts_at)
);

create index if not exists promotion_claims_user_active_idx
  on public.promotion_claims (user_id, benefit_ends_at desc)
  where status = 'active';

create index if not exists promotion_claims_promotion_idx
  on public.promotion_claims (promotion_id, claimed_at desc);

alter table public.promotion_claims enable row level security;

revoke all on table public.promotion_claims from public, anon, authenticated;
grant select, insert, update on table public.promotion_claims to service_role;

comment on table public.promotion_claims is
  'Server-authoritative, one-per-account activation records for owner-configured QuoteDr promotions.';

create or replace function public.quotedr_claim_promotion(
  p_user_id uuid,
  p_promotion_id uuid,
  p_benefit_starts_at timestamptz,
  p_benefit_ends_at timestamptz
)
returns public.promotion_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.app_broadcast_messages;
  v_existing public.promotion_claims;
  v_claim public.promotion_claims;
  v_claim_count integer;
begin
  -- One campaign-wide lock serializes the optional total-claim cap. The unique
  -- constraint below independently prevents a user from claiming twice.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('quotedr-promotion:' || p_promotion_id::text)::bigint
  );

  select * into v_campaign
  from public.app_broadcast_messages
  where id = p_promotion_id
  for update;

  if not found
    or v_campaign.status <> 'active'
    or v_campaign.promotion_reward_type <> 'pro_access_days'
    or (v_campaign.starts_at is not null and v_campaign.starts_at > pg_catalog.now())
    or (v_campaign.ends_at is not null and v_campaign.ends_at < pg_catalog.now()) then
    raise exception 'promotion_not_active';
  end if;

  select * into v_existing
  from public.promotion_claims
  where promotion_id = p_promotion_id
    and user_id = p_user_id;

  if found then
    return v_existing;
  end if;

  if v_campaign.promotion_max_claims is not null then
    select count(*)::integer into v_claim_count
    from public.promotion_claims
    where promotion_id = p_promotion_id;
    if v_claim_count >= v_campaign.promotion_max_claims then
      raise exception 'promotion_claim_limit_reached';
    end if;
  end if;

  if p_benefit_starts_at is null
    or p_benefit_ends_at is null
    or p_benefit_ends_at <= p_benefit_starts_at then
    raise exception 'invalid_benefit_window';
  end if;

  insert into public.promotion_claims (
    promotion_id,
    user_id,
    reward_type,
    status,
    benefit_starts_at,
    benefit_ends_at
  ) values (
    p_promotion_id,
    p_user_id,
    'pro_access_days',
    'active',
    p_benefit_starts_at,
    p_benefit_ends_at
  )
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.quotedr_claim_promotion(
  uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.quotedr_claim_promotion(
  uuid, uuid, timestamptz, timestamptz
) to service_role;
