const assert = require('node:assert');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const edgeSource = read('supabase/functions/client-document/index.ts');
const supabaseSource = read('supabase-v2.js');
const quoteStyleSource = read('quote-style.js');
const invoiceViewerSource = read('invoice-viewer.html');
const quoteViewerSource = read('interactive-quote-viewer.html');

assert(edgeSource.includes('sha256Hex'), 'client-document edge function should hash share tokens');
assert(edgeSource.includes('public_share_token_hash'), 'client-document should validate against hashed tokens stored on quote rows');
assert(edgeSource.includes('portalAnchorId'), 'client-document should support token-scoped portal sibling document access');
assert(!/select\\('\\*'\\).*eq\\('id', documentId\\).*single\\(\\)/s.test(edgeSource), 'client-document should avoid unbounded public row reads without token validation');

assert(supabaseSource.includes('createSecureClientShareLink'), 'supabase-v2 should expose secure share-link creation');
assert(supabaseSource.includes('loadSecureClientDocument'), 'supabase-v2 should expose secure public document loading');
assert(supabaseSource.includes('updateSecureClientDocument'), 'supabase-v2 should expose secure public document updates');

assert(quoteStyleSource.includes('createSecureClientShareLink'), 'quote link generation should mint a secure share token');
assert(quoteStyleSource.includes('token='), 'quote link generation should include the share token in the URL');
assert(invoiceViewerSource.includes('loadSecureClientDocument'), 'invoice viewer should load shared invoices through the secure function');
assert(quoteViewerSource.includes('loadSecureClientDocument'), 'quote viewer should load shared quotes through the secure function');
assert(!quoteViewerSource.includes('markQuoteViewed(quoteId);'), 'quote viewer should not directly update public quote rows when marking viewed');

console.log('secure client viewer static test passed');
