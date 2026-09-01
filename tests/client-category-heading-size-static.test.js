const fs = require('fs');
const assert = require('assert');

const quoteViewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoiceViewer = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  quoteViewer.includes('.viewer-category-heading') &&
    quoteViewer.includes('font-size: 1.05rem;') &&
    quoteViewer.includes('class="viewer-category-heading text-uppercase fw-bold mt-3 mb-1"'),
  'Client quote categories should be at least as prominent as line-item names'
);

assert(
  invoiceViewer.includes('.invoice-line-items .invoice-category-heading') &&
    invoiceViewer.includes('class="invoice-category-heading"') &&
    invoiceViewer.includes('font-size: 1.05rem;'),
  'Client invoice categories should use the same larger visual hierarchy'
);

assert(
  !quoteViewer.includes('style="font-size:0.72rem; letter-spacing:0.8px;') &&
    !invoiceViewer.includes('padding:4px 8px; font-size:0.72rem; font-weight:700;'),
  'The undersized legacy category headings should be removed from both viewers'
);

console.log('client category heading size static checks passed');
