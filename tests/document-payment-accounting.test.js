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
  const acceptedShortfallQuote = affectedSignedQuote();
  acceptedShortfallQuote.data.deposit_shortfall_accepted = true;
  const first = calculateRecordedPaymentState(acceptedShortfallQuote, [{ id: 'manual-1', status: 'confirmed', amount_cents: 180973 }], 217008);
  const second = calculateRecordedPaymentState({ id: 'quote-2', total: 1130, data: {} }, [], 56500);
  assert.equal(first.paidCents, 180973);
  assert.equal(first.depositSecured, true);
  assert.equal(first.depositShortfallAccepted, true);
  assert.equal(second.totalCents, 113000);
  assert.equal(second.paidCents, 0);
  assert.equal(second.depositSecured, false);
  assert.equal(second.depositShortfallAccepted, false);
  assert.equal(second.depositDueCents, 56500);
  assert.equal(second.balanceDueCents, 113000);
});

test('contractor may accept a short deposit without forgiving the signed project balance', async () => {
  const { calculateRecordedPaymentState } = await accounting();
  const quote = {
    id: 'quote-partial-deposit',
    total: 6305.65,
    data: { deposit_shortfall_accepted: true }
  };
  const state = calculateRecordedPaymentState(
    quote,
    [{ id: 'manual-2000', status: 'confirmed', amount_cents: 200000 }],
    315283
  );
  assert.equal(state.totalCents, 630565);
  assert.equal(state.requiredDepositCents, 315283);
  assert.equal(state.paidCents, 200000);
  assert.equal(state.acceptedDepositCents, 200000);
  assert.equal(state.depositShortfallAccepted, true);
  assert.equal(state.depositSecured, true);
  assert.equal(state.depositDueCents, 0);
  assert.equal(state.balanceDueCents, 430565, 'acceptance changes scheduling status, not the amount still owed on the project');
  assert.equal(state.paidCents + state.balanceDueCents, state.totalCents);

  quote.data.deposit_shortfall_accepted = false;
  const outstanding = calculateRecordedPaymentState(quote, [{ id: 'manual-2000', status: 'confirmed', amount_cents: 200000 }], 315283);
  assert.equal(outstanding.depositSecured, false);
  assert.equal(outstanding.depositDueCents, 115283);
  assert.equal(outstanding.balanceDueCents, 430565);

  quote.data.deposit_shortfall_accepted = true;
  const laterCompleted = calculateRecordedPaymentState(quote, [{ id: 'manual-full', status: 'confirmed', amount_cents: 315283 }], 315283);
  assert.equal(laterCompleted.depositShortfallAccepted, false, 'a later full deposit must supersede the earlier exception');
  assert.equal(laterCompleted.depositSecured, true);
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
  assert(!viewer.includes("['partially_paid', 'paid'].includes(String(quoteData.paymentStatus"), 'a partial payment must never imply that the deposit is satisfied');
  assert(dashboard.includes("action: 'resolve_deposit_shortfall'"));
  assert(dashboard.includes('Review deposit decision'));
  assert(dashboard.includes('still needed to satisfy deposit'));
  assert(paymentApi.includes('deposit_shortfall_accepted'));
  assert(paymentApi.includes('clearDepositShortfallAcceptance: true'), 'editing the received amount must clear a stale shortfall decision');
  assert(viewer.includes('Deposit Balance Remaining'));
  assert(viewer.includes('Lower deposit accepted.'));
  assert(viewer.includes('Your remaining project balance is unchanged.'));
});
