const assert = require('node:assert');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const builder = read('quote-builder.html');
const quoteStyle = read('quote-style.js');
const dashboard = read('dashboard.html');
const supabase = read('supabase-v2.js');
const clientDocument = read('supabase/functions/client-document/index.ts');
const sendEmail = read('supabase/functions/send-quote-email/index.ts');
const legacyFollowup = read('supabase/functions/quote-followup/index.ts');
const documentPayment = read('supabase/functions/document-payment/index.ts');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');

const activeSharingSource = [builder, quoteStyle, dashboard].join('\n');
assert(!activeSharingSource.includes("mode: 'document'"), 'active sharing UI must not request standalone document tokens');
assert(!activeSharingSource.includes('Copy Quote Link'), 'normal UI must not offer standalone quote-link copying');
assert(!activeSharingSource.includes('>Generate Link<'), 'normal UI must not retain the mobile standalone-link label');
assert(!activeSharingSource.includes('>Send Invoice<'), 'normal UI must identify mobile invoice sharing as a portal action');
assert(!activeSharingSource.includes('Copy Invoice Link'), 'normal UI must not offer standalone invoice-link copying');
assert(builder.includes('Share in Client Portal'), 'quote action should be portal-specific');
assert(builder.includes('Share Invoice in Client Portal'), 'invoice action should be portal-specific');
assert(builder.includes('Share Change Order in Portal'), 'change-order action should be portal-specific');
assert(quoteStyle.includes('saveQuoteForSharing(quoteData, { markShared: false })'), 'opening share choices should preserve draft status');
assert(builder.includes("quoteData.status = quoteData.documentType === 'change_order' ? 'pending_approval' : 'sent'"), 'portal publication should advance draft status at publication time');

const secureCalls = activeSharingSource.match(/createSecureClientShareLink\([^\n]+\)/g) || [];
assert(secureCalls.length === 4, `expected four active portal token call sites, found ${secureCalls.length}`);
secureCalls.forEach((call) => assert(call.includes("{ mode: 'portal' }"), `secure link call is not explicitly portal-scoped: ${call}`));
assert(supabase.includes("options.mode || 'portal'"), 'browser helper should default token creation to portal mode');
assert(supabase.includes("if (mode !== 'portal')"), 'browser helper should reject standalone token creation');

assert(clientDocument.includes('code: "portal_required"'), 'Edge Function should reject non-portal modes');
assert(clientDocument.includes('code: "portal_assignment_required"'), 'Edge Function should require a portal-visible document');
assert(clientDocument.includes('code: "portal_url_required"'), 'Edge Function should reject non-portal destinations');
assert(clientDocument.includes('host === "quotedr.io" || host === "www.quotedr.io"'), 'Edge Function should constrain production portal destinations to QuoteDr');
assert(clientDocument.includes('portal_share_token: token'), 'new portal anchors should persist their stable portal token');
assert(clientDocument.includes('delete safeData[key]'), 'secure document responses should strip portal secrets and editor metadata');
assert(clientDocument.includes('"shareToken"') && clientDocument.includes('"portalToken"'), 'secure document responses should strip legacy token aliases too');
assert(clientDocument.includes('portalVisible(target) && target.public_share_token_hash === tokenHash'), 'removed and non-portal documents should reject old tokens');
assert(clientDocument.includes('return row && portalVisible(row) ? row : null'), 'short portal links should stop resolving when their anchor is removed');
assert(documentPayment.includes('portalVisible(target) && target.public_share_token_hash === tokenHash'), 'removed and non-portal documents should reject old payment tokens');
assert(clientDocument.includes('async function assertTokenAccess'), 'token reads should remain available for portal-internal document, signature, and payment access');

assert(sendEmail.includes('PORTAL_EMAIL_KINDS'), 'document email should declare portal-only kinds');
assert(sendEmail.includes('isQuoteDrPortalUrl'), 'document email should validate the destination');
assert(sendEmail.includes('portalLinkBelongsToAccount'), 'document email should validate portal-link ownership and active assignment');
assert(sendEmail.includes('QuoteDr document emails must use a secure client portal link'), 'document email should reject direct viewer URLs');
assert(builder.includes("emailKind: 'portal_invoice'"), 'invoice email should use the portal-only kind');
assert(builder.includes("'portal_change_order' : 'portal_quote'"), 'quote email should distinguish portal quote and change order');
assert(dashboard.includes("emailKind: 'portal_followup'"), 'follow-up email should use a portal link');
assert(legacyFollowup.includes('portal_followup_required') && !legacyFollowup.includes('api.resend.com'), 'legacy automatic direct-link follow-up should be retired without sending');

assert(dashboard.includes('shareDocumentThroughPortal'), 'dashboard cards should route sharing through portal assignment');
assert(dashboard.includes('dashboardPortalUrlForDocument'), 'dashboard follow-up should resolve a portal URL');
assert(builder.includes('findBuilderPortalStableShare'), 'builder portal sharing should reuse an existing stable portal anchor');
assert(builder.includes('builderPortalUrlFromStableShare'), 'builder should reconstruct only a portal URL from a stable anchor');
assert(supabase.includes('preserveExistingPortalData'), 'regenerating an invoice should preserve an existing portal assignment');
assert(quoteViewer.includes('function downloadQuotePdf()'), 'quote PDF export should remain available');
assert(invoiceViewer.includes('function printInvoice()'), 'invoice PDF/print export should remain available');
assert(quoteViewer.includes('loadSecureClientDocument'), 'portal quote access should retain secure document loading');
assert(invoiceViewer.includes('loadSecureClientDocument'), 'portal invoice access should retain secure document loading');

console.log('portal-only client sharing static test passed');
