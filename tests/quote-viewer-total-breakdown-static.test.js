const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="quoteSubtotalDisplay"'), 'quote viewer total card should render a subtotal amount');
assert(source.includes('id="quoteTaxLabel"'), 'quote viewer total card should render the configured tax label');
assert(source.includes('id="quoteTaxDisplay"'), 'quote viewer total card should render a tax amount');
assert(source.includes('<span>Subtotal</span>'), 'quote viewer should use the same subtotal label as the client invoice viewer');
assert(source.includes('function updateQuoteTotalBreakdown'), 'quote viewer should centralize subtotal/tax/total rendering');
assert(source.includes('updateQuoteTotalBreakdown(baseSubtotal, tax, total'), 'regular quote totals should show base subtotal separately from upgrades and tax');
assert(source.includes('resolveViewerLockedTotalSnapshot(_vTaxRate, _vTaxEnabled)'), 'accepted quotes should use the server-projected signed total snapshot after refresh');
assert(source.includes('quoteData.accepted_payable_total_cents'), 'accepted quote refresh must not fall back to stale pre-upgrade room totals');
assert(source.includes('upgradesTotal = subtotal - liveBaseSubtotal;'), 'accepted quotes should allocate the signed pre-tax residual to selected upgrades');
assert(source.includes('quoteData.taxLabel || _vqp.taxLabel || \'HST\''), 'quote viewer should prefer the quote tax label and fall back to settings/default HST');
assert(!source.includes('<span>Base quote</span>'), 'quote viewer bottom card should not show a single base quote row instead of subtotal and tax');
assert(!source.includes('<span>Selected options</span>'), 'quote viewer bottom card should not show a selected options count row');
assert(!source.includes("Selected upgrades${selectedChoices.length ? ' and options' : ''}"), 'quote viewer selected upgrades row should not append choice option count wording');

const subtotalIndex = source.indexOf('id="quoteSubtotalDisplay"');
const adjustmentIndex = source.indexOf('id="quoteAdjustmentTotalDisplay"');
const taxIndex = source.indexOf('id="quoteTaxDisplay"');
assert(subtotalIndex !== -1 && adjustmentIndex !== -1 && taxIndex !== -1, 'quote viewer should include subtotal, adjustment, and tax rows');
const upgradesIndex = source.indexOf('id="upgradesTotalDisplay"');
assert(subtotalIndex < upgradesIndex && upgradesIndex < adjustmentIndex && adjustmentIndex < taxIndex, 'quote viewer total card should display base subtotal, upgrades, adjustment, then tax');

assert(
  !source.includes("document.getElementById('quoteSubtotalDisplay').textContent = viewerMoney(originalTotal)"),
  'renderQuote must not put the saved tax-inclusive grand total into the subtotal field'
);

function sourceFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name + ' should exist');
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

const elements = {
  quoteSubtotalDisplay: {},
  quoteTaxDisplay: {},
  quoteTaxLabel: {},
  newGrandTotal: {},
  quotePaymentTotalDisplay: { style: {} },
  viewerTotalFinalLabel: {},
  viewerTotalFinalSubLabel: {}
};
const context = {
  window: { _quoteRow: null },
  document: { getElementById(id) { return elements[id] || null; } },
  viewerMoney(value) { return '$' + Number(value || 0).toFixed(2); },
  getViewerPaymentsReceived() { return { amount: 0, name: 'Deposit paid' }; },
  escapeHtml(value) { return String(value); },
  parseFloat,
  isFinite,
  Math
};
require('node:vm').createContext(context);
require('node:vm').runInContext(sourceFunction('updateQuoteTotalBreakdown'), context);
context.updateQuoteTotalBreakdown(3203.05, 499.31, 4340.15, 'HST', 0.13, 0, true);
assert.equal(elements.quoteSubtotalDisplay.textContent, '$3203.05', 'subtotal must be the pre-tax, pre-upgrade base amount');
assert.equal(elements.quoteTaxLabel.textContent, 'HST (13%)');
assert.equal(elements.quoteTaxDisplay.textContent, '$499.31');
assert.equal(elements.newGrandTotal.textContent, '$4340.15');

Object.assign(context, {
  applyViewerChoiceGroupToItem() {},
  applyViewerItemUpgradeGroups() {},
  syncViewerOptionalItemState() { return true; },
  viewerItemMarkedAmount(_room, _item, amount) { return amount; },
  qvLineTotal(item) { return item.active; },
  qvBaseLineTotal(item) { return item.base; }
});
require('node:vm').runInContext(sourceFunction('viewerRoomPayableComponents'), context);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.viewerRoomPayableComponents({ items: [
    { base: 1653.05, active: 2290.84, upgraded: true },
    { base: 1550, active: 1550 }
  ] }))),
  { baseCents: 320305, upgradeCents: 63779, totalCents: 384084 },
  'room totals must include the same selected upgrades separated in the quote summary'
);

Object.assign(context, {
  quoteData: {
    status: 'accepted',
    accepted_payable_total_cents: 434015,
    accepted_subtotal_cents: 384084,
    accepted_adjustment_cents: 0,
    accepted_tax_cents: 49931
  },
  _documentPaymentState: null,
  getViewerQuoteAdjustment() { return { type: 'addition', basis: 'amount', amount: 0, percent: 0 }; }
});
require('node:vm').runInContext(sourceFunction('quoteIsAccepted'), context);
require('node:vm').runInContext(sourceFunction('viewerLockedTaxableCents'), context);
require('node:vm').runInContext(sourceFunction('resolveViewerLockedTotalSnapshot'), context);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.resolveViewerLockedTotalSnapshot(0.13, true))),
  { subtotalCents: 384084, adjustmentCents: 0, taxCents: 49931, totalCents: 434015 }
);

context.quoteData = { status: 'accepted' };
context.window._quoteRow = { total: 4340.15 };
assert.deepEqual(
  JSON.parse(JSON.stringify(context.resolveViewerLockedTotalSnapshot(0.13, true))),
  { subtotalCents: 384084, adjustmentCents: 0, taxCents: 49931, totalCents: 434015 },
  'Dashboard Client View should use the accepted owner-row total when secure client snapshot fields are unavailable'
);

console.log('quote viewer total breakdown static test passed');
