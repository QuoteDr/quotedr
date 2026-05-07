-- QuoteDr AI Voice trade rules.
-- Stores per-user phrase -> calculated line item rules for voice-to-quote.

create table if not exists ai_trade_rules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,

    trigger_phrase text not null,
    phrase_key text not null,

    mapped_item_category text not null,
    mapped_item_name text not null,
    mapped_unit text default 'ls',
    mapped_price numeric(10,2) default 0,

    quantity_mode text not null default 'per_count',
    quantity_value numeric(12,2) not null default 1,
    count_unit_label text default '',
    default_count numeric(12,2) default 1,

    user_note text default '',
    active boolean default true,
    usage_count integer default 0,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique(user_id, phrase_key)
);

alter table ai_trade_rules enable row level security;

create policy "Users can view own AI trade rules"
    on ai_trade_rules for select
    using (auth.uid() = user_id);

create policy "Users can insert own AI trade rules"
    on ai_trade_rules for insert
    with check (auth.uid() = user_id);

create policy "Users can update own AI trade rules"
    on ai_trade_rules for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own AI trade rules"
    on ai_trade_rules for delete
    using (auth.uid() = user_id);

create index if not exists idx_ai_trade_rules_user
    on ai_trade_rules(user_id);

create index if not exists idx_ai_trade_rules_phrase
    on ai_trade_rules(user_id, phrase_key);

create index if not exists idx_ai_trade_rules_active
    on ai_trade_rules(user_id, active);
