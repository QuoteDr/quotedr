const assert = require('node:assert');
const fs = require('node:fs');
const test = require('node:test');
const payable = require('../quote-payable-total.js');

test('screenshot-class 50% deposit uses the final selected-option payable total', () => {
  const result = payable.calculate({
    // $833.13 base + $432.14 selected upgrades = the displayed $1,265.27 items subtotal.
    subtotal: 1265.27,
    adjustment: 0,
    taxRate: 0.13,
    taxEnabled: true,
    terms: { deposit_required: true, kind: 'percent', percent: 50 }
  });
  assert.equal(result.subtotalCents, 126527);
  assert.equal(result.taxCents, 16449);
  assert.equal(result.payableTotalCents, 142976);
  assert.equal(result.requiredDepositCents, 71488);
  assert.equal(result.remainingAfterDepositCents, 71488);
  assert.equal(result.requiredDepositCents + result.remainingAfterDepositCents, result.payableTotalCents);
  assert.notEqual(result.requiredDepositCents, 115095, 'deposit must not come from an unseen stale $2,301.90 total');
});

test('selected add-ons change the same total used by the payment request', () => {
  const terms = { deposit_required: true, kind: 'percent', percent: 50 };
  const withoutAddon = payable.calculate({ subtotal: 1000, taxRate: 0.13, terms });
  const withAddon = payable.calculate({ subtotal: 1200, taxRate: 0.13, terms });
  assert.equal(withoutAddon.payableTotalCents, 113000);
  assert.equal(withoutAddon.depositDueCents, 56500);
  assert.equal(withAddon.payableTotalCents, 135600);
  assert.equal(withAddon.depositDueCents, 67800);
  assert.equal(withAddon.requiredDepositCents + withAddon.remainingAfterDepositCents, withAddon.payableTotalCents);
});

test('tax, tax-exempt, percentage, fixed, paid, and odd-cent contracts are deterministic', () => {
  const taxExempt = payable.calculate({ subtotal: 100.01, taxEnabled: false, terms: { deposit_required: true, kind: 'percent', percent: 50 } });
  assert.equal(taxExempt.taxCents, 0);
  assert.equal(taxExempt.requiredDepositCents, 5001, 'odd cent is allocated to the rounded deposit');
  assert.equal(taxExempt.remainingAfterDepositCents, 5000, 'remaining balance receives the residual cent');

  for (const [percent, expected] of [[30, 3000], [50, 5001], [100, 10001]]) {
    const result = payable.calculate({ subtotal: 100.01, taxEnabled: false, terms: { deposit_required: true, kind: 'percent', percent } });
    assert.equal(result.requiredDepositCents, expected);
    assert.equal(result.requiredDepositCents + result.remainingAfterDepositCents, 10001);
  }

  const fixed = payable.calculate({ subtotal: 100.01, taxEnabled: false, terms: { deposit_required: true, kind: 'fixed', fixed_cents: 4000 } });
  assert.equal(fixed.requiredDepositCents, 4000);
  assert.equal(fixed.remainingAfterDepositCents, 6001);

  const paid = payable.calculate({ subtotal: 100.01, taxEnabled: false, paid: 50.01, terms: { deposit_required: true, kind: 'percent', percent: 50 } });
  assert.equal(paid.balanceDueCents, 5000);
  assert.equal(paid.depositDueCents, 0, 'an already-paid deposit must not be requested again');
});

test('builder, viewer, invoice, save, and cross-quote paths use the canonical contract', () => {
  const builder = fs.readFileSync('quote-builder.html', 'utf8');
  const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
  const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');
  const storage = fs.readFileSync('quote-storage.js', 'utf8');
  const cloud = fs.readFileSync('supabase-v2.js', 'utf8');

  for (const source of [builder, viewer, invoice]) {
    assert(source.includes('quote-payable-total.js?v=2026081801'));
    assert(source.includes('QuoteDrPayableTotal.calculate({'));
  }
  assert(viewer.includes('Items subtotal (includes selections)'));
  assert(viewer.includes('Selected upgrades (included above)'));
  assert(viewer.includes('var liveTotalCents = Math.max(0, Math.round(Number(_quoteTotalCents'));
  assert(!viewer.includes('quoteData.accepted_total_cents || quoteData.quoted_total_cents || _quoteTotal'));
  assert(storage.includes('quoted_total_cents: payableTotalCents'));
  assert(storage.includes("window._loadedQuoteData = {};"));
  assert(storage.includes("window._currentQuoteData = {};"));
  assert(storage.includes("localStorage.removeItem('ald_active_quote_id')"));
  assert(cloud.includes("['accepted', 'approved', 'invoiced', 'paid'].includes"));
});
