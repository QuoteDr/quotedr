const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

const context = vm.createContext({
  window: {
    getManageItemsOrderedCategories() {
      return ['Demolition', 'Framing', 'Electrical'];
    }
  }
});

vm.runInContext([
  extractFunction('getRoomCategoryOrderMode'),
  extractFunction('getRoomCategoriesInAddedOrder'),
  extractFunction('getRoomOrderedCategories'),
  'this.getMode = getRoomCategoryOrderMode;',
  'this.getAdded = getRoomCategoriesInAddedOrder;',
  'this.getOrdered = getRoomOrderedCategories;'
].join('\n'), context);

const room = {
  items: [
    { category: 'Electrical' },
    { category: 'Demolition' },
    { category: 'Electrical' },
    { category: 'Framing' }
  ]
};
const added = Array.from(context.getAdded(room));
assert.deepEqual(added, ['Electrical', 'Demolition', 'Framing']);
assert.equal(context.getMode(room), 'manual');
assert.deepEqual(Array.from(context.getOrdered(room, added)), ['Electrical', 'Demolition', 'Framing']);

room.categoryOrder = ['Framing', 'Electrical'];
assert.deepEqual(Array.from(context.getOrdered(room, added)), ['Framing', 'Electrical', 'Demolition']);

room.categoryOrderMode = 'manage';
assert.deepEqual(Array.from(context.getOrdered(room, added)), ['Demolition', 'Framing', 'Electrical']);

room.items.push({ category: 'Specialty Work' });
const withSpecialty = Array.from(context.getAdded(room));
assert.deepEqual(Array.from(context.getOrdered(room, withSpecialty)), ['Demolition', 'Framing', 'Electrical', 'Specialty Work']);

room.categoryOrderMode = 'alphabetical';
assert.deepEqual(Array.from(context.getOrdered(room, withSpecialty)), ['Demolition', 'Electrical', 'Framing', 'Specialty Work']);

console.log('quote builder room category order behavior test passed');
