alter table public.quotes
    add column if not exists type text not null default 'quote',
    add column if not exists parent_quote_id uuid references public.quotes(id) on delete cascade,
    add column if not exists change_order_number integer;

create index if not exists idx_quotes_type on public.quotes(type);
create index if not exists idx_quotes_parent_quote_id on public.quotes(parent_quote_id);

create unique index if not exists idx_quotes_change_order_number
    on public.quotes(parent_quote_id, change_order_number)
    where type = 'change_order' and parent_quote_id is not null and change_order_number is not null;
