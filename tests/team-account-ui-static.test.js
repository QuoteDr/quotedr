const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('core authenticated pages load the shared account access layer', () => {
  ['dashboard.html', 'quote-builder.html', 'settings.html', 'login.html', 'pricing.html']
    .forEach((file) => assert.match(read(file), /account-access\.js/));
});

test('settings exposes a permission-gated, accessible team workflow', () => {
  const settings = read('settings.html');
  assert.match(settings, /data-settings-tab="team"[^>]+data-account-permission="team\.read"/);
  assert.match(settings, /id="teamInviteForm"/);
  assert.match(settings, /<input[^>]+id="teamInviteEmail"[^>]*>/);
  assert.match(settings, /<input[^>]+type="email"[^>]+id="teamInviteEmail"[^>]*>/);
  assert.match(settings, /QuoteDrAccount\.api\('team\.invite'/);
  assert.match(settings, /QuoteDrAccount\.api\('team\.member\.update'/);
  assert.match(settings, /QuoteDrAccount\.api\('team\.member\.remove'/);
  assert.match(settings, /Account settings are owner-only/);
});

test('settings provides custom role templates and per-member field privacy controls', () => {
  const settings = read('settings.html');
  assert.match(settings, /id="teamRoleTemplateList"/);
  assert.match(settings, /data-account-permission="roles\.manage"[^>]+data-account-owner-only/);
  assert.match(settings, /id="teamRoleModal"[^>]+aria-labelledby="teamRoleModalTitle"/);
  assert.match(settings, /id="teamRolePermissionList"/);
  assert.match(settings, /id="teamRoleFieldList"/);
  assert.match(settings, /\['hidden', 'Hidden'\]/);
  assert.match(settings, /\['read', 'View'\]/);
  assert.match(settings, /\['write', 'Edit'\]/);
  assert.match(settings, /QuoteDrAccount\.api\('roles\.catalog'/);
  assert.match(settings, /QuoteDrAccount\.api\('roles\.save'/);
  assert.match(settings, /QuoteDrAccount\.api\('roles\.archive'/);
  assert.match(settings, /Customize access/);
  assert.match(settings, /customizeTeamMemberAccess\(member\)/);
  assert.match(settings, /permission\.customRoleAllowed === false/);
  assert.match(settings, /Owner only/);
  assert.match(settings, /QuoteDrAccount\.isOwner\(\)/);
  assert.match(settings, /memberId:\s*quotedrRoleEditor\.member\.id[\s\S]{0,180}roleId:\s*savedRoleId/);
  assert.doesNotMatch(settings, /role\.(?:key|roleKey)\s*={2,3}\s*['"]estimator['"]/i);
});

test('invitation page preserves the token across sign-in and accepts through the authenticated API', () => {
  const invite = read('team-invite.html');
  const login = read('login.html');
  assert.match(invite, /quotedr_pending_invite_token/);
  assert.match(invite, /name='referrer' content='no-referrer'/);
  assert.match(invite, /history\.replaceState\(null, document\.title, window\.location\.pathname\)/);
  assert.match(invite, /action: 'invitation\.accept'/);
  assert.match(invite, /quotedr_password_created/);
  assert.match(invite, /localStorage\.setItem\('quotedr_active_account_id'/);
  assert.match(login, /pendingTeamInviteUrl/);
});

test('team members route shared data through the account API', () => {
  const supabase = read('supabase-v2.js');
  ['quotes.list', 'quotes.get', 'quotes.save', 'quotes.delete', 'items.list', 'clients.list', 'clients.save', 'clients.replace', 'templates.list']
    .forEach((action) => assert.match(supabase, new RegExp(action.replace('.', '\\.'))));
  assert.match(supabase, /if \(await qdUsesTeamAccountApi\(\)\) return qdExecuteTeamAccountTarget/);
});

test('restricted UI hides pricing and send controls based on capabilities', () => {
  const access = read('account-access.js');
  assert.match(access, /qd-no-pricing-access/);
  assert.match(access, /QUOTES_PRICING_READ/);
  assert.match(access, /qd-no-send-access/);
  assert.match(access, /QUOTES_SEND/);
  assert.match(access, /data-account-permission/);
  assert.match(read('dashboard.html'), /data-account-permission="quotes\.delete"/);
  assert.match(read('quote-builder.html'), /data-account-permission="items\.manage"/);
  assert.match(read('quote-builder.html'), /data-account-permission="templates\.manage"/);
  assert.match(read('quote-builder.html'), /data-account-field="quotes\.client_email"[^>]+data-account-field-access="write"/);
  assert.match(read('quote-builder.html'), /data-account-field="quotes\.customer_pricing"[^>]+data-account-field-access="write"/);
  assert.match(access, /canReadField/);
  assert.match(access, /canWriteField/);
});

test('browser caches are reset when the signed-in user, account, or permission set changes', () => {
  const access = read('account-access.js');
  assert.match(access, /quotedr_cache_principal/);
  assert.match(access, /account\.accountId \|\| 'legacy'/);
  assert.match(access, /account\.permissions\.slice\(\)\.sort\(\)\.join\(','\)/);
  assert.match(access, /account\.fields\[key\]/);
  assert.match(access, /isSupabaseAuthStorageKey/);
  assert.match(access, /function storedSessionUserId\(\)/);
  assert.match(access, /protectStoredSessionBoundary\(\);/);
  assert.match(access, /event === 'INITIAL_SESSION'/);
  assert.match(access, /bootstrapOwnedAccount/);
  assert.match(access, /firstKnownSharedAccount/);
  assert.match(access, /quotedr_pending_invite_token/);
  assert.match(access, /deleteDatabase\('quotedr-durable-saves'\)/);
  assert.match(access, /protectAccountCache\(state\.user, state\.active\)/);
});

test('role save errors are actionable and remain visible in the mobile scroll modal', () => {
  const settings = read('settings.html');
  const access = read('account-access.js');
  assert.match(access, /invokeError\.context\.json\(\)/);
  assert.match(access, /role_name_taken/);
  assert.match(access, /Choose a different name or edit the existing role/);
  assert.match(settings, /function showTeamRoleSaveError/);
  assert.match(settings, /No changes were applied\. Try again/);
  assert.match(settings, /Reference ' \+ reference\.toUpperCase\(\)/);
  assert.match(settings, /modalBody\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
  assert.match(settings, /name\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(settings, /name\.focus\(\)/);
  assert.match(settings, /aria-errormessage="teamRoleEditorMessage"/);
});
