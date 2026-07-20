const assert = require('node:assert');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const settings = read('settings.html');
const onboarding = read('onboarding.html');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');
const dashboard = read('dashboard.html');
const style = read('quote-style.js');
const builder = read('quote-builder.html');
const storage = read('quote-storage.js');

assert(settings.includes('id="stripeConnectionStatus"') && settings.includes('startStripeConnectOnboarding') && settings.includes('openStripeDashboard') && settings.includes('disableStripeConnection'), 'Settings must expose the complete Stripe connection lifecycle');
assert(settings.includes('QuoteDr does not add an application fee') && settings.includes('Manual payment methods and deposit requests still work without it'), 'Settings must explain fees and keep manual payments independent of Stripe');
assert(settings.includes('id="depositDefaultKind"') && settings.includes('id="depositDefaultFixedAmount"'), 'Settings must support percentage and fixed default deposits');
assert(onboarding.includes('Payment &amp; Deposit Setup') && onboarding.includes('startOnboardingStripeSetup'), 'onboarding must explain deposit setup and offer optional Stripe connection');

assert(quoteViewer.includes('reportManualDeposit') && quoteViewer.includes('Payment reported.') && quoteViewer.includes('renderDepositPaymentSection'), 'accepted quotes must show reportable manual deposit methods and a pending state');
assert(invoiceViewer.includes('reportManualInvoicePayment') && invoiceViewer.includes('copyInvoicePaymentText'), 'invoice links must expose selected direct payment methods and reporting');
assert(dashboard.includes('refreshDashboardManualPaymentReports') && dashboard.includes('decideDashboardManualPayment') && dashboard.includes('Confirm received'), 'dashboard cards must let contractors confirm client-reported manual payments');

assert(builder.includes('id="quoteDepositMode"') && builder.includes('id="quoteDepositKind"') && builder.includes('id="quoteDepositFixedAmount"'), 'each quote must support default, custom, or no-deposit terms');
assert(style.includes('buildQuotePaymentTerms') && style.includes('quoteDepositDueCents'), 'quote sharing must create a versioned payment-term snapshot');
assert(storage.includes('payment_terms') && storage.includes('deposit_due_cents'), 'quote storage must preserve deposit terms and the calculated due amount');

console.log('payment experience static test passed');
