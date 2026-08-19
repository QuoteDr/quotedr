const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20260819193000_account_document_numbering.sql');
const edge = read('supabase/functions/team-account/index.ts');
const dashboard = read('dashboard.html');
const builder = read('quote-builder.html');
const storage = read('quote-storage.js');
const supabase = read('supabase-v2.js');
const settings = read('settings.html');
const allowlist = read('config/public-artifact.mjs');

assert(migration.includes('add column if not exists client_number bigint'), 'clients need permanent account-scoped numbers');
assert(migration.includes('clients_user_client_number_uidx'), 'client numbers must be unique per owner');
assert(migration.includes('target_client.client_number is null'), 'the fallback client-number update must disambiguate the table column from the RPC output column');
assert(migration.includes('account_document_sequences') && migration.includes('on conflict (account_id, document_type, period_key) do update'), 'document sequences must be reserved atomically');
assert(migration.includes('account_document_numbers') && migration.includes('unique (account_id, normalized_number)'), 'reserved human numbers need an immutable collision registry');
assert(migration.includes('security invoker') && migration.includes('Account membership required'), 'the reservation RPC must retain an explicit membership boundary');
assert(migration.includes('revoke all on function public.quotedr_reserve_document_number') && migration.includes('to service_role'), 'only the trusted Edge boundary may execute reservations');
assert(!/update\s+public\.quotes\s+set\s+quote_number/i.test(migration), 'migration must never rewrite existing document numbers or links');

for (const action of ['numbering.get', 'numbering.save', 'numbering.client', 'numbering.reserve']) {
  assert(edge.includes(`action === '${action}'`), `team account API should expose ${action}`);
}
assert(edge.includes('ACCOUNT_PERMISSION.SETTINGS_MANAGE'), 'numbering format changes require settings permission');
assert(edge.includes('ACCOUNT_PERMISSION.QUOTES_CREATE'), 'document reservations require quote creation permission');
assert(edge.includes('ACCOUNT_PERMISSION.CLIENTS_MANAGE'), 'new client number assignment requires client management permission');

assert(dashboard.includes("QuoteDrDocumentNumbers.reserve('quote'"), 'new quotes must reserve their account number before opening');
assert(dashboard.includes("QuoteDrDocumentNumbers.reserve('revision'"), 'revisions must use the R sequence');
assert(builder.includes("QuoteDrDocumentNumbers.reserve('change_order'"), 'change orders must use the CO sequence');
assert(builder.includes('await qdEnsureInvoiceDocumentNumber(invoiceData)'), 'invoice preview must reserve its I number before becoming visible');
assert(supabase.includes("QuoteDrDocumentNumbers.reserve('invoice'"), 'invoice persistence must use the same reserved I number');
assert(storage.includes("QuoteDrDocumentNumbers.reserve('quote'"), 'Save as New must reserve a fresh Q number');
assert(!builder.includes('onclick="randomizeQuoteNumber()"') && !builder.includes('onclick="nextQuoteNumber()"'), 'legacy browser-only number generators must not compete with account sequences');
assert(settings.includes('Client &amp; Document Numbers') && settings.includes('Existing document numbers never change'), 'settings must explain the account format and legacy stability');
assert(allowlist.includes("'document-numbering.js'"), 'the numbering runtime must ship in the public artifact');

console.log('document numbering integration checks passed');
