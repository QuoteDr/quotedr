-- Private supplier catalogues and reusable material recipes.
-- Supplier prices are account-specific and are never exposed to anonymous clients.

create table if not exists public.supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  supplier_key text not null,
  display_name text not null,
  branch_label text not null default '',
  connection_method text not null default 'file_import'
    check (connection_method in ('file_import', 'official_api', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'disconnected')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  unique (account_id, supplier_key, branch_label)
);

create table if not exists public.supplier_import_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  supplier_account_id uuid not null references public.supplier_accounts(id) on delete cascade,
  source_type text not null default 'csv'
    check (source_type in ('csv', 'tsv', 'xlsx', 'xls', 'pdf', 'txt', 'paste', 'manual')),
  source_filename text not null default '',
  source_sha256 text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'undone')),
  mapping jsonb not null default '{}'::jsonb,
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  error_message text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, account_id),
  foreign key (supplier_account_id, account_id)
    references public.supplier_accounts(id, account_id) on delete cascade
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  supplier_account_id uuid not null references public.supplier_accounts(id) on delete cascade,
  supplier_sku text not null default '',
  manufacturer_part_number text not null default '',
  name text not null,
  brand text not null default '',
  category text not null default 'General',
  purchase_unit text not null default 'each',
  package_quantity numeric(14,4) not null default 1 check (package_quantity > 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  tax_included boolean,
  product_url text not null default '',
  active boolean not null default true,
  last_price numeric(14,4) check (last_price is null or last_price >= 0),
  last_price_at timestamptz,
  last_import_run_id uuid references public.supplier_import_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  foreign key (supplier_account_id, account_id)
    references public.supplier_accounts(id, account_id) on delete cascade,
  foreign key (last_import_run_id, account_id)
    references public.supplier_import_runs(id, account_id),
  check (length(trim(name)) > 0),
  check (supplier_sku <> '' or manufacturer_part_number <> '')
);

create unique index if not exists supplier_products_account_supplier_sku_idx
  on public.supplier_products(account_id, supplier_account_id, lower(supplier_sku))
  where supplier_sku <> '';

create unique index if not exists supplier_products_account_mpn_idx
  on public.supplier_products(account_id, supplier_account_id, lower(manufacturer_part_number))
  where supplier_sku = '' and manufacturer_part_number <> '';

create index if not exists supplier_products_account_search_idx
  on public.supplier_products(account_id, supplier_account_id, category, name);

create table if not exists public.supplier_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  import_run_id uuid references public.supplier_import_runs(id) on delete set null,
  unit_price numeric(14,4) not null check (unit_price >= 0),
  price_basis_quantity numeric(14,4) not null default 1 check (price_basis_quantity > 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  tax_included boolean,
  captured_at timestamptz not null default now(),
  source_label text not null default '',
  created_at timestamptz not null default now(),
  foreign key (supplier_product_id, account_id)
    references public.supplier_products(id, account_id) on delete cascade,
  foreign key (import_run_id, account_id)
    references public.supplier_import_runs(id, account_id)
);

create index if not exists supplier_price_snapshots_product_date_idx
  on public.supplier_price_snapshots(supplier_product_id, captured_at desc);

create table if not exists public.saved_item_material_components (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  saved_item_id uuid not null,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  material_name text not null default '',
  unit text not null default 'each',
  fixed_quantity numeric(14,4) not null default 0 check (fixed_quantity >= 0),
  per_item_quantity numeric(14,4) not null default 0 check (per_item_quantity >= 0),
  waste_percent numeric(7,3) not null default 0 check (waste_percent >= 0 and waste_percent <= 1000),
  minimum_quantity numeric(14,4) not null default 0 check (minimum_quantity >= 0),
  package_quantity numeric(14,4) not null default 1 check (package_quantity > 0),
  rounding_mode text not null default 'ceil_packages'
    check (rounding_mode in ('ceil_packages', 'none')),
  manual_unit_cost numeric(14,4) check (manual_unit_cost is null or manual_unit_cost >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (supplier_product_id, account_id)
    references public.supplier_products(id, account_id),
  check (supplier_product_id is not null or length(trim(material_name)) > 0)
);

create index if not exists saved_item_material_components_item_idx
  on public.saved_item_material_components(account_id, saved_item_id, sort_order);

alter table public.supplier_accounts enable row level security;
alter table public.supplier_import_runs enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_price_snapshots enable row level security;
alter table public.saved_item_material_components enable row level security;

revoke all on table public.supplier_accounts from anon;
revoke all on table public.supplier_import_runs from anon;
revoke all on table public.supplier_products from anon;
revoke all on table public.supplier_price_snapshots from anon;
revoke all on table public.saved_item_material_components from anon;

revoke insert, update, delete on table public.supplier_accounts from authenticated;
revoke insert, update, delete on table public.supplier_import_runs from authenticated;
revoke insert, update, delete on table public.supplier_products from authenticated;
revoke insert, update, delete on table public.supplier_price_snapshots from authenticated;
revoke insert, update, delete on table public.saved_item_material_components from authenticated;

grant select on table public.supplier_accounts to authenticated;
grant select on table public.supplier_import_runs to authenticated;
grant select on table public.supplier_products to authenticated;
grant select on table public.supplier_price_snapshots to authenticated;
grant select on table public.saved_item_material_components to authenticated;

create policy supplier_accounts_read_pricing
  on public.supplier_accounts for select to authenticated
  using (private.current_user_has_account_permission(account_id, 'items.pricing.read'));
create policy supplier_accounts_manage
  on public.supplier_accounts for all to authenticated
  using (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  )
  with check (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  );

create policy supplier_import_runs_read_pricing
  on public.supplier_import_runs for select to authenticated
  using (private.current_user_has_account_permission(account_id, 'items.pricing.read'));
create policy supplier_import_runs_manage
  on public.supplier_import_runs for all to authenticated
  using (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  )
  with check (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  );

create policy supplier_products_read_pricing
  on public.supplier_products for select to authenticated
  using (private.current_user_has_account_permission(account_id, 'items.pricing.read'));
create policy supplier_products_manage
  on public.supplier_products for all to authenticated
  using (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  )
  with check (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  );

create policy supplier_price_snapshots_read_pricing
  on public.supplier_price_snapshots for select to authenticated
  using (private.current_user_has_account_permission(account_id, 'items.pricing.read'));
create policy supplier_price_snapshots_manage
  on public.supplier_price_snapshots for all to authenticated
  using (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  )
  with check (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  );

create policy saved_item_material_components_read_pricing
  on public.saved_item_material_components for select to authenticated
  using (private.current_user_has_account_permission(account_id, 'items.pricing.read'));
create policy saved_item_material_components_manage
  on public.saved_item_material_components for all to authenticated
  using (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  )
  with check (
    private.current_user_has_account_permission(account_id, 'items.manage')
    and private.current_user_has_account_permission(account_id, 'items.pricing.read')
  );

comment on table public.supplier_products is
  'Private, account-specific supplier products and current trade pricing. Never expose through client documents.';
comment on table public.saved_item_material_components is
  'Reusable contractor-only material recipes linked to stable saved item UUIDs.';
