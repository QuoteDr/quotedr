const assert = require('node:assert');
const fs = require('node:fs');

const settings = fs.readFileSync('settings.html', 'utf8');

assert(settings.includes('quote-tips.js'), 'settings should load the shared quote tips module');
assert(settings.includes("showTab('help'"), 'settings sidebar should include a visible Help tab');
assert(settings.includes('id="tab-help"'), 'settings should include a Help tab panel');
assert(settings.includes('id="quoteTipsEnabled"'), 'Help settings should include the quote builder tips toggle');
assert(settings.includes('saveQuoteTipsSettingsFromUI'), 'Help settings should save quote tips preferences');
assert(settings.includes('showQuoteTipNow'), 'Help settings should let users show a tip now');
assert(settings.includes('resetQuoteTipsRotation'), 'Help settings should let users reset tip rotation');
assert(settings.includes('toggleBuilderTutorialFromSettings'), 'Help settings should control builder tutorial visibility');
assert(settings.includes('restartBuilderTutorialFromSettings'), 'Help settings should restart the first quote tutorial');
assert(settings.includes('help.html'), 'Help settings should link to the help center');
assert(settings.includes('tutorials.html'), 'Help settings should link to tutorials');
assert(settings.includes("'help'"), 'Help should be an allowed settings tab');
assert(settings.includes("keywords: ['help','tips','tip','tutorial','guide','onboarding'"), 'settings search should find help, tips, tutorial, guide, and onboarding');

console.log('settings help tips static test passed');
