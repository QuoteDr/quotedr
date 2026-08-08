const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const builder = read('quote-builder.html');
const quoteStyle = read('quote-style.js');
const supabase = read('supabase-v2.js');
const emailFunction = read('supabase/functions/send-quote-email/index.ts');

assert(builder.includes('shareCurrentInvoicePortal'), 'invoice modal should expose a portal-only share action');
assert(builder.includes('copyTextToClipboard'), 'portal copy action should have a clipboard fallback');
assert(builder.includes('Choose Portal &amp; Copy Link'), 'invoice modal should offer portal assignment plus link copying');
assert(builder.includes('Choose Portal &amp; Open'), 'invoice modal should offer portal assignment plus portal opening');
assert(!builder.includes('Copy Invoice Link'), 'invoice modal should not expose a standalone invoice-link button');
assert(!builder.includes('invoiceAddToPortalEmail'), 'portal inclusion should not be optional for invoice email');
assert(builder.includes('invoicePortalAssignModal'), 'portal sharing should open a portal assignment modal');
assert(builder.includes('openInvoicePortalAssignment'), 'portal sharing should require choosing a portal before publishing');
assert(builder.includes('renderInvoicePortalAssignmentList'), 'portal assignment modal should render existing portals');
assert(builder.includes('assignCurrentInvoiceToPortal'), 'portal assignment modal should assign the invoice to a selected portal');
assert(builder.includes('createPortalForCurrentInvoice'), 'portal assignment modal should support creating a portal for the invoice');
assert(builder.includes('Recommended'), 'portal assignment modal should mark likely client matches as recommended');
assert(builder.includes('resumeInvoiceEmailAfterPortal'), 'email flow should resume after portal assignment');
assert(builder.includes('ensureInvoiceSavedForPortal'), 'invoice sharing should wait for a durable cloud save without minting a direct token');
assert(!builder.includes('ensureInvoiceShareableUrl'), 'standalone invoice URL preparation should be retired');
assert(builder.includes('ensureInvoicePortalUrl'), 'email flow should always generate a portal URL');
assert(builder.includes("emailKind: 'portal_invoice'"), 'invoice email should identify itself as portal-only');
assert(/quoteUrl:\s*portalUrl/.test(builder), 'invoice email CTA should use the portal URL');
assert(builder.includes('portal_id'), 'invoice portal assignment should store a durable portal id');
assert(builder.includes('portal_name'), 'invoice portal assignment should store a portal name');
assert(builder.includes('portal_pin'), 'invoice portal assignment should preserve or create a portal PIN');
assert(builder.includes('portalUrl: portalUrl'), 'invoice email request should send the required portal URL');

assert(supabase.includes("documentType: 'invoice'"), 'saved invoice rows should have explicit invoice documentType');
assert(supabase.includes('portal_visible: invoiceData.portal_visible === true'), 'saved invoice rows should preserve portal visibility');
assert(supabase.includes('portal_client_name'), 'saved invoice rows should store portal client name');
assert(supabase.includes('portal_client_email'), 'saved invoice rows should store portal client email');

assert(emailFunction.includes('portalUrl'), 'email function should accept portalUrl');
assert(emailFunction.includes('PORTAL_EMAIL_KINDS'), 'email function should recognize portal-only document email kinds');
assert(emailFunction.includes('isQuoteDrPortalUrl'), 'email function should validate the portal destination server-side');
assert(emailFunction.includes('QuoteDr document emails must use a secure client portal link'), 'email function should reject standalone document URLs');

assert(!quoteStyle.includes('quoteAddToPortalEmail'), 'portal inclusion should not be optional for quote email');
assert(quoteStyle.includes("shareCurrentQuotePortal('copy')"), 'quote modal should expose portal assignment plus copying');
assert(quoteStyle.includes("shareCurrentQuotePortal('open')"), 'quote modal should expose portal assignment plus opening');
assert(!quoteStyle.includes('Copy Quote Link'), 'quote modal should not expose a standalone quote-link button');
assert(quoteStyle.includes('window._currentQuoteData'), 'quote link generation should keep the current quote data for portal publishing');
assert(quoteStyle.includes("window._currentQuoteUrl = ''"), 'quote preparation should clear any standalone quote URL');
assert(builder.includes('quotePortalAssignModal'), 'quotes should open a portal assignment modal');
assert(builder.includes('openQuotePortalAssignment'), 'quotes should require choosing a portal before publishing');
assert(builder.includes('renderQuotePortalAssignmentList'), 'quote portal assignment modal should render existing portals');
assert(builder.includes('assignCurrentQuoteToPortal'), 'quote portal assignment modal should assign the quote to a selected portal');
assert(builder.includes('createPortalForCurrentQuote'), 'quote portal assignment modal should support creating a portal for the quote');
assert(builder.includes('resumeQuoteEmailAfterPortal'), 'quote email flow should resume after choosing a portal');
assert(builder.includes("emailKind: qData.type === 'change_order'"), 'quote and change-order emails should be identified as portal-only');

console.log('invoice portal links static test passed');
