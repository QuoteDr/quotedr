const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(items.includes('function normalizeManagePricingMode'), 'Manage Items should normalize fixed vs Price TBD pricing mode');
assert(items.includes('class="form-check-input manage-price-tbd"'), 'Manage Items row editor should expose a Price TBD checkbox for base item rates');
assert(items.includes('class="form-check-input upgrade-price-tbd"'), 'Manage Items upgrade editor should expose a Price TBD checkbox for upgrade rates');
assert(items.includes('price-tbd-inline'), 'Manage Items upgrade editors should place Price TBD inline with the Rate label');
assert(items.includes('pricingMode: priceTbd ? \'tbd\' : \'fixed\''), 'Manage Items should persist pricingMode for Price TBD saved items and upgrades');

assert(builder.includes('function isQuotePriceTbd'), 'Quote builder should centralize Price TBD detection');
assert(builder.includes('function qdFormatPriceTbd'), 'Quote builder should centralize the Price TBD label');
assert(builder.includes('priceTbd: isQuotePriceTbd(option)'), 'Quote builder should preserve Price TBD on upgrade and choice group options');
assert(builder.includes('function countQuoteTbdSelections'), 'Quote builder should count selected TBD lines and options');
assert(builder.includes('price-tbd-inline'), 'Quote builder rate forms should place Price TBD inline with the Rate label');
assert(builder.includes('id="quoteTbdNotice"'), 'Quote builder total card should include a Price TBD notice');
assert(builder.includes('displayRateText = qdFormatPriceTbd()'), 'Quote builder line items should display Price TBD instead of $0.00');
assert(
  builder.includes('if (isQuotePriceTbd(option)) {') &&
    builder.includes('hasTbdSelections = true;') &&
    builder.includes('lineTotal = 0;'),
  'Quote builder upgrade math should exclude Price TBD upgrade selections from totals'
);

assert(viewer.includes('function isViewerPriceTbd'), 'Client viewer should centralize Price TBD detection');
assert(viewer.includes('function viewerPriceTbdLabel'), 'Client viewer should centralize the Price TBD label');
assert(viewer.includes('priceTbd: isViewerPriceTbd(option)'), 'Client viewer should preserve Price TBD on normalized options');
assert(viewer.includes('function countViewerTbdSelections'), 'Client viewer should count selected TBD lines and options');
assert(viewer.includes('id="quoteTbdDisplay"'), 'Client viewer total card should include a Price TBD notice');
assert(viewer.includes('viewerPriceTbdLabel()'), 'Client viewer should render Price TBD labels instead of $0.00');
assert(
  viewer.includes('if (isViewerPriceTbd(option)) {') &&
    viewer.includes('hasTbdSelections = true;') &&
    viewer.includes('lineTotal = 0;'),
  'Client viewer upgrade math should exclude Price TBD upgrade selections from totals'
);

console.log('price TBD static checks passed');
