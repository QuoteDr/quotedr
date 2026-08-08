const fs = require('fs');
const assert = require('assert');

const settings = fs.readFileSync('settings.html', 'utf8');
const onboarding = fs.readFileSync('onboarding.html', 'utf8');
const controller = fs.readFileSync('quickbooks-import-controller.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const clients = fs.readFileSync('quote-clients.js', 'utf8');
const login = fs.readFileSync('login.html', 'utf8');

function assertInlineScriptsParse(file, source) {
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(source))) {
    assert.doesNotThrow(
      () => new Function(match[1]),
      error => new Error(file + ' contains invalid inline JavaScript: ' + error.message)
    );
  }
}

[settings, onboarding].forEach(function(source) {
  assert(source.includes('quickbooks-import.js'), 'QuickBooks screens should load the shared matching engine');
  assert(source.includes('quickbooks-import-controller.js'), 'QuickBooks screens should load the guarded import controller');
  assert(source.includes('keep_quotedr'), 'matched rates should default to preserving QuoteDr pricing');
  assert(source.includes('use_quickbooks'), 'users should be able to explicitly choose current QuickBooks pricing');
  assert(source.includes('Duplicate cleanup available'), 'the preview should identify safe duplicate cleanup groups');
  assert(source.includes('full cloud'), 'the import UI should explain its full cloud undo backup');
});

assert(!settings.includes('existing.QuickBooks.findIndex'), 'Settings must not limit item matching to the QuickBooks category');
assert(!onboarding.includes('existing.QuickBooks.findIndex'), 'Onboarding must not limit item matching to the QuickBooks category');
assert(controller.includes('backupItemsToCloud'), 'item imports should use the canonical full item snapshot cloud save');
assert(controller.includes('saveUserDataValue'), 'imports should persist undo snapshots before changing primary data');
assert(controller.includes('after_fingerprint') || fs.readFileSync('quickbooks-import.js', 'utf8').includes('after_fingerprint'), 'undo should be guarded against later edits');

assert(supabase.includes('async function loadUserDataValue'), 'cloud undo snapshots should be reloadable');
assert(/qdClientCrmForStorage[\s\S]*crm\.quickbooks/.test(supabase), 'client cloud sync should retain QuickBooks identity in CRM JSON');
assert(/normalizeClientCrm[\s\S]*quickbooks/.test(clients), 'client normalization should retain QuickBooks identity');
assert(login.includes('restoreItemsFromCloud'), 'sign-in preload should prefer the canonical full item snapshot');

assertInlineScriptsParse('settings.html', settings);
assertInlineScriptsParse('onboarding.html', onboarding);

console.log('QuickBooks duplicate-safe import integration static tests passed');
