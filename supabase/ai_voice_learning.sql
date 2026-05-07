-- QuoteDr AI Voice personalized learning.
-- Stores per-user phrase -> pricing item mappings for voice-to-quote.

create table if not exists ai_learned_mappings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,

    spoken_phrase text not null,
    phrase_key text not null,

    mapped_item_category text not null,
    mapped_item_name text not null,
    mapped_unit text default 'ls',
    mapped_price numeric(10,2) default 0,

    user_note text default '',
    usage_count integer default 0,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique(user_id, phrase_key)
);

alter table ai_learned_mappings enable row level security;

create policy "Users can view own AI learned mappings"
    on ai_learned_mappings for select
    using (auth.uid() = user_id);

create policy "Users can insert own AI learned mappings"
    on ai_learned_mappings for insert
    with check (auth.uid() = user_id);

create policy "Users can update own AI learned mappings"
    on ai_learned_mappings for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own AI learned mappings"
    on ai_learned_mappings for delete
    using (auth.uid() = user_id);

create index if not exists idx_ai_learned_mappings_user
    on ai_learned_mappings(user_id);

create index if not exists idx_ai_learned_mappings_phrase
    on ai_learned_mappings(user_id, phrase_key);

create index if not exists idx_ai_learned_mappings_usage
    on ai_learned_mappings(user_id, usage_count desc);
