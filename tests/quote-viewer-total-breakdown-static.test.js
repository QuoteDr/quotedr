const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="quoteSubtotalDisplay"'), 'quote viewer total card should render a subtotal amount');
assert(source.includes('id="quoteTaxLabel"'), 'quote viewer total card should render the configured tax label');
assert(source.includes('id="quoteTaxDisplay"'), 'quote viewer total card should render a tax amount');
assert(source.includes('<span>Subtotal</span>'), 'quote viewer should use the same subtotal label as the client invoice viewer');
assert(source.includes('function updateQuoteTotalBreakdown'), 'quote viewer should centralize subtotal/tax/total rendering');
assert(source.includes('updateQuoteTotalBreakdown(subtotal, tax, total'), 'regular quote totals should update subtotal, tax, and total together');
assert(source.includes('quoteData.taxLabel || _vqp.taxLabel || \'HST\''), 'quote viewer should prefer the quote tax label and fall back to settings/default HST');
assert(!source.includes('<span>Base quote</span>'), 'quote viewer bottom card should not show a single base quote row instead of subtotal and tax');
assert(!source.includes('<span>Selected options</span>'), 'quote viewer bottom card should not show a selected options count row');
assert(!source.includes("Selected upgrades${selectedChoices.length ? ' and options' : ''}"), 'quote viewer selected upgrades row should not append choice option count wording');

const subtotalIndex = source.indexOf('id="quoteSubtotalDisplay"');
const adjustmentIndex = source.indexOf('id="quoteAdjustmentTotalDisplay"');
const taxIndex = source.indexOf('id="quoteTaxDisplay"');
assert(subtotalIndex !== -1 && adjustmentIndex !== -1 && taxIndex !== -1, 'quote viewer should include subtotal, adjustment, and tax rows');
assert(subtotalIndex < adjustmentIndex && adjustmentIndex < taxIndex, 'quote viewer total card should display adjustment between subtotal and tax');

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
context.updateQuoteTotalBreakdown(1265.27, 164.49, 1429.76, 'HST', 0.13, 0, true);
assert.equal(elements.quoteSubtotalDisplay.textContent, '$1265.27', 'subtotal must remain pre-tax');
assert.equal(elements.quoteTaxLabel.textContent, 'HST (13%)');
assert.equal(elements.quoteTaxDisplay.textContent, '$164.49');
assert.equal(elements.newGrandTotal.textContent, '$1429.76');

console.log('quote viewer total breakdown static test passed');
