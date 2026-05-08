create table if not exists public.home_depot_products (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'CA' check (country in ('CA', 'US')),
  sku text,
  product_id text,
  model_number text,
  product_name text not null,
  brand text,
  category text,
  current_price numeric(12, 2),
  previous_price numeric(12, 2),
  currency text not null default 'CAD',
  inventory_status text,
  product_url text,
  affiliate_url text,
  image_url text,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_depot_products_identifier_check check (
    sku is not null or product_id is not null or model_number is not null or product_url is not null
  )
);

create unique index if not exists home_depot_products_country_sku_idx
  on public.home_depot_products (country, sku)
  where sku is not null;

create unique index if not exists home_depot_products_country_product_id_idx
  on public.home_depot_products (country, product_id)
  where product_id is not null;

create index if not exists home_depot_products_search_idx
  on public.home_depot_products using gin (
    to_tsvector('english', coalesce(product_name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(category, '') || ' ' || coalesce(model_number, '') || ' ' || coalesce(sku, ''))
  );

create index if not exists home_depot_products_last_seen_idx
  on public.home_depot_products (last_seen_at desc);

create table if not exists public.home_depot_price_feed_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'affiliate_feed',
  country text not null default 'CA' check (country in ('CA', 'US')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'started' check (status in ('started', 'success', 'failed')),
  products_seen integer not null default 0,
  products_upserted integer not null default 0,
  price_changes_detected integer not null default 0,
  file_size_bytes integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists home_depot_price_feed_runs_started_idx
  on public.home_depot_price_feed_runs (started_at desc);

create table if not exists public.home_depot_price_changes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.home_depot_products(id) on delete cascade,
  old_price numeric(12, 2),
  new_price numeric(12, 2) not null,
  currency text not null default 'CAD',
  changed_at timestamptz not null default now(),
  feed_run_id uuid references public.home_depot_price_feed_runs(id) on delete set null
);

create index if not exists home_depot_price_changes_product_changed_idx
  on public.home_depot_price_changes (product_id, changed_at desc);

create table if not exists public.user_material_supplier_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier text not null default 'home_depot',
  item_key text not null,
  item_category text not null,
  item_name text not null,
  home_depot_product_id uuid references public.home_depot_products(id) on delete set null,
  sku text,
  product_id text,
  product_url text,
  affiliate_url text,
  match_confidence integer not null default 0 check (match_confidence between 0 and 100),
  match_type text not null default 'manual',
  manually_verified boolean not null default false,
  auto_update_enabled boolean not null default true,
  last_synced_price numeric(12, 2),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, supplier, item_key)
);

create index if not exists user_material_supplier_links_user_idx
  on public.user_material_supplier_links (user_id, supplier, item_category, item_name);

alter table public.home_depot_products enable row level security;
alter table public.home_depot_price_feed_runs enable row level security;
alter table public.home_depot_price_changes enable row level security;
alter table public.user_material_supplier_links enable row level security;

drop policy if exists "Authenticated users can view Home Depot products" on public.home_depot_products;
create policy "Authenticated users can view Home Depot products"
  on public.home_depot_products
  for select
  to authenticated
  using (true);

drop policy if exists "Users can manage own material supplier links" on public.user_material_supplier_links;
create policy "Users can manage own material supplier links"
  on public.user_material_supplier_links
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
