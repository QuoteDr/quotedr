const assert = require('node:assert');
const fs = require('node:fs');
const rules = require('../card-payment-rules.js');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const thresholdSettings = {
  stripe_enabled: true,
  card_payment_rule: 'threshold',
  card_payment_threshold_cents: 500000,
  card_payment_prompt_enabled: true,
  card_payment_buffer_pct: 2.9
};

assert.strictEqual(rules.qualifies(thresholdSettings, 499999), false, 'a smaller job must stay below the card-payment threshold');
assert.strictEqual(rules.qualifies(thresholdSettings, 500000), true, 'a job meeting the threshold must qualify');

const belowThreshold = rules.buildDecision(thresholdSettings, 125000, 'auto');
assert.strictEqual(belowThreshold.enabled, false, 'threshold auto mode must not enable card payment on a smaller job');
assert.strictEqual(belowThreshold.prompt, false, 'a smaller job must not trigger the qualifying review');

const qualifying = rules.buildDecision(thresholdSettings, 700000, 'auto');
assert.strictEqual(qualifying.enabled, true, 'a qualifying document should default to card payment');
assert.strictEqual(qualifying.prompt, true, 'a qualifying document should prompt when the account setting is on');
assert.strictEqual(qualifying.bufferPercent, 2.9, 'the configured buffer should be suggested without being applied');

const manualOffer = rules.buildDecision(thresholdSettings, 125000, 'offer');
assert.strictEqual(manualOffer.enabled, true, 'a contractor must be able to manually offer card payment on a smaller job');
assert.strictEqual(manualOffer.prompt, false, 'a manual document choice is already reviewed');

const manualDisable = rules.buildDecision(thresholdSettings, 700000, 'disable');
assert.strictEqual(manualDisable.enabled, false, 'a contractor must be able to skip card payment on a qualifying job');

assert.strictEqual(
  rules.documentEnabled({ stripe_enabled: true }, {}),
  true,
  'legacy documents without a decision must preserve the prior account-wide behavior'
);
assert.strictEqual(
  rules.documentEnabled(thresholdSettings, { card_payment: { version: 1, enabled: false, mode: 'disable' } }),
  false,
  'a saved document opt-out must override the account qualification'
);
assert.strictEqual(
  rules.documentEnabled({ ...thresholdSettings, stripe_enabled: false }, { card_payment: { version: 1, enabled: true, mode: 'offer' } }),
  false,
  'turning Stripe off at the account must disable card payment globally'
);

const publicSnapshot = rules.snapshot(qualifying);
assert.deepStrictEqual(
  Object.keys(publicSnapshot).sort(),
  ['enabled', 'mode', 'source', 'version'],
  'the document snapshot must not expose threshold or buffer details to the client'
);

const publicSettings = rules.publicPaymentSettings(thresholdSettings);
assert.strictEqual(publicSettings.stripe_enabled, true, 'client payment settings must retain the card-payment availability fallback');
assert.strictEqual(publicSettings.card_payment_rule, undefined, 'the account rule must stay in authenticated settings');
assert.strictEqual(publicSettings.card_payment_threshold_cents, undefined, 'the account threshold must stay in authenticated settings');
assert.strictEqual(publicSettings.card_payment_prompt_enabled, undefined, 'the contractor prompt preference must stay private');
assert.strictEqual(publicSettings.card_payment_buffer_pct, undefined, 'the contractor pricing buffer must stay private');

const settings = read('settings.html');
const builder = read('quote-builder.html');
const style = read('quote-style.js');
const storage = read('quote-storage.js');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');
const clientDocument = read('supabase/functions/client-document/index.ts');
const documentPayment = read('supabase/functions/document-payment/index.ts');

assert(
  settings.includes('id="cardPaymentRuleAlways"') &&
  settings.includes('id="cardPaymentRuleThreshold"') &&
  settings.includes('id="cardPaymentThresholdAmount"') &&
  settings.includes('id="cardPaymentPromptEnabled"') &&
  settings.includes('id="cardPaymentBufferPct"'),
  'Payments settings must expose every Card Payment Rules control'
);
assert(
  settings.includes('card_payment_rule: cardPaymentRule') &&
  settings.includes('card_payment_threshold_cents:') &&
  settings.includes('card_payment_prompt_enabled:') &&
  settings.includes('card_payment_buffer_pct:'),
  'Card Payment Rules must persist in the existing payment_settings value'
);
assert(
  settings.includes('Smaller jobs stay off unless you manually offer card payment') &&
  settings.includes('never applies it automatically'),
  'settings copy must explain small-job and non-silent buffer behavior'
);

assert(
  builder.includes('id="quoteCardPaymentMode"') &&
  builder.includes('id="invoiceCardPaymentMode"') &&
  builder.includes("reviewDocumentCardPaymentRules('invoice'"),
  'quote and invoice workflows must offer per-document choices'
);
assert(
  builder.includes('id="cardPaymentReviewEnabled"') &&
  builder.includes('id="cardPaymentReviewBuffer"') &&
  builder.includes('Review Updated Total') &&
  builder.includes('Review quote first'),
  'qualifying review must separate card enablement from a reviewable pricing buffer'
);
assert(
  /id="cardPaymentReviewBuffer"[^>]*>/.test(builder) &&
  !/id="cardPaymentReviewBuffer"[^>]*checked/.test(builder),
  'the buffer suggestion must start unapplied'
);
assert(
  builder.includes('suggestedPercent: decision.bufferPercent') &&
  builder.includes("title: 'Review Pricing Buffer'") &&
  builder.includes('async function applyGlobalMarkup()'),
  'the buffer must reuse the existing Markup All flow'
);
assert(
  style.includes("reviewDocumentCardPaymentRules('quote'") &&
  style.includes('quoteData.card_payment = cardPaymentReview.cardPayment') &&
  style.includes('quoteData.paymentSettings = clientSafePaymentSettings(quoteData.paymentSettings)') &&
  builder.includes('invoiceData.card_payment = cardPaymentReview.cardPayment') &&
  builder.includes('invoiceData.paymentSettings = clientSafePaymentSettings(invoiceData.paymentSettings)') &&
  storage.includes('card_payment: loadedData.card_payment'),
  'both shared document types must persist their own card-payment decision without account-only rule details'
);

for (const source of [clientDocument, documentPayment]) {
  assert(source.includes('cardPaymentEnabledForDocument') && source.includes('data.card_payment'), 'secure payment functions must enforce the document decision');
}
assert(clientDocument.includes('loadPaymentOptions(target)'), 'public payment options must be resolved for the active document');
assert(documentPayment.includes('!cardPaymentEnabledForDocument(row, settings)'), 'checkout creation must reject a document-level card opt-out');

assert(
  quoteViewer.includes('QuoteDrCardPaymentRules.documentEnabled(legacy, quoteData)') &&
  invoiceViewer.includes('QuoteDrCardPaymentRules.documentEnabled(settings, invoiceData)'),
  'local viewer fallbacks must honor the same document decision'
);
assert(
  quoteViewer.includes('The amount shown is the deposit due.') &&
  invoiceViewer.includes('The amount shown is your invoice balance.'),
  'client card-payment copy must identify the amount without adding a surcharge line'
);

console.log('card payment rules tests passed');
