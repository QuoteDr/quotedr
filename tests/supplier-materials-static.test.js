const assert = require('node:assert');
const fs = require('node:fs');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const ui = fs.readFileSync('supplier-materials.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/supplier-materials/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260901181930_supplier_material_catalog_beta.sql', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

assert(builder.includes('supplier-materials.js?v='), 'quote builder must load the supplier materials module');
assert(builder.includes('QuoteDrSupplierMaterials?.attachSnapshotToItem'), 'new and edited quote lines must attach or recalculate frozen recipe snapshots');
assert(builder.includes("savedItemId: item.savedItemId || ''"), 'quote line provenance must carry the stable saved item ID');
assert(ui.includes('Contractor-only information.'), 'UI must state the privacy boundary');
assert(ui.includes('Passwords and browser sessions are never collected.'), 'UI must reject credential/session capture');
assert(ui.includes('Irregular or scanned documents use QuoteDr'), 'UI must disclose when imported supplier documents use AI mapping');
assert(ui.includes("priceMode: 'frozen'"), 'quote recipe prices must be snapshotted');
assert(ui.includes('Accepted or sent documents stay frozen.'), 'price refresh must refuse finalized documents');

for (const table of ['supplier_accounts', 'supplier_import_runs', 'supplier_products', 'supplier_price_snapshots', 'saved_item_material_components']) {
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table} must enable RLS`);
  assert(migration.includes(`revoke all on table public.${table} from anon`), `${table} must deny anonymous access`);
  assert(migration.includes(`revoke insert, update, delete on table public.${table} from authenticated`), `${table} writes must stay behind the authorized Edge function`);
}
assert(migration.includes('foreign key (supplier_product_id, account_id)'), 'database foreign keys must prevent cross-account product references');
assert(migration.includes("private.current_user_has_account_permission(account_id, 'items.pricing.read')"), 'RLS must require private pricing access');
assert(migration.includes("private.current_user_has_account_permission(account_id, 'items.manage')"), 'RLS writes must require item management access');
assert(edge.includes('requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_MANAGE)'), 'Edge writes must authorize the active account');
assert(edge.includes('ACCOUNT_PERMISSION.ITEMS_PRICING_READ'), 'Edge reads must require pricing permission');
assert(edge.includes('sourceImages'), 'scanned supplier PDFs must be supported through reviewed AI mapping');
assert(/\[functions\.supplier-materials\][\s\S]*?verify_jwt\s*=\s*true/.test(config), 'supplier-materials must verify JWTs');

console.log('supplier materials static checks passed');
