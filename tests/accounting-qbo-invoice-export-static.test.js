const assert = require('node:assert');
const fs = require('node:fs');

const settings = fs.readFileSync('settings.html', 'utf8');
const ui = fs.readFileSync('qbo-invoice-export-ui.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/team-account/index.ts', 'utf8');
const core = fs.readFileSync('supabase/functions/_shared/accounting-qbo-invoice-export.mjs', 'utf8');

assert(settings.includes('Export QBO Invoice CSV'), 'Settings should expose the QBO-specific export beside the generic export');
assert(settings.includes('modal-fullscreen-sm-down') && settings.includes('@media (max-width: 575.98px)'), 'QBO export should include an explicit small-screen modal layout');
assert(settings.includes('QuoteDr will never create a QuickBooks transaction from this screen.'), 'UI must not imply direct QBO sync');
assert(settings.includes('data-bs-target="#qboInvoiceProfileModal"'), 'QBO profile settings should be reachable before review');
assert(ui.includes('account.ownerUserId !== user.id'), 'browser QBO export must fail closed for non-owners');
assert(ui.includes("'accounting.qbo_invoice_export'"), 'browser should call the dedicated QBO export action');
assert(edge.includes("if (action === 'accounting.qbo_invoice_profile')"), 'team API must expose the owner profile action');
assert(edge.includes("if (action === 'accounting.qbo_invoice_export')"), 'team API must expose the QBO preflight/export action');
assert(edge.includes('requireAccountingExportOwner(req, accountId)'), 'QBO handlers must use the server owner gate');
assert(edge.includes(".eq('user_id', ownerUserId)") && edge.includes(".neq('quote_number', '__ITEMS_BACKUP__')"), 'QBO source reads must stay scoped to the owner and exclude backup rows');
assert(core.includes('QBO_INVOICE_MAX_DOCUMENTS = 100') && core.includes('QBO_INVOICE_MAX_ROWS = 1000'), 'QBO batch limits must be explicit');
assert(core.includes('Only issued invoices can be exported') && core.includes('Partially paid invoices need a separate payment workflow'), 'rejected-state reasons must be explicit');
assert(core.includes('Customer has no exact saved QBO mapping') && core.includes('itemMappings[description]'), 'customer and item mappings must be exact, not loose-name matches');
assert(core.includes('taxMappings[document.totals.taxLabel]') && core.includes('taxExemptCode'), 'taxable and tax-exempt invoices need explicit QBO codes');
assert(!core.includes('materialCost') && !core.includes('supplierUrl') && !core.includes('internalNotes'), 'QBO serializer must not map sensitive fields');
assert(!ui.includes('qb-sync') && !edge.slice(edge.indexOf('async function qboInvoiceExport('), edge.indexOf('async function getQuote(')).includes('qb-sync'), 'QBO CSV export must not create a direct QBO transaction');

console.log('QBO invoice export static checks passed');
