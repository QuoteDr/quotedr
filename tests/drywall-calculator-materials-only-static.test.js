const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const calculators = fs.readFileSync('quote-calculators.js', 'utf8');

assert(
  !builder.includes('id="drywallAddToQuoteBtn"'),
  'Drywall calculator should not show an Add to Quote button'
);

assert(
  !calculators.includes('function addToDrywallQuote()') &&
    !calculators.includes('Drywall items added to quote!'),
  'Drywall calculator should not contain quote-item creation behavior'
);

assert(
  !calculators.includes('drywallAddToQuoteBtn'),
  'Drywall calculator JS should not enable or manage a removed Add to Quote button'
);
