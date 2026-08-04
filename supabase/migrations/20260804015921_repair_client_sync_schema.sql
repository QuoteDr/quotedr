-- Bring older clients tables up to the contract used by the web app.
-- This is intentionally additive so older QuoteDr builds keep working.
alter table public.clients
    add column if not exists crm jsonb not null default '{}'::jsonb,
    add column if not exists updated_at timestamptz default now();

-- PostgREST upserts with onConflict: 'user_id,name' require a matching
-- unique index. Fresh installs already receive this name from the base schema.
create unique index if not exists clients_user_id_name_key
    on public.clients (user_id, name);

-- Make the newly added columns visible to the Data API immediately after the
-- migration is applied instead of waiting for the next automatic cache reload.
notify pgrst, 'reload schema';
