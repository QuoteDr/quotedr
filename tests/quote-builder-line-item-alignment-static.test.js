const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('.quote-items-table') && source.includes('table-layout: fixed'),
  'Quote builder line item tables should use fixed layout so pricing columns align across categories'
);

assert(
  source.includes('quoteItemTableColgroup'),
  'Line item renderer should build a shared explicit colgroup'
);

assert(
  source.includes("hasMaterialCosts ? '<col style=\"width:116px\">' : ''"),
  'Line item colgroup should reserve the profit/margin column only when material costs are shown'
);

[
  'quote-item-desc-cell',
  'quote-item-qty-cell',
  'quote-item-rate-cell',
  'quote-item-total-cell',
  'quote-item-actions-cell'
].forEach((className) => {
  assert(source.includes(className), className + ' should be used by line item rows');
});

assert(
  source.includes('justify-content:flex-end'),
  'Line item action buttons should stay aligned to the far right'
);
