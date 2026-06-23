const fs = require('fs');
const assert = require('assert');

const migrations = fs.readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8'))
  .join('\n');
const edgeFn = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');

assert(
  migrations.includes("portal-job-assets") &&
    migrations.includes('create table if not exists public.portal_job_assets') &&
    migrations.includes('alter table public.portal_job_assets enable row level security'),
  'A private portal-job-assets bucket and RLS-protected asset metadata table should exist'
);

assert(
  migrations.includes('storage.objects') &&
    migrations.includes("split_part(name, '/', 1) = (select auth.uid())::text"),
  'Storage policies should keep object paths scoped to the authenticated owner id'
);

assert(
  edgeFn.includes('portal_assets') &&
    edgeFn.includes('portal_asset_url') &&
    edgeFn.includes('createSignedUrl'),
  'The secure client-document function should list portal assets and create signed asset URLs'
);
