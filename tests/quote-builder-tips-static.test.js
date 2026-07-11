const assert = require('node:assert');
const fs = require('node:fs');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const tips = fs.readFileSync('quote-tips.js', 'utf8');

assert(builder.includes('quote-tips.js'), 'quote builder should load the shared quote tips module');
assert(tips.includes('window.QuoteDrTips'), 'tips module should expose a QuoteDrTips API');
assert(tips.includes('QUOTE_TIPS_INTERVAL_MS'), 'tips module should define an interval gate constant');
assert(tips.includes('60 * 60 * 1000'), 'tips should wait at least one hour between automatic popups');
assert(tips.includes('quote_builder_tip_settings'), 'tips should sync preferences with the user_data key quote_builder_tip_settings');
assert(tips.includes('ald_quote_builder_tip_settings'), 'tips should keep an immediate localStorage fallback');
assert(tips.includes('Stop Showing Tips'), 'tip modal should include the global opt-out control');
assert(tips.includes('Learn More'), 'tip modal should include a help CTA when a help page exists');
assert(tips.includes('Watch Tutorial'), 'tip modal should include a tutorial CTA');
assert(tips.includes('QUOTE_TIPS_YOUTUBE_PLACEHOLDER_URL'), 'tips should keep a single future YouTube placeholder URL');
assert(tips.includes('app_broadcast') === false, 'tips should not depend on admin broadcast tables');
assert(tips.includes('querySelector(\'.modal.show\')') || tips.includes('querySelector(".modal.show")'), 'tips should not show over an open modal');
assert(tips.includes('isBuilderTutorialCompeting'), 'tips should avoid competing with the interactive builder tutorial');
assert(tips.includes('forceShowNextTip'), 'settings should be able to show a tip on demand');
assert(tips.includes('resetRotation'), 'settings should be able to reset the tip rotation');

[
  'Manage Line Items',
  'Choice Groups',
  'Upgrade Wizard',
  'AI Quote Builder',
  'AI Memory',
  'AI Trade Rules',
  'Voice Templates',
  'Satellite Measure',
  'Floor Plan Scanner',
  'Quick Room Quoter',
  'QuickBooks',
  'Change Orders'
].forEach((label) => {
  assert(tips.includes(label), `tips catalog should include ${label}`);
});

console.log('quote builder tips static test passed');
