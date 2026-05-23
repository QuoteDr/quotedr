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

assert(builder.includes('copyInvoiceLink'), 'invoice modal should expose a copyInvoiceLink action');
assert(builder.includes('copyTextToClipboard'), 'invoice copy action should have a clipboard fallback');
assert(builder.includes('Copy Invoice Link'), 'invoice modal should show a Copy Invoice Link button');
assert(builder.includes('publishCurrentInvoiceToPortal'), 'invoice modal should expose an Add to Portal action');
assert(builder.includes('Add to Portal'), 'invoice modal should show an Add to Portal button');
assert(builder.includes('In Portal'), 'invoice modal should show an In Portal state');
assert(builder.includes('invoicePortalAssignModal'), 'Add to Portal should open a portal assignment modal');
assert(builder.includes('openInvoicePortalAssignment'), 'Add to Portal should require choosing a portal before publishing');
assert(builder.includes('renderInvoicePortalAssignmentList'), 'portal assignment modal should render existing portals');
assert(builder.includes('assignCurrentInvoiceToPortal'), 'portal assignment modal should assign the invoice to a selected portal');
assert(builder.includes('createPortalForCurrentInvoice'), 'portal assignment modal should support creating a portal for the invoice');
assert(builder.includes('Recommended'), 'portal assignment modal should mark likely client matches as recommended');
assert(builder.includes('resumeInvoiceEmailAfterPortal'), 'email flow should resume after a checked portal option is assigned');
assert(builder.includes('invoiceAddToPortalEmail'), 'invoice email modal should include an add-to-portal checkbox');
assert(builder.includes('Add to client portal and include portal link in email'), 'invoice email modal should explain the portal email option');
assert(builder.includes('ensureInvoiceShareableUrl'), 'copy/email/portal flows should share one secure invoice URL wait helper');
assert(builder.includes('ensureInvoicePortalUrl'), 'email flow should generate a portal URL when requested');
assert(builder.includes('setInvoiceUrlFromSecureShare'), 'portal link creation should refresh the invoice URL token too');
assert(builder.includes('portal_id'), 'invoice portal assignment should store a durable portal id');
assert(builder.includes('portal_name'), 'invoice portal assignment should store a portal name');
assert(builder.includes('portal_pin'), 'invoice portal assignment should preserve or create a portal PIN');
assert(!builder.includes('await ensureInvoicePortalUrl(resultEl);\n                if (resultEl) resultEl.innerHTML = \'<span class="text-success"><i class="fas fa-check-circle me-1"></i>Invoice added to the client portal.</span>\';'), 'Add to Portal button should not silently publish without a portal choice');
assert(builder.includes('portalUrl:'), 'invoice email request should send an optional portalUrl');
assert(builder.includes('invoiceUrl = window._currentInvoiceUrl || invoiceUrl'), 'invoice email should use the refreshed invoice URL after creating a portal link');

assert(supabase.includes("documentType: 'invoice'"), 'saved invoice rows should have explicit invoice documentType');
assert(supabase.includes('portal_visible: invoiceData.portal_visible === true'), 'saved invoice rows should preserve portal visibility');
assert(supabase.includes('portal_client_name'), 'saved invoice rows should store portal client name');
assert(supabase.includes('portal_client_email'), 'saved invoice rows should store portal client email');

assert(emailFunction.includes('portalUrl'), 'email function should accept portalUrl');
assert(emailFunction.includes('documentLabel = isInvoice ? "invoice" : "quote"'), 'email function should label the portal note as invoice or quote');
assert(emailFunction.includes('in your client portal.'), 'email function should render a portal companion note');

assert(quoteStyle.includes('quoteAddToPortalEmail'), 'quote email modal should include an add-to-portal checkbox');
assert(quoteStyle.includes('publishCurrentQuoteToPortal'), 'quote modal should expose an Add to Portal action');
assert(quoteStyle.includes('addQuoteToPortalBtn'), 'quote modal should show a quote portal button');
assert(quoteStyle.includes('window._currentQuoteData'), 'quote link generation should keep the current quote data for portal publishing');
assert(quoteStyle.includes('window._currentQuoteUrl'), 'quote link generation should keep the current quote URL for email/portal publishing');
assert(builder.includes('quotePortalAssignModal'), 'quotes should open a portal assignment modal');
assert(builder.includes('openQuotePortalAssignment'), 'quotes should require choosing a portal before publishing');
assert(builder.includes('renderQuotePortalAssignmentList'), 'quote portal assignment modal should render existing portals');
assert(builder.includes('assignCurrentQuoteToPortal'), 'quote portal assignment modal should assign the quote to a selected portal');
assert(builder.includes('createPortalForCurrentQuote'), 'quote portal assignment modal should support creating a portal for the quote');
assert(builder.includes('resumeQuoteEmailAfterPortal'), 'quote email flow should resume after choosing a portal');
assert(builder.includes('setQuoteUrlFromSecureShare'), 'quote portal link creation should refresh the quote URL token too');

console.log('invoice portal links static test passed');
