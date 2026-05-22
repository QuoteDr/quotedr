begin;

drop policy if exists "public read by key" on public.quote_snapshots;
drop policy if exists "public read by key" on public.invoice_snapshots;

do $$
declare
  private_table text;
  private_tables text[] := array[
    'ai_learned_mappings',
    'ai_trade_rules',
    'ai_usage_events',
    'business_profile',
    'clients',
    'community_template_ratings',
    'community_template_reports',
    'community_templates',
    'home_depot_price_changes',
    'home_depot_price_feed_runs',
    'home_depot_products',
    'invoice_snapshots',
    'item_history',
    'items',
    'labor_devices',
    'labor_job_sites',
    'labor_location_events',
    'labor_time_sessions',
    'payment_records',
    'quote_meta',
    'quote_snapshots',
    'templates',
    'user_data',
    'user_material_supplier_links'
  ];
begin
  foreach private_table in array private_tables loop
    execute format('alter table public.%I enable row level security', private_table);
    execute format('revoke all privileges on table public.%I from anon', private_table);
    execute format('revoke all privileges on table public.%I from public', private_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', private_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', private_table);
  end loop;
end $$;

revoke all privileges on table public.error_logs from anon;
revoke all privileges on table public.error_logs from public;
grant insert on table public.error_logs to anon;
grant insert on table public.error_logs to authenticated;
grant select, insert, update, delete on table public.error_logs to service_role;

notify pgrst, 'reload schema';

commit;
