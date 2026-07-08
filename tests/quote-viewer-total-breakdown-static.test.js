const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="quoteSubtotalDisplay"'), 'quote viewer total card should render a subtotal amount');
assert(source.includes('id="quoteTaxLabel"'), 'quote viewer total card should render the configured tax label');
assert(source.includes('id="quoteTaxDisplay"'), 'quote viewer total card should render a tax amount');
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

console.log('quote viewer total breakdown static test passed');
