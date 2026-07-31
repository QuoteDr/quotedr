const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const start = source.indexOf('function replaceQuoteCategoryOrder');
const end = source.indexOf('function getQuoteCategoryPickerCategories', start);

assert(start >= 0 && end > start, 'category reassignment helpers should be extractable');

const counters = { undo: 0, finish: 0 };
const context = {
  rooms: [{
    id: 1,
    name: 'Kitchen',
    categoryOrder: ['Demolition', 'Cabinetry', 'Electrical'],
    items: [
      { description: 'Remove cabinets', category: 'Demolition' },
      { description: 'Remove counter', category: 'Demolition' },
      { description: 'Install cabinets', category: 'Cabinetry' },
    ],
  }],
  quoteBuilderRoomById(roomId) {
    return context.rooms.find((room) => String(room.id) === String(roomId)) || null;
  },
  quoteBuilderIsChangeOrderMode() { return false; },
  _pushUndo() { counters.undo += 1; },
  finishRoomBulkItemAction() { counters.finish += 1; },
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.strictEqual(context.reassignQuoteCategory(1, 'Demolition', 'Demo & Disposal'), true);
assert.deepStrictEqual(
  Array.from(context.rooms[0].items, (item) => item.category),
  ['Demo & Disposal', 'Demo & Disposal', 'Cabinetry'],
  'every item in the selected room category should be reassigned'
);
assert.deepStrictEqual(
  Array.from(context.rooms[0].categoryOrder),
  ['Demo & Disposal', 'Cabinetry', 'Electrical'],
  'the room category order should follow the renamed category'
);
assert.deepStrictEqual(counters, { undo: 1, finish: 1 }, 'category reassignment should be undoable and use the persistent completion flow');

context.rooms[0].categoryOrder = ['Demo & Disposal', 'Cabinetry', 'Electrical'];
context.rooms[0].items[2].category = 'Electrical';
assert.strictEqual(context.reassignQuoteCategory(1, 'Demo & Disposal', 'Electrical'), true);
assert.deepStrictEqual(
  Array.from(context.rooms[0].categoryOrder),
  ['Electrical', 'Cabinetry'],
  'merging into an existing category should not leave duplicate category order entries'
);

console.log('quote builder category reassignment behavior test passed');
