const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const settings = read('settings.html');
const adminAccess = read('admin-access.js');
const privacy = read('recording-privacy.js');
const theme = read('brand-theme.css');
const analyticsBrief = read('supabase/functions/analytics-brief/index.ts');
const adminMigration = read('supabase/migrations/20260713150000_expand_quotedr_admin_access.sql');
const adminEmailMigration = read('supabase/migrations/20260802005740_add_admin_email_routing.sql');
const browserFixture = read('tests/recording-privacy-browser-fixture.html');

const inlineScripts = Array.from(settings.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
inlineScripts.forEach((match, index) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `settings-inline-${index + 1}.js` }), `settings inline script ${index + 1} should parse`);
});

assert(adminAccess.includes('admin@quotedr.io'), 'new QuoteDr administrator email should be allowed');
assert(adminAccess.includes('info@alddirect.ca'), 'owner administrator email should remain allowed');
assert(adminAccess.includes('ald.direct.contracting@gmail.com'), 'tutorial administrator email should be allowed');
assert(adminAccess.includes('isAdminUser'), 'shared admin helper should expose an admin check');

assert(settings.includes('id="adminSettingsGroup"'), 'settings should have a separate Administrator group');
assert(settings.includes('id="adminSettingsTabs"'), 'Administrator group should own a separate tab list');
assert(settings.includes('id="adminControlsTabLink"'), 'Administrator group should link to Admin Controls');
assert(settings.includes('id="tab-admin-controls"'), 'settings should include the Admin Controls panel');
assert(settings.includes('id="recordingPrivacyToggle"'), 'Admin Controls should expose a recording privacy toggle');
assert(settings.includes("QUOTEDR_ADMIN_TABS = ['analytics', 'site-traffic', 'user-messages', 'admin-controls', 'save-incidents', 'chatbot-feedback']"), 'all admin tabs should share one guard');
assert(settings.includes('s.adminOnly && !isQuoteDrAdminUser'), 'non-admin search should exclude administrator settings');

assert(privacy.includes("ald_recording_price_privacy_v1"), 'privacy preference should use the planned localStorage key');
assert(privacy.includes('window, document'), 'privacy engine should initialize in the browser');
assert(privacy.includes('MutationObserver'), 'privacy engine should cover dynamically rendered prices');
assert(privacy.includes('qd-recording-prices-hidden'), 'privacy engine should apply a root state class');
assert(privacy.includes('quantity') && privacy.includes('tax\\s*rate'), 'privacy input detection should explicitly exclude quantities and tax rates');
assert(privacy.includes('QuoteDrRecordingPrivacy'), 'privacy engine should expose its shared browser API');
assert(theme.includes('html.qd-recording-prices-hidden .qd-recording-price-token'), 'theme should visually cover currency tokens');
assert(theme.includes('input[data-qd-private-price]'), 'theme should visually cover price inputs');
assert(browserFixture.includes('24 LF @ $125.00 = $3,000.00'), 'browser fixture should cover mixed quantity and price text');
assert(browserFixture.includes('&pound;90.00 / &euro;105.00 / 250.00 CAD'), 'browser fixture should cover alternate currency formats');
assert(browserFixture.includes('id="lineQuantity"') && browserFixture.includes('id="lineRate"'), 'browser fixture should compare quantity and price inputs');

[
    'quote-builder.html',
    'dashboard.html',
    'settings.html',
    'interactive-quote-viewer.html',
    'invoice-viewer.html',
    'client-portal.html',
    'home-depot-tracker.html',
    'home-depot-price-sync.html'
].forEach(page => {
    assert(read(page).includes('recording-privacy.js'), `${page} should load recording privacy`);
});

for (const source of [adminMigration, analyticsBrief]) {
    assert(source.includes('info@alddirect.ca'), 'backend admin gate should include the owner email');
    assert(source.includes('ald.direct.contracting@gmail.com'), 'backend admin gate should include the tutorial email');
}
for (const source of [adminAccess, adminEmailMigration, analyticsBrief]) {
    assert(source.includes('admin@quotedr.io'), 'current admin gates should include the QuoteDr administrator mailbox');
}
assert(adminEmailMigration.includes('Admin can manage broadcast messages'), 'current migration should update broadcast management RLS');
assert(adminEmailMigration.includes('Users can view own broadcast receipts'), 'current migration should let all admins inspect message receipts');
assert(analyticsBrief.includes('verifyAdmin(req)'), 'analytics brief should enforce administrator access');
assert(analyticsBrief.includes('403'), 'analytics brief should return forbidden for non-admin users');
assert(adminMigration.includes('Admin can manage broadcast messages'), 'migration should update broadcast management RLS');
assert(adminMigration.includes('Users can view own broadcast receipts'), 'migration should let both admins inspect message receipts');

console.log('admin recording privacy static test passed');
