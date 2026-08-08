const assert = require('node:assert');
const fs = require('node:fs');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');
const ui = fs.readFileSync('accounting-export-ui.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/team-account/index.ts', 'utf8');
const core = fs.readFileSync('supabase/functions/_shared/accounting-export.mjs', 'utf8');
const docs = fs.readFileSync('docs/accounting-transaction-csv.md', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

assert(!dashboard.includes('exportQuotesToCSV()'), 'Dashboard must not retain the dead generic Export CSV control');
assert(settings.includes('Export Clients (CSV)') && settings.includes('exportClientsToFile()'), 'existing client backup export must remain available');
assert(settings.includes('Export Items (CSV)') && settings.includes('exportMaterialsToFile()'), 'existing saved-item backup export must remain available');
assert(settings.includes('Export Accounting Transactions (CSV)'), 'Settings should clearly name the accounting export action');
assert(settings.includes('Accepted quotes') && settings.includes('Issued / unpaid invoices') && settings.includes('Partially paid invoices') && settings.includes('Paid invoices'), 'status filters should be explicit');
assert(settings.includes('Export Selected CSV') && settings.includes('Select all matching documents'), 'documents must require explicit selection');
assert(settings.includes('No accepted quotes or issued invoices match these dates and statuses.') || ui.includes('No accepted quotes or issued invoices match these dates and statuses.'), 'empty state should explain why there are no rows');
assert(ui.includes("No data was changed."), 'error states should confirm that export failures do not mutate data');
assert(settings.includes('does not claim Xero, QuickBooks, or other native-import compatibility'), 'UI must avoid native accounting compatibility claims');
assert(settings.includes('modal-fullscreen-sm-down') && settings.includes('@media (max-width: 575.98px)'), 'selection UI should have an explicit mobile layout');

assert(ui.includes('active.ownerUserId !== user.id'), 'browser action must fail closed for non-owners');
assert(edge.includes("if (action === 'accounting.export') return await accountingExport(req, accountId, body);"), 'team API must expose the read-only accounting action');
assert(edge.includes("selected.ownerUserId !== context.user.id"), 'team API must enforce owner identity, not only a UI permission');
assert(edge.includes(".eq('user_id', owner.ownerUserId)"), 'every export query must be scoped to the selected owner account');
assert(edge.includes(".select(accountingExportSelect)"), 'the accounting API should use a dedicated source projection');
assert(edge.includes(".neq('quote_number', '__ITEMS_BACKUP__')"), 'backup pseudo-documents must be excluded');
assert(core.includes('neutralizeCsvFormula') && core.includes("^[\\u0000-\\u0020]*[=+\\-@]"), 'CSV text must be neutralized against formula injection');

const exportHandler = edge.slice(edge.indexOf('async function accountingExport('), edge.indexOf('async function getQuote('));
assert(exportHandler && !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(exportHandler), 'accounting export handler must remain read-only');
assert(!core.includes('materialCost') && !core.includes('supplierUrl') && !core.includes('internalNotes'), 'CSV serializer must not map sensitive pricing or note fields');
assert(docs.includes('Document-level totals appear only on the first line') && docs.includes('formula') && docs.includes('owner'), 'CSV behavior and privacy boundary must be documented');
assert(/\[functions\.team-account\][\s\S]*?verify_jwt\s*=\s*true/.test(config), 'team-account export boundary must keep JWT verification enabled');

console.log('accounting transaction export static checks passed');
