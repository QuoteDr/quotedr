const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const edge = read('supabase/functions/client-document/index.ts');
const policy = read('supabase/functions/_shared/client-document-policy.mjs');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');
const decisions = read('client-document-decisions.js');
const supabase = read('supabase-v2.js');

assert(edge.includes('sanitizeClientDocumentRow'), 'secure document responses must use the dedicated client projection');
assert(edge.includes('applyClientDocumentDecision'), 'secure updates must merge decisions against the authoritative stored document');
assert(edge.includes('calculateClientDocumentTotals'), 'secure approvals must calculate totals from authoritative data');
assert(edge.includes('legacy_client_document_patch_rejected'), 'the server must explicitly reject legacy full-document patches');
assert(!edge.includes('function mergeSafeData'), 'the unsafe shallow document merge must be removed');
assert(!edge.includes('data: row.data || {}'), 'secure document responses must never return stored document data verbatim');
assert(edge.includes('publicContext: {') && edge.includes('data: { style: parentStyle }'), 'change-order context must expose only totals and projected parent style');
assert(edge.includes('card: {') && !edge.includes('status: connectionRow?.status'), 'payment availability must be provider-neutral and omit connection metadata');
assert(edge.includes('sanitizeClientBusinessProfile(value)') && edge.includes('sanitizeClientMediaUrl(logoRecord.logo)'), 'fallback branding must pass through the same credential-safe projection');

assert(quoteViewer.includes('client-document-decisions.js'), 'quote viewer must load the minimal decision collector');
assert(quoteViewer.includes('decision: clientDecision'), 'quote approval must submit the minimal decision payload');
assert(quoteViewer.includes('decision: QuoteDrClientDecisions.collect'), 'requested changes must submit the minimal decision payload');
assert(quoteViewer.includes("decision: {}"), 'change-order decline must submit an empty decision instead of quote data');
assert(!quoteViewer.includes('dataPatch:'), 'quote/change-order flows must not submit data patches');
assert(!quoteViewer.includes('_clientRooms:'), 'quote/change-order flows must never serialize client-loaded rooms');
assert(!quoteViewer.includes('window._quoteRow && window._quoteRow.user_id'), 'secure quote rendering must not depend on a returned contractor account id');

const secureLoadStart = quoteViewer.indexOf('// Secure flow: documents opened from the client portal include');
const ownerLoadStart = quoteViewer.indexOf('} else if (supabaseId) {', secureLoadStart);
assert(secureLoadStart !== -1 && ownerLoadStart > secureLoadStart, 'secure quote load branch should be extractable');
assert(!quoteViewer.slice(secureLoadStart, ownerLoadStart).includes('fetchContext('), 'secure change-order loads must not follow with direct full-row reads');

assert(invoiceViewer.includes('decision: {\n                        signature: {'), 'invoice signing must submit only signature evidence');
assert(!invoiceViewer.includes('dataPatch:'), 'invoice signing must not submit a data patch');
assert(!invoiceViewer.includes('var contractorId = row.user_id'), 'secure invoice rendering must not depend on a returned contractor account id');
assert(supabase.includes('var decision = payload && payload.decision || {};'), 'durable secure saves must classify the new decision payload');

for (const forbidden of ['materialCost', 'supplierUrl', 'markup', 'margin', 'profit', 'payment_intent', 'checkout_session', 'integration', 'token']) {
  assert(!decisions.includes(forbidden), `minimal browser decision collector must not read or serialize ${forbidden}`);
}
assert(decisions.includes('roomIndex') && decisions.includes('itemIndex'), 'decisions must target authoritative items by stable location');
assert(decisions.includes('selectedOptionIds') && decisions.includes('manualQuantities'), 'decisions must carry only required choice and quantity state');

for (const required of [
  'sanitizeUpgradeOption(source.upgrade, factor)',
  'sanitizeUpgradeGroups(source.upgradeGroups, factor)',
  'sanitizeChoiceGroup(source.choiceGroup, factor)',
  'sanitizeUpgradeOption(source._coOriginal, lineMarkupFactor(room, source._coOriginal))',
  'sanitizeRooms(source.original_rooms)'
]) {
  assert(policy.includes(required), `projection must flatten and redact nested pricing path: ${required}`);
}

console.log('secure client document round-trip static test passed');
