const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

const read = (file) => fs.readFileSync(file, 'utf8');
const builder = read('quote-builder.html');
const storage = read('quote-storage.js');
const dashboard = read('dashboard.html');
const viewer = read('interactive-quote-viewer.html');
const clientDocument = read('supabase/functions/client-document/index.ts');
const clientPolicy = read('supabase/functions/_shared/client-document-policy.mjs');
const payment = read('supabase/functions/document-payment/index.ts');
const migration = read('supabase/migrations/20260828120000_change_order_continue_payments.sql');

function changeOrderProjectSummary({ projectBeforeCents, adjustmentCents, taxCents, projectPaidCents, continueRequiredCents, currentChangePaidCents }) {
  const updatedProjectTotalCents = projectBeforeCents + adjustmentCents + taxCents;
  return {
    updatedProjectTotalCents,
    outstandingProjectCents: Math.max(0, updatedProjectTotalCents - projectPaidCents),
    continueWorkDueCents: Math.max(0, continueRequiredCents - currentChangePaidCents),
  };
}

test('change orders persist an explicit payment-to-continue decision before portal addition', () => {
  assert(builder.includes('Do you require a payment before continuing work on this change order?'));
  assert(builder.includes('changeOrderContinuePayment: config'));
  assert(storage.includes('changeOrderContinuePayment: window._changeOrderContinuePayment'));
  assert(clientPolicy.includes('sanitizeChangeOrderContinuePayment'));
  assert(dashboard.includes('configureDashboardChangeOrderContinuePayment'));
  assert(dashboard.includes("secondaryText: 'No payment required'"));
});

test('change order payments are not modeled as deposits', () => {
  assert(clientDocument.includes('if (documentTypeLabel(row) === "change order")'));
  assert(clientDocument.includes('deposit_required: false'));
  assert(viewer.includes('if (viewerIsChangeOrder())'));
  assert(viewer.includes("return { deposit_required: false, kind: 'none', percent: 0, fixed_cents: 0 }"));
  assert(payment.includes('if (isChangeOrder(row)) return "change_order_continue"'));
  assert(payment.includes('change_order_deposit_not_applicable'));
  assert(migration.includes("'change_order_continue'"));
});

test('client change order totals use one project-payment contract', () => {
  for (const label of [
    'Current adjustments',
    'Updated job total',
    'Amount paid already',
    'Outstanding total',
    'Amount due to continue work',
  ]) assert(viewer.includes(label), `missing client label: ${label}`);
  assert(viewer.includes('_documentPaymentState.projectPaidCents'));
  assert(viewer.includes('_documentPaymentState.projectBalanceDueCents'));
  assert(viewer.includes('_documentPaymentState.continueWorkDueCents'));
});

test('payments reduce project outstanding without changing the change-order adjustment', () => {
  const result = changeOrderProjectSummary({
    projectBeforeCents: 595024,
    adjustmentCents: 89500,
    taxCents: 11635,
    projectPaidCents: 297512,
    continueRequiredCents: 50000,
    currentChangePaidCents: 20000,
  });
  assert.deepStrictEqual(result, {
    updatedProjectTotalCents: 696159,
    outstandingProjectCents: 398647,
    continueWorkDueCents: 30000,
  });
});

test('Stripe and manual reports use the dedicated change-order payment type', () => {
  assert(viewer.includes("var paymentType = viewerIsChangeOrder() ? 'change_order_continue' : 'deposit'"));
  assert(payment.includes('paymentUsesQuoteId(type)'));
  assert(payment.includes('Payment to continue work -'));
  assert(payment.includes('Client-reported payment to continue work'));
  assert(dashboard.includes("result.payment.paymentMode !== 'change_order_continue'"));
});
