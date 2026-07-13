const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const container = {
  dataset: {},
  innerHTML: '',
  classList: { add() {}, remove() {} },
  querySelectorAll() { return []; },
  appendChild() {}
};
const search = { value: '' };
const context = {
  console,
  setTimeout() {},
  clearTimeout() {},
  requestAnimationFrame() {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    addEventListener() {},
    getElementById(id) {
      if (id === 'customItemsList') return container;
      if (id === 'itemSearchFilter') return search;
      return null;
    },
    querySelector(selector) { return selector === '#customItemsList' ? container : null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, className: '', textContent: '' }; }
  },
  pricingDatabase: {},
  customItems: {},
  categoryStyles: {}
};
context.window = context;

for (let categoryIndex = 0; categoryIndex < 30; categoryIndex += 1) {
  context.pricingDatabase['Category ' + categoryIndex] = Array.from({ length: 20 }, function(_value, itemIndex) {
    return { name: 'Item ' + itemIndex, rate: 10, materialCost: 5, unitType: 'each' };
  });
}

vm.createContext(context);
vm.runInContext(fs.readFileSync('quote-items.js', 'utf8'), context);
context.renderAllItemsList();

const categoryHeaders = (container.innerHTML.match(/manage-items-category-header/g) || []).length;
const renderedRows = (container.innerHTML.match(/<tr[^>]*manage-items-row/g) || []).length;
assert.strictEqual(container.dataset.manageItemsRenderMode, 'collapsed');
assert.strictEqual(categoryHeaders, 30, 'collapsed categories should keep their scannable headers');
assert.strictEqual(renderedRows, 0, 'collapsed categories must not construct hidden item rows');
assert(container.innerHTML.length < 100000, 'collapsed Manage Items markup should remain compact');

console.log('manage items compact render checks passed');
