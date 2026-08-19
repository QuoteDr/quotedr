-- Remember exact phrases that an authenticated owner explicitly confirms for a
-- saved AI trade rule. RLS on ai_trade_rules continues to enforce ownership.

alter table public.ai_trade_rules
    add column if not exists learned_phrases jsonb not null default '[]'::jsonb;

comment on column public.ai_trade_rules.learned_phrases is
    'Exact Voice To Quote phrases explicitly confirmed for this owner-scoped trade rule.';
