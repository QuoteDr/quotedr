const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  source.includes('@media print'),
  'Invoice viewer should define print-specific styles'
);

assert(
  source.includes('.item-desc-wrap.is-collapsed .item-desc-collapsible') &&
    source.includes('max-height: none !important') &&
    source.includes('overflow: visible !important'),
  'Printed invoices should expand collapsed line item descriptions'
);

assert(
  source.includes('.item-desc-wrap.is-collapsed .item-desc-collapsible::after') &&
    source.includes('display: none !important'),
  'Printed invoices should remove the fade overlay from expanded descriptions'
);

assert(
  source.includes('.item-desc-toggle') &&
    source.includes('display: none !important'),
  'Printed invoices should hide show-more controls'
);

assert(
  source.includes('print-color-adjust: exact') &&
    source.includes('-webkit-print-color-adjust: exact'),
  'Printed invoices should preserve line item highlight colors where supported'
);

console.log('invoice print expanded descriptions static test passed');
