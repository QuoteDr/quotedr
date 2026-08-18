const assert = require('node:assert');
const fs = require('node:fs');
const test = require('node:test');

async function accounting() {
  return import('../supabase/functions/_shared/document-payment-accounting.mjs');
}

function affectedSignedQuote() {
  return {
    id: 'quote-upgraded',
    total: 4340.15,
    data: {
      accepted_total_cents: 361945,
      deposit_due_cents: 180973,
      grandTotal: 4340.15,
      paymentsReceived: { name: 'Deposit paid', amount: 2170.08 },
      payments: [{ payment_record_id: 'manual-1', amount_cents: 217008 }]
    }
  };
}

test('signed row total overrides a stale pre-upgrade accepted snapshot', async () => {
  const { canonicalDocumentTotalCents, calculateRecordedPaymentState } = await accounting();
  const quote = affectedSignedQuote();
  assert.equal(canonicalDocumentTotalCents(quote), 434015);

  const pending = calculateRecordedPaymentState(quote, [{ id: 'manual-1', status: 'client_reported', amount_cents: 217008 }], 217008);
  assert.equal(pending.totalCents, 434015);
  assert.equal(pending.paidCents, 0, 'a client report is not money received');
  assert.equal(pending.depositDueCents, 217008);
  assert.equal(pending.balanceDueCents, 434015);
});

test('owner-confirmed actual amount produces the exact client-visible balance', async () => {
  const { calculateRecordedPaymentState } = await accounting();
  const corrected = calculateRecordedPaymentState(
    affectedSignedQuote(),
    [{ id: 'manual-1', status: 'confirmed', amount_cents: 180973 }],
    217008
  );
  assert.equal(corrected.totalCents, 434015);
  assert.equal(corrected.paidCents, 180973);
  assert.equal(corrected.depositDueCents, 36035);
  assert.equal(corrected.balanceDueCents, 253042);
  assert.equal(corrected.paidCents + corrected.balanceDueCents, corrected.totalCents);
  assert.equal(corrected.depositSecured, false, 'a short payment must not mark the required deposit secured');

  const completeDeposit = calculateRecordedPaymentState(
    affectedSignedQuote(),
    [{ id: 'manual-1', status: 'confirmed', amount_cents: 217008 }],
    217008
  );
  assert.equal(completeDeposit.balanceDueCents, 217007, 'the residual cent stays in the remaining project balance');
  assert.equal(completeDeposit.depositSecured, true);
});

test('payment state does not leak between quotes in the same session', async () => {
  const { calculateRecordedPaymentState } = await accounting();
  const first = calculateRecordedPaymentState(affectedSignedQuote(), [{ id: 'manual-1', status: 'confirmed', amount_cents: 180973 }], 217008);
  const second = calculateRecordedPaymentState({ id: 'quote-2', total: 1130, data: {} }, [], 56500);
  assert.equal(first.paidCents, 180973);
  assert.equal(second.totalCents, 113000);
  assert.equal(second.paidCents, 0);
  assert.equal(second.depositDueCents, 56500);
  assert.equal(second.balanceDueCents, 113000);
});

test('dashboard, payment API, and client viewer share the correction contract', () => {
  const dashboard = fs.readFileSync('dashboard.html', 'utf8');
  const paymentApi = fs.readFileSync('supabase/functions/document-payment/index.ts', 'utf8');
  const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

  assert(dashboard.includes('Enter the amount that actually arrived'));
  assert(dashboard.includes('Enter amount received'));
  assert(dashboard.includes("title: isCorrection ? 'Correct Payment Amount' : 'Enter Amount Received'"));
  assert(dashboard.includes("okText: isCorrection ? 'Update amount' : 'Save amount received'"));
  assert(!dashboard.includes('Confirm received amount'));
  assert(dashboard.includes('confirmedAmountCents'));
  assert(dashboard.includes('Edit received amount'));
  assert(dashboard.includes('Requested amount:'));
  assert(paymentApi.includes('client_reported_amount_cents'));
  assert(paymentApi.includes('owner_confirmed_amount_cents'));
  assert(paymentApi.includes('confirmed_amount_exceeds_balance'));
  assert(paymentApi.includes('canonicalDocumentTotalCents'));
  assert(viewer.includes("quoteData.paymentsReceived = {"));
  assert(viewer.includes("if (_documentPaymentState) return !!(_documentPaymentState.depositSecured || _documentPaymentState.fullPaid)"));
});
