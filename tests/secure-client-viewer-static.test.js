const assert = require('node:assert');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const edgeSource = read('supabase/functions/client-document/index.ts');
const policySource = read('supabase/functions/_shared/client-document-policy.mjs');
const supabaseSource = read('supabase-v2.js');
const quoteStyleSource = read('quote-style.js');
const quoteBuilderSource = read('quote-builder.html');
const dashboardSource = read('dashboard.html');
const invoiceViewerSource = read('invoice-viewer.html');
const quoteViewerSource = read('interactive-quote-viewer.html');

assert(edgeSource.includes('sha256Hex'), 'client-document edge function should hash share tokens');
assert(edgeSource.includes('public_share_token_hash'), 'client-document should validate against hashed tokens stored on quote rows');
assert(edgeSource.includes('portalAnchorId'), 'client-document should support token-scoped portal sibling document access');
assert(edgeSource.includes('portalVisible(target) && target.public_share_token_hash === tokenHash'), 'secure tokens should stop working after a document leaves its portal');
assert(edgeSource.includes('async function assertPortalAnchorAccess'), 'portal-shell access should use a separate anchor-only authorization path');
assert(edgeSource.includes('.filter((row) => portalVisible(row) && samePortalGroup(anchor, row))'), 'anchor-only rows should be excluded from portal documents');
assert(edgeSource.includes('signedInUser?.id && signedInUser.id === target.user_id'), 'client-document should not mark owner preview sessions as client viewed');
assert(edgeSource.includes('skipped: "owner_view"'), 'client-document should report owner view skips as unchanged');
assert(!/select\\('\\*'\\).*eq\\('id', documentId\\).*single\\(\\)/s.test(edgeSource), 'client-document should avoid unbounded public row reads without token validation');

assert(supabaseSource.includes('createSecureClientShareLink'), 'supabase-v2 should expose secure share-link creation');
assert(supabaseSource.includes('loadSecureClientDocument'), 'supabase-v2 should expose secure public document loading');
assert(supabaseSource.includes('updateSecureClientDocument'), 'supabase-v2 should expose secure public document updates');
assert(supabaseSource.includes('getSupabaseOptionalUserFunctionHeaders'), 'secure document updates should include the current signed-in user when available');
assert(supabaseSource.includes('session?.access_token'), 'optional secure update auth should use the current user access token instead of always using anon');
assert(supabaseSource.includes("options.mode || 'portal'"), 'secure link creation should default to portal mode');
assert(supabaseSource.includes("if (mode !== 'portal')"), 'the browser helper should reject standalone document-link creation');

assert(!quoteStyleSource.includes('createSecureClientShareLink'), 'quote preparation should not mint a standalone share token');
assert(!quoteStyleSource.includes("mode: 'document'"), 'quote preparation should not request document-mode tokens');
assert((quoteBuilderSource.match(/createSecureClientShareLink\([^\n]+\{ mode: 'portal' \}\)/g) || []).length >= 2, 'builder token creation should be limited to explicit portal links');
assert((dashboardSource.match(/createSecureClientShareLink\([^\n]+\{ mode: 'portal' \}\)/g) || []).length >= 2, 'dashboard token creation should be limited to explicit portal links');
assert(edgeSource.includes('if (mode !== "portal")'), 'the Edge Function should reject non-portal link creation');
assert(edgeSource.includes('code: "portal_assignment_required"'), 'the Edge Function should require portal assignment before minting a token');
assert(edgeSource.includes('code: "portal_url_required"'), 'the Edge Function should reject a non-portal destination URL');
assert(edgeSource.includes('sanitizeClientDocumentRow(row, options)'), 'public document payloads should use the dedicated allowlist projection');
assert(!policySource.includes("'portal_share_token'") && !policySource.includes("'portal_pin'"), 'public document payloads should not allow persisted portal tokens or PIN metadata');
assert(invoiceViewerSource.includes('loadSecureClientDocument'), 'invoice viewer should load shared invoices through the secure function');
assert(quoteViewerSource.includes('loadSecureClientDocument'), 'quote viewer should load shared quotes through the secure function');
assert(!quoteViewerSource.includes('markQuoteViewed(quoteId);'), 'quote viewer should not directly update public quote rows when marking viewed');

console.log('secure client viewer static test passed');
