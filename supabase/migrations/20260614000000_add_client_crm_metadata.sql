alter table public.clients
    add column if not exists crm jsonb not null default '{}'::jsonb;
