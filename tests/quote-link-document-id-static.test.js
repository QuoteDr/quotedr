const fs = require('fs');
const path = require('path');

const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'supabase-v2.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const builderSource = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /var sharingRow = Array\.isArray\(sharingResult\.data\) \? sharingResult\.data\[0\] : sharingResult\.data;/.test(supabaseSource),
  'saveQuoteForSharing should normalize array-shaped durable save acknowledgements'
);
assert(
  /if \(!sharingRow && quoteData\.supabaseId\) sharingRow = \{ id: quoteData\.supabaseId \};/.test(supabaseSource),
  'saveQuoteForSharing should preserve the known quote id when an acknowledgement omits its row'
);

const linkFunction = styleSource.match(/async function createInteractiveQuoteLink\(\) \{[\s\S]*?\r?\n        \}\r?\n\r?\n        async function previewInteractiveQuote/);
assert(linkFunction, 'createInteractiveQuoteLink should exist');
assert(
  /const savedRow = Array\.isArray\(result\.data\) \? result\.data\[0\] : result\.data;/.test(linkFunction[0]),
  'quote link creation should accept either an array or object save acknowledgement'
);
assert(
  /const supabaseId = \(savedRow && savedRow\.id\) \|\| quoteData\.supabaseId \|\| window\._supabaseQuoteId;/.test(linkFunction[0]),
  'quote link creation should recover the document id from every authoritative save location'
);
assert(
  linkFunction[0].indexOf('if (!supabaseId)') < linkFunction[0].indexOf('createSecureClientShareLink(supabaseId'),
  'quote link creation should reject a missing id before requesting a secure link'
);
assert(
  linkFunction[0].indexOf('window._supabaseQuoteId = supabaseId;') < linkFunction[0].indexOf('createSecureClientShareLink(supabaseId'),
  'the saved quote id should be adopted before secure-link creation'
);
assert(
  builderSource.includes('supabase-v2.js?v=2026071503') && builderSource.includes('quote-style.js?v=2026071503'),
  'quote builder should cache-bust both scripts containing the fix'
);

console.log('quote link document id static test passed');
