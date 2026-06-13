const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('onboarding.html', 'utf8');
const callback = fs.readFileSync('qb-callback.html', 'utf8');

assert(source.includes('Connect QuickBooks'), 'first-run onboarding should offer QuickBooks connection');
assert(source.includes('Preview QuickBooks Customers'), 'onboarding should allow previewing QuickBooks customers');
assert(source.includes('Preview QuickBooks Products &amp; Services') || source.includes('Preview QuickBooks Products & Services'), 'onboarding should allow previewing QuickBooks items');
assert(source.includes('obConnectQuickBooks'), 'onboarding should include a QuickBooks connect handler');
assert(source.includes('obSyncQuickBooksCustomers'), 'onboarding should include QuickBooks customer sync');
assert(source.includes('obSyncQuickBooksItems'), 'onboarding should include QuickBooks item sync');
assert(source.includes('Import Selected'), 'onboarding QuickBooks preview should import selected records');
assert(source.includes('Importer tool in Settings'), 'onboarding should point users to the importer fallback');
assert(source.includes('settings.html#pricing-import'), 'onboarding should link to the settings importer area');
assert(source.includes('ald_qb_return_to_onboarding'), 'onboarding should mark QuickBooks OAuth return intent');
assert(callback.includes('ald_qb_return_to_onboarding'), 'QuickBooks callback should return users to onboarding when launched there');
assert(callback.includes('onboarding.html?qb=connected'), 'QuickBooks callback should reopen onboarding after signup connection');

console.log('onboarding QuickBooks static test passed');
