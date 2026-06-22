const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  source.includes('@media print'),
  'Quote viewer should define print-specific styles'
);

assert(
  source.includes('.item-description span[id$="_short"]') &&
    source.includes('display: none !important'),
  'Quote viewer PDF should hide truncated line item description previews'
);

assert(
  source.includes('.item-description span[id$="_full"]') &&
    source.includes('display: inline !important'),
  'Quote viewer PDF should show full line item descriptions'
);

assert(
  source.includes('.item-desc-toggle') &&
    source.includes('display: none !important'),
  'Quote viewer PDF should hide show-more controls'
);

assert(
  source.includes('print-color-adjust: exact') &&
    source.includes('-webkit-print-color-adjust: exact'),
  'Quote viewer PDF should preserve page and highlight colors where supported'
);

assert(
  source.includes('.viewer-line-item-highlighted') &&
    source.includes('.proposal-hero') &&
    source.includes('.hero-total-panel'),
  'Quote viewer PDF color preservation should include highlighted rows and major proposal panels'
);

console.log('quote viewer PDF expanded descriptions static test passed');
