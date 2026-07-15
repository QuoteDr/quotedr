const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');

assert.match(viewer, /function getViewerHiddenProfileFields\(profile\)/);
assert.match(viewer, /addFields\(quoteData && quoteData\.hiddenProfileFields\)/);
assert.match(viewer, /addFields\(profile && profile\.hidden_profile_fields\)/);
assert.match(viewer, /hiddenProfileFields\.includes\('businessName'\) \? '' : companyName/);
assert.match(viewer, /bizEl\.style\.display = lines\.length \? '' : 'none'/);

assert.match(supabase, /localStorage\.setItem\('ald_hidden_profile_fields', JSON\.stringify\(profile\.hidden_profile_fields\)\)/);
assert.match(supabase, /localStorage\.setItem\('ald_hidden_profile_fields', JSON\.stringify\(data\.value\.hidden_profile_fields\)\)/);

console.log('Business profile visibility static checks passed.');
