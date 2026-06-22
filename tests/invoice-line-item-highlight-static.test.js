const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  source.includes('INVOICE_LINE_ITEM_HIGHLIGHTS'),
  'Invoice viewer should define line item highlight colour presets'
);

assert(
  source.includes('function getInvoiceLineItemHighlight(') &&
    source.includes('item.highlightColor'),
  'Invoice viewer should read the saved item.highlightColor value'
);

assert(
  source.includes('.invoice-line-items tr.invoice-line-item-highlighted > td') &&
    source.includes('--invoice-line-highlight-bg') &&
    source.includes('--invoice-line-highlight-border'),
  'Highlighted invoice rows should apply a visible background and accent border to table cells'
);

assert(
  source.includes("rowClassNames.push('invoice-line-item-highlighted')") &&
    source.includes("rowStyles.push('--invoice-line-highlight-bg: ' + lineItemHighlight.background)") &&
    source.includes("rowStyles.push('--invoice-line-highlight-border: ' + lineItemHighlight.border)"),
  'Invoice item renderer should apply highlight class and CSS variables from saved highlight data'
);

console.log('invoice line item highlight static test passed');
