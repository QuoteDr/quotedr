const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  source.includes('id="quotePdfPrintTipModal"'),
  'Quote viewer should include a pre-print PDF settings tip modal'
);

assert(
  source.includes('Turn off Headers and footers') &&
    source.includes('Turn on Background graphics'),
  'PDF tip should call out the two browser print settings needed for a clean PDF'
);

assert(
  source.includes('function showQuotePdfPrintTip()'),
  'Quote viewer should define a reusable print tip modal helper'
);

assert(
  /async function downloadQuotePdf\(\)[\s\S]*await showQuotePdfPrintTip\(\)/.test(source),
  'Download PDF should wait for the print tip before opening the print dialog'
);

assert(
  source.includes('var waitingForHidden = false;') &&
    /function onContinue\(\)[\s\S]*waitingForHidden = true;[\s\S]*modal\.hide\(\);/.test(source) &&
    /function onHidden\(\)[\s\S]*finish\(waitingForHidden\);/.test(source),
  'PDF tip should wait for the modal to fully hide before printing so the backdrop is not captured'
);

assert(
  source.includes('quotePdfPrintTipContinueBtn') &&
    source.includes('Continue to Print'),
  'PDF tip should include an explicit continue-to-print action'
);

assert(
  source.includes('Headers and footers') &&
    source.includes('Background graphics'),
  'PDF tip should mirror the Chrome print dialog wording'
);

console.log('quote viewer PDF print tip static test passed');
