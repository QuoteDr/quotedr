const assert = require('node:assert');
const fs = require('node:fs');

const quote = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
const policy = fs.readFileSync('supabase/functions/_shared/client-document-policy.mjs', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');

for (const [label, source] of [['quote', quote], ['invoice', invoice]]) {
  assert(source.includes('typed-signature.js'), `${label} viewer should load the shared typed-signature utility`);
  assert(source.includes('Typed Signature'), `${label} viewer should label the typed signature presentation`);
  assert(!source.includes('id="signatureCanvas"'), `${label} viewer should not require a drawn-signature canvas`);
  assert(source.includes('Electronic-signature requirements can vary by jurisdiction'), `${label} viewer should avoid overstating legal enforceability`);
}

assert(quote.includes('QuoteDrTypedSignature.matchClientName'), 'quote viewer should validate the signer name against the associated client');
assert(quote.includes("signature_method: 'typed'"), 'quote viewer should send typed signature evidence');
assert(quote.includes('id="sigModalOverlay" role="dialog" aria-modal="true"'), 'quote signing overlay should expose accessible dialog semantics');
assert(quote.includes('termsAccepted: true'), 'quote viewer should submit explicit terms acknowledgement without copying the document terms');
assert(!/topLevel:\s*\{[^}]*accepted_at/.test(quote), 'quote viewer should not author the authoritative accepted timestamp');

assert(invoice.includes('id="invoiceSignatureModal"'), 'invoice viewer should provide an accessible signing modal');
assert(invoice.includes('QuoteDrTypedSignature.matchClientName'), 'invoice viewer should validate the signer name against the associated client');
assert(invoice.includes("'record_signature'"), 'invoice viewer should use the dedicated secure invoice-signature action');
assert(invoice.includes('renderInvoiceSignatureState();'), 'invoice viewer should restore the saved signature state after refresh');
assert(invoice.includes('invoice_acknowledged'), 'invoice viewer should preserve explicit invoice acknowledgement evidence');

const recordStart = edge.indexOf('} else if (action === "record_signature")');
const recordEnd = edge.indexOf('} else if (action === "decline_change_order")', recordStart);
assert(recordStart >= 0 && recordEnd > recordStart, 'client-document should implement a dedicated invoice signature action');
const recordBlock = edge.slice(recordStart, recordEnd);
assert(recordBlock.includes('validateTypedSigner(target, signerName)'), 'server should independently validate the typed signer');
assert(recordBlock.includes('applyClientDocumentDecision(existingData, clientDecisionBody(body)'), 'server should validate the minimal invoice decision');
assert(policy.includes("if (value.termsAccepted !== true)"), 'decision policy should require terms acknowledgement');
assert(edge.includes('data.signed_at = now'), 'server should author the signed timestamp');
assert(edge.includes('data.terms_accepted_at = now'), 'server should author the terms acknowledgement timestamp');
assert(recordBlock.includes('terms_accepted_snapshot'), 'server should snapshot the document terms');
assert(recordBlock.includes('alreadySigned'), 'server should preserve an existing invoice signature record');
assert(!recordBlock.includes('update.status'), 'invoice signing must not change sent, due, or paid status');

const clientUpdateStart = edge.indexOf('} else if (action === "client_update")');
const clientUpdateEnd = edge.indexOf('} else if (action === "record_signature")', clientUpdateStart);
const clientUpdateBlock = edge.slice(clientUpdateStart, clientUpdateEnd);
assert(clientUpdateBlock.includes('validateTypedSigner(target, signerName)'), 'server should independently validate quote typed signatures');
assert(clientUpdateBlock.includes('applyTypedSignature(merged, signature, signerName, now, false)'), 'server should author quote signature evidence and timestamps');
assert(supabase.includes("updateAction === 'record_signature'"), 'secure update helper should track invoice signature saves as durable business updates');
const activityStart = edge.indexOf('} else if (action === "record_signature")', recordEnd);
const activityEnd = edge.indexOf('} else if (action === "decline_change_order")', activityStart);
const activityBlock = edge.slice(activityStart, activityEnd);
assert(activityBlock.includes('recordClientActivity(supabase, updatedRow, "accepted"'), 'invoice signing should use the existing accepted activity event type');
assert(activityBlock.includes('signature_action: "invoice_acknowledgement"'), 'invoice signing activity should retain signature-specific audit context');

console.log('typed signature viewer static tests passed');
