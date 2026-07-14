const fs = require('fs');
const assert = require('assert');

const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');

assert(
  builder.includes('categoryStyles: JSON.parse(JSON.stringify(categoryStyles || {}))'),
  'Generated invoice data should include a categoryStyles snapshot from quote builder'
);

assert(
  storage.includes('function getQuoteCategoryStylesSnapshot()') &&
    storage.includes('categoryStyles: getQuoteCategoryStylesSnapshot()'),
  'Saved quote data should preserve categoryStyles for later invoice generation'
);

assert(
  storage.includes('Object.assign(categoryStyles, data.categoryStyles || {})'),
  'Loaded quotes should restore saved categoryStyles'
);

assert(
  invoice.includes('function invoiceCategoryStyle(catName)') &&
    invoice.includes('invoiceData.categoryStyles'),
  'Invoice viewer should read category styles from invoice data'
);

assert(
  invoice.includes('function invoiceCategoryIconMarkup(catName)') &&
    invoice.includes("style.icon || 'fa-tag'"),
  'Invoice viewer should render the saved category icon before falling back to the default tag'
);

assert(
  invoice.includes('invoiceCategoryIconMarkup(catName) + canonicalCat(catName)'),
  'Invoice category rows should use the saved category icon'
);

assert(
  !invoice.includes('<i class="fas fa-tag me-1" style="color:#6c757d;"></i>${canonicalCat(catName)}'),
  'Invoice category rows should not hard-code the default tag icon'
);
