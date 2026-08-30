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
  source.includes('quote-item-profit-cell'),
  'Quote builder should render a line-item profit column when profit report details are open'
);

assert(
  source.includes('isLineProfitDetailsVisible()'),
  'Line-item profit details should be gated by the profit report visibility state'
);

assert(
  source.includes("profitReportEl.addEventListener('shown.bs.collapse'"),
  'Opening the profit report should refresh line items with profit details visible'
);

assert(
  source.includes("profitReportEl.addEventListener('hidden.bs.collapse'"),
  'Closing the profit report should hide line-item profit details again'
);

assert(
  !source.includes("profitIcon = profit >= 0 ? '?' : '?'"),
  'Quote builder should not render broken question-mark profit icons in line item rows'
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

assert(
  source.includes('.quote-item-discount-note') &&
    source.includes('white-space: normal') &&
    source.includes('quote-item-discount-amount'),
  'Line item discount details should wrap inside the total column instead of overlapping action buttons'
);
