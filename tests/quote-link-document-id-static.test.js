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

const linkFunction = styleSource.match(/async function saveQuoteForPortalSharing\(\) \{[\s\S]*?\r?\n        \}\r?\n\r?\n        function getQuoteAdminPreviewUrl/);
assert(linkFunction, 'saveQuoteForPortalSharing should exist');
assert(
  /const savedRow = Array\.isArray\(result\.data\) \? result\.data\[0\] : result\.data;/.test(linkFunction[0]),
  'portal sharing save should accept either an array or object save acknowledgement'
);
assert(
  /const supabaseId = \(savedRow && savedRow\.id\) \|\| quoteData\.supabaseId \|\| window\._supabaseQuoteId;/.test(linkFunction[0]),
  'portal sharing save should recover the document id from every authoritative save location'
);
assert(
  linkFunction[0].includes('if (!supabaseId)') && !linkFunction[0].includes('createSecureClientShareLink'),
  'portal sharing should reject a missing id without minting a standalone document token'
);
assert(
  linkFunction[0].includes('window._supabaseQuoteId = supabaseId;') && linkFunction[0].includes('return quoteData;'),
  'the saved quote id should be adopted before portal assignment'
);
assert(
  linkFunction[0].includes('saveQuoteForSharing(quoteData, { markShared: false })'),
  'opening the portal picker should save without marking a draft as sent'
);
assert(
  Number((builderSource.match(/supabase-v2\.js\?v=(\d+)/) || [])[1]) >= 2026071901 &&
    Number((builderSource.match(/quote-style\.js\?v=(\d+)/) || [])[1]) >= 2026071503,
  'quote builder should cache-bust both scripts containing the fix'
);

console.log('quote link document id static test passed');
