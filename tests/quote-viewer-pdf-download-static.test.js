const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="downloadQuotePdfBtn"'), 'quote viewer should expose a client PDF download button');
assert(source.includes('onclick="downloadQuotePdf()"'), 'PDF button should call the quote PDF download handler');
assert(source.includes('function downloadQuotePdf()'), 'quote viewer should define a PDF download handler');
assert(source.includes('updateTotal();'), 'PDF handler should recalculate totals from current client selections before printing');
assert(source.includes('window.QuoteDrAndroid') && source.includes('printCurrentPage'), 'PDF handler should support the Android native print bridge');
assert(source.includes('window.print();'), 'PDF handler should fall back to browser print/save as PDF');
assert(source.includes('.hero-actions') && source.includes('.sticky-client-actions') && source.includes('.upgrade-action-btn'), 'print CSS should hide interactive viewer controls');

console.log('quote viewer PDF download static test passed');
