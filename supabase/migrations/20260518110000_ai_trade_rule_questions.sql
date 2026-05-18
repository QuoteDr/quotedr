-- Add AI Voice trade-rule clarification questions.
-- Existing direct rules remain line_item rules; missing columns are backfilled by defaults.

alter table public.ai_trade_rules
    add column if not exists rule_type text not null default 'line_item';

alter table public.ai_trade_rules
    add column if not exists clarification_question text;

alter table public.ai_trade_rules
    add column if not exists clarification_options jsonb not null default '[]'::jsonb;
