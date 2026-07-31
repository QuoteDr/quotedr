const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const start = source.indexOf('function setLineItemNameFromService');
const end = source.indexOf('function showItemSearchResults', start);

assert(start >= 0 && end > start, 'service-name synchronization helper should be extractable');

const fields = {
  lineDescription: { value: 'Vani' },
  itemQuickSearch: { value: 'Vani' },
};
let validationClears = 0;
let newItemChecks = 0;
const context = {
  document: {
    getElementById(id) { return fields[id] || null; },
  },
  clearAddLineItemValidationField() { validationClears += 1; },
  checkIfNewItem() { newItemChecks += 1; },
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
context.setLineItemNameFromService('Vanity Installation');

assert.strictEqual(fields.lineDescription.value, 'Vanity Installation', 'the saved line-item name should use the complete service name');
assert.strictEqual(fields.itemQuickSearch.value, 'Vanity Installation', 'the visible Quick Search field should show the complete service name');
assert.strictEqual(validationClears, 1);
assert.strictEqual(newItemChecks, 1);

assert.strictEqual(context.isLikelyTruncatedServiceName('Vani', 'Vanity Installation'), true, 'mid-word partial names should be repaired');
assert.strictEqual(context.isLikelyTruncatedServiceName('Vanity', 'Vanity Installation'), false, 'intentional complete-word short names should be preserved');
assert.strictEqual(context.isLikelyTruncatedServiceName('Custom Vanity', 'Vanity Installation'), false, 'unrelated custom names should be preserved');

console.log('quote builder service name synchronization behavior test passed');
