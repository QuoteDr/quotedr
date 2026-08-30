const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const start = builder.indexOf('function populateCategoryDropdown(selectedCat)');
const end = builder.indexOf('function clearAddLineItemValidationField', start);
const populate = builder.slice(start, end);

assert(start >= 0 && end > start, 'Add Line Item category dropdown function should exist');
assert(
  populate.includes("typeof window.getManageItemsOrderedCategories === 'function'") &&
    populate.includes('window.getManageItemsOrderedCategories()'),
  'Add Line Item should use the same saved category order as Manage Line Items'
);
assert(
  populate.includes("cat.indexOf('__') !== 0") &&
    populate.includes('a.localeCompare(b)'),
  'Add Line Item should fall back to the same alphabetical category ordering during initial loading'
);
assert(
  populate.indexOf("addCatOpt.value = '__add_new_category__'") < populate.indexOf('cats.forEach'),
  'Add New Category should remain above the consistently ordered saved categories'
);

console.log('add line item category order static test passed');
