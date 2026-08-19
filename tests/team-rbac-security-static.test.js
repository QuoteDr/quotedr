const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260808000732_team_accounts_rbac.sql');
const fieldMigration = read('supabase/migrations/20260808000808_custom_role_field_permissions.sql');
const roleRepairMigration = read('supabase/migrations/20260809041332_repair_account_role_save.sql');
const invitationRepairMigration = read('supabase/migrations/20260811020241_repair_team_invitation_acceptance.sql');
const indexMigration = read('supabase/migrations/20260808001022_team_rbac_foreign_key_indexes.sql');
const invitationFixture = read('supabase/tests/team_invitation_acceptance.sql');
const invitationConcurrencyFixture = read('supabase/tests/team_invitation_acceptance_concurrency.sql');
const invitationApiFixture = read('tests/team-invitation-disposable-api.integration.mjs');
const accountApi = read('supabase/functions/team-account/index.ts');
const accountAuth = read('supabase/functions/_shared/account-authorization.ts');
const accountClient = read('account-access.js');
const dataPolicy = read('supabase/functions/_shared/account-data-policy.mjs');

test('migration creates normalized account, role, permission, invitation, and audit tables', () => {
  [
    'accounts',
    'account_permissions',
    'account_roles',
    'account_role_permissions',
    'account_memberships',
    'account_invitations',
    'account_audit_events'
  ].forEach((table) => assert.match(migration, new RegExp('create table public\\.' + table + '\\b', 'i')));
  assert.match(migration, /created_by_user_id uuid references auth\.users/i);
  assert.match(migration, /updated_by_user_id uuid references auth\.users/i);
});

test('database authorization derives identity from auth.uid and checks live permissions', () => {
  assert.match(migration, /function public\.quotedr_authorize_account/i);
  assert.match(migration, /m\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /m\.status = 'active'/i);
  assert.match(migration, /rp\.permission_key = p_permission_key/i);
  assert.doesNotMatch(migration, /p_user_id\s+uuid[\s\S]{0,300}quotedr_authorize_account/i);
});

test('account security tables are RPC and API only for browser users', () => {
  [
    'accounts',
    'account_permissions',
    'account_roles',
    'account_role_permissions',
    'account_memberships',
    'account_invitations',
    'account_audit_events'
  ].forEach((table) => {
    assert.doesNotMatch(
      migration,
      new RegExp('grant\\s+(select|insert|update|delete|all)[^;]*public\\.' + table + '[^;]*to\\s+authenticated', 'i')
    );
  });
});

test('raw operational tables retain a restrictive owner-only RLS boundary', () => {
  ['quotes', 'items', 'clients', 'templates'].forEach((table) => {
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
    assert.match(migration, new RegExp('create policy quotedr_' + table + '_owner_boundary[\\s\\S]{0,180}as restrictive[\\s\\S]{0,180}auth\\.uid\\(\\)\\) = user_id', 'i'));
    assert.match(migration, new RegExp('create policy quotedr_' + table + '_owner_boundary[\\s\\S]{0,180}to anon, authenticated', 'i'));
  });
  [
    ['user_data', 'user_data'],
    ['stripe_connected_accounts', 'stripe_accounts'],
    ['payment_records', 'payment_records']
  ].forEach(([table, policy]) => {
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
    assert.match(migration, new RegExp('create policy quotedr_' + policy + '_owner_boundary[\\s\\S]{0,180}as restrictive[\\s\\S]{0,180}auth\\.uid\\(\\)\\) = user_id', 'i'));
    assert.match(migration, new RegExp('create policy quotedr_' + policy + '_owner_boundary[\\s\\S]{0,180}to anon, authenticated', 'i'));
  });
});

test('the database keeps the owner membership active and owner-only', () => {
  assert.match(migration, /a\.owner_user_id = new\.user_id[\s\S]{0,120}new\.status <> 'active'/i);
  assert.match(migration, /role_key = 'owner'[\s\S]{0,120}p_user_id = a\.owner_user_id/i);
  assert.match(migration, /role_key <> 'owner'[\s\S]{0,120}p_user_id <> a\.owner_user_id/i);
});

test('invitations are hashed, expiring, confirmed-email bound, and API-only', () => {
  assert.match(migration, /token_hash bytea not null unique/i);
  assert.match(migration, /create unique index account_invitations_open_email_idx/i);
  assert.match(migration, /extensions\.digest\(convert_to\(p_token/i);
  assert.match(migration, /email_confirmed_at is not null/i);
  assert.match(migration, /v_invitation\.expires_at <= now\(\)/i);
  assert.match(migration, /for update;/i);
  assert.match(migration, /function private\.validate_account_invitation_role/i);
  assert.match(migration, /r\.is_assignable[\s\S]{0,160}r\.account_id = new\.account_id/i);
  assert.match(migration, /i\.id::text = coalesce\(new\.raw_user_meta_data ->> 'quotedr_invitation_id'/i);
  assert.match(migration, /i\.normalized_email = lower\(btrim\(new\.email\)\)/i);
  assert.match(migration, /i\.expires_at > now\(\)/i);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+table\s+public\.account_invitations\s+to\s+authenticated/i);
});

test('invitation acceptance repair is unambiguous, transactional, and retry safe', () => {
  assert.match(invitationRepairMigration, /security definer\s+set search_path = ''/i);
  assert.match(invitationRepairMigration, /for update;/i);
  assert.match(invitationRepairMigration, /private\.account_role_is_valid\(/i);
  assert.match(invitationRepairMigration, /on conflict on constraint account_memberships_account_id_user_id_key/i);
  assert.doesNotMatch(invitationRepairMigration, /on conflict\s*\(\s*account_id\s*,\s*user_id\s*\)/i);
  assert.match(invitationRepairMigration, /v_invitation\.accepted_by_user_id is distinct from v_user_id/i);
  assert.match(invitationRepairMigration, /m\.role_id = v_invitation\.role_id[\s\S]{0,100}m\.status = 'active'/i);
  assert.match(invitationRepairMigration, /update public\.account_invitations[\s\S]+insert into public\.account_audit_events/i);
  assert.match(invitationRepairMigration, /revoke all on function public\.quotedr_accept_team_invitation\(text\)[\s\S]{0,100}public, anon, authenticated, service_role/i);
  assert.match(invitationRepairMigration, /grant execute on function public\.quotedr_accept_team_invitation\(text\)[\s\S]{0,50}to authenticated/i);
  assert.doesNotMatch(invitationRepairMigration, /role_key\s*=\s*'estimator'/i);
  assert.match(accountApi, /async function inviteMember[\s\S]{0,220}requireAccountPermission\(req, accountId, ACCOUNT_PERMISSION\.TEAM_MANAGE\)/i);
  assert.match(accountApi, /async function acceptInvitation[\s\S]{0,180}authenticatedClient\(req\)/i);
});

test('invitation fixtures cover failure rollback, identity boundaries, and concurrent retry', () => {
  assert.match(invitationFixture, /post-write failure left a partial membership/i);
  assert.match(invitationApiFixture, /anon invitation acceptance must fail/i);
  assert.match(invitationApiFixture, /response\.status === 401 \|\| response\.status === 403 \|\| response\.status === 404/i);
  assert.match(invitationFixture, /invitation-expired@example\.invalid/i);
  assert.match(invitationFixture, /invitation-revoked@example\.invalid/i);
  assert.match(invitationFixture, /invitation-role-mismatch@example\.invalid/i);
  assert.match(invitationFixture, /same-invitee retry did not return the original result/i);
  assert.match(invitationFixture, /accepted-token retry changed a suspended membership/i);
  assert.match(invitationConcurrencyFixture, /pg_advisory_xact_lock/i);
  assert.match(invitationConcurrencyFixture, /dblink_send_query/i);
  assert.match(invitationConcurrencyFixture, /concurrent acceptance wrote more than one audit event/i);
});

test('estimator seed contains quote-building capabilities but no sensitive capabilities', () => {
  const start = migration.indexOf("r.role_key = 'estimator'");
  const blockStart = migration.lastIndexOf('cross join (values', start);
  const block = migration.slice(blockStart, start + 80);
  ['quotes.read', 'quotes.create', 'quotes.update', 'items.read', 'clients.manage', 'templates.read']
    .forEach((permission) => assert.match(block, new RegExp(permission.replace('.', '\\.'))));
  ['pricing', 'payments', 'billing', 'integrations', 'team.manage', 'quotes.send', 'quotes.delete', 'clients.delete']
    .forEach((permission) => assert.doesNotMatch(block, new RegExp(permission.replace('.', '\\.'))));
});

test('application authorization uses permission keys rather than estimator role branches', () => {
  assert.match(accountAuth, /ACCOUNT_PERMISSION/);
  assert.match(accountApi, /requireAccountPermission\(/);
  assert.doesNotMatch(accountApi, /roleKey\s*={2,3}\s*['"]estimator['"]/);
  assert.doesNotMatch(accountClient, /role[^\n]*={2,3}[^\n]*['"]estimator['"]/i);
  assert.match(migration, /is_assignable boolean not null/i);
  assert.match(migration, /constraint account_roles_owner_reserved/i);
  assert.match(accountAuth, /context\.accounts\.length === 1/);
  assert.match(accountAuth, /throw new AccountAccessError\('Choose an account'/);
});

test('field permissions are normalized, default-deny, and unavailable through the browser Data API', () => {
  ['account_permission_dependencies', 'account_fields', 'account_role_fields'].forEach((table) => {
    assert.match(fieldMigration, new RegExp('create table public\\.' + table + '\\b', 'i'));
    assert.match(fieldMigration, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
    assert.match(fieldMigration, new RegExp('revoke all on table public\\.' + table + ' from public, anon, authenticated', 'i'));
    assert.doesNotMatch(
      fieldMigration,
      new RegExp('grant\\s+(select|insert|update|delete|all)[^;]*public\\.' + table + '[^;]*to\\s+authenticated', 'i')
    );
  });
  assert.match(fieldMigration, /access_level in \('read', 'write'\)/i);
  assert.match(fieldMigration, /'fields', coalesce\([\s\S]{0,400}jsonb_object_agg\(rf\.field_key, rf\.access_level/i);
  assert.match(dataPolicy, /if \(fieldAccess == null\) return true/);
  assert.match(dataPolicy, /level === 'read' \|\| level === 'write'/);
  assert.match(accountClient, /return level === 'write' \? 'write' : level === 'read' \? 'read' : 'hidden'/);
});

test('custom roles are account-scoped and saved atomically after a live database permission check', () => {
  assert.match(fieldMigration, /function public\.quotedr_save_account_role/i);
  assert.match(fieldMigration, /private\.user_has_account_permission\(auth\.uid\(\), p_account_id, 'roles\.manage'\)/i);
  assert.match(fieldMigration, /r\.account_id = p_account_id[\s\S]{0,100}not r\.is_system/i);
  assert.match(fieldMigration, /delete from public\.account_role_permissions where role_id = v_role_id/i);
  assert.match(fieldMigration, /delete from public\.account_role_fields where role_id = v_role_id/i);
  assert.match(fieldMigration, /account_permission_dependencies[\s\S]{0,220}required_permission_key = any\(v_permission_keys\)/i);
  assert.match(fieldMigration, /not f\.supports_write[\s\S]{0,120}f\.write_permission_key is null/i);
  assert.match(fieldMigration, /revoke all on function public\.quotedr_save_account_role[^;]+from public, anon, authenticated/i);
  assert.match(fieldMigration, /grant execute on function public\.quotedr_save_account_role[^;]+to authenticated/i);
  assert.match(fieldMigration, /function public\.quotedr_archive_account_role/i);
  assert.match(fieldMigration, /Reassign members before archiving this role/i);
});

test('role save repair preserves account isolation, owner authorization, and system immutability', () => {
  assert.match(roleRepairMigration, /a\.id = p_account_id[\s\S]{0,100}a\.owner_user_id = auth\.uid\(\)/i);
  assert.match(roleRepairMigration, /private\.user_has_account_permission\(auth\.uid\(\), p_account_id, 'roles\.manage'\)/i);
  assert.match(roleRepairMigration, /r\.id = p_role_id[\s\S]{0,100}r\.account_id = p_account_id[\s\S]{0,100}not r\.is_system/i);
  assert.match(roleRepairMigration, /r\.account_id is null[\s\S]{0,100}lower\(btrim\(r\.name\)\) = lower\(v_name\)/i);
  assert.match(roleRepairMigration, /where not p\.assignable_to_custom/i);
  assert.match(roleRepairMigration, /account_permission_dependencies[\s\S]{0,220}required_permission_key = any\(v_permission_keys\)/i);
  assert.match(roleRepairMigration, /not f\.supports_write[\s\S]{0,140}f\.write_permission_key is null/i);
});

test('role save repair prevents duplicate retries and leaves its write set in one RPC transaction', () => {
  assert.match(roleRepairMigration, /create unique index if not exists account_roles_active_account_name_unique/i);
  assert.match(roleRepairMigration, /pg_advisory_xact_lock\([\s\S]{0,180}hashtextextended/i);
  assert.match(roleRepairMigration, /v_existing_permissions = v_permission_keys[\s\S]{0,140}v_existing_fields = v_visible_field_access[\s\S]{0,100}return v_role_id/i);
  assert.match(roleRepairMigration, /delete from public\.account_role_permissions[\s\S]+insert into public\.account_role_fields[\s\S]+insert into public\.account_audit_events/i);
  assert.doesNotMatch(roleRepairMigration, /jsonb_object_length\s*\(/i);
});

test('team responses load role field mappings and enforce them before serialization and writes', () => {
  assert.match(accountAuth, /function loadAccountFieldAccess/i);
  assert.match(accountAuth, /from\('account_role_fields'\)/);
  assert.match(accountApi, /loadAccountFieldAccess\(auth\)/);
  assert.match(accountApi, /sanitizeQuoteRow\(annotated, \{ canReadPricing, fieldAccess \}\)/);
  assert.match(accountApi, /mergeRestrictedQuoteUpdate\([^;]+\{ fieldAccess \}\)/s);
  assert.match(accountApi, /sanitizeClientRow\(row, \{ fieldAccess \}\)/);
  assert.match(accountApi, /mergeClientFieldAccess\(existing \|\| \{\}, source, \{ fieldAccess \}\)/);
  assert.match(accountApi, /sanitizeBusinessProfile\(stored\.data\.value, \{ fieldAccess \}\)/);
  assert.match(accountApi, /accountFieldCanRead\(fieldAccess, ACCOUNT_FIELD\.BUSINESS_LOGO\)/);
});

test('team API gates sensitive third-party and sharing functions through shared capabilities', () => {
  const expected = new Map([
    ['supabase/functions/stripe-connect/index.ts', 'PAYMENTS_MANAGE'],
    ['supabase/functions/stripe-checkout/index.ts', 'BILLING_MANAGE'],
    ['supabase/functions/qb-oauth/index.ts', 'INTEGRATIONS_MANAGE'],
    ['supabase/functions/qb-sync/index.ts', 'INTEGRATIONS_MANAGE'],
    ['supabase/functions/send-quote-email/index.ts', 'QUOTES_SEND'],
    ['supabase/functions/client-document/index.ts', 'QUOTES_SEND']
  ]);
  for (const [file, permission] of expected) {
    const source = read(file);
    assert.match(source, /requireAccountPermissionWithDefault/);
    assert.match(source, new RegExp('ACCOUNT_PERMISSION\\.' + permission));
  }
  assert.match(accountApi, /canSendQuotes\s*=\s*await hasPermission\(auth, ACCOUNT_PERMISSION\.QUOTES_SEND\)/);
  assert.match(accountApi, /if \(!canSendQuotes\)[\s\S]{0,260}values\.status/);
  assert.match(accountApi, /if \(!canSendQuotes && quoteIsClientFacing\(original\)\)/);
  assert.match(accountApi, /'finalized_quote'/);
  assert.match(accountApi, /canDeleteClients\s*=\s*await hasPermission\(auth, ACCOUNT_PERMISSION\.CLIENTS_DELETE\)/);
  assert.match(accountApi, /if \(canDeleteClients && staleIds\.length > 0\)/);
  assert.match(accountApi, /updateQuery = updateQuery\.eq\('updated_at', expectedUpdatedAt\)/);
});

test('team function is configured for platform JWT verification', () => {
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.team-account\]\s*verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.qb-sync\]\s*verify_jwt\s*=\s*true/);
});

test('team-account foreign keys used by authorization and actor attribution are indexed', () => {
  [
    'account_audit_events_actor_user_idx',
    'account_fields_read_permission_idx',
    'account_fields_write_permission_idx',
    'account_invitations_accepted_by_user_idx',
    'account_invitations_invited_by_user_idx',
    'account_invitations_role_idx',
    'account_memberships_invited_by_user_idx',
    'account_memberships_role_idx',
    'clients_created_by_user_idx',
    'clients_updated_by_user_idx',
    'items_created_by_user_idx',
    'items_updated_by_user_idx',
    'quotes_created_by_user_idx',
    'quotes_updated_by_user_idx'
  ].forEach((indexName) => assert.match(indexMigration, new RegExp('create index if not exists ' + indexName, 'i')));
});
