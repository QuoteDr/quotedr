const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) throw new Error(message + ': missing ' + expected);
}

const builder = read('quote-builder.html');
const viewer = read('interactive-quote-viewer.html');
const invoice = read('invoice-viewer.html');
const discounts = read('quote-discounts.js');

assertIncludes(builder, 'id="lineDiscountApplyToUpgrades"', 'line discount modal should expose the upgrade scope checkbox');
assertIncludes(builder, 'discountAppliesToUpgrades: type !== \'none\' && applyToUpgrades', 'builder should save the selected discount scope');
assertIncludes(builder, 'item.discountAppliesToUpgrades !== false', 'builder should preserve legacy discounted quote behavior');
assertIncludes(builder, 'item._undiscountedTotal = lineTotal', 'builder should preserve gross upgraded totals');
assertIncludes(builder, '(base item only)', 'builder should visibly identify a base-only discount');
assertIncludes(viewer, '(base item only)', 'interactive viewer should identify a base-only discount');
assertIncludes(invoice, '(base item only)', 'invoice viewer should identify a base-only discount');
assertIncludes(discounts, 'function discountableTotal(item)', 'shared math should calculate the eligible discount total');
assertIncludes(discounts, 'item.discountAppliesToUpgrades !== false', 'missing legacy scope should continue to include upgrades');

console.log('line discount upgrade scope static test passed');
