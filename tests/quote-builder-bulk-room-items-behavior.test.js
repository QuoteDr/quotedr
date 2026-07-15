const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const helpersStart = source.indexOf('const quoteBuilderLineItemDragKeys');
const helpersEnd = source.indexOf('async function createChoiceGroupFromRoomItems', helpersStart);
const dragStart = source.indexOf('function quoteBuilderLineItemLookup');
const dragEnd = source.indexOf('function initSortable()', dragStart);

assert(helpersStart >= 0 && helpersEnd > helpersStart, 'bulk room item helpers should be extractable');
assert(dragStart >= 0 && dragEnd > dragStart, 'line-item drag helpers should be extractable');

const counters = {
  undo: 0,
  render: 0,
  totals: 0,
  save: 0,
  unsaved: 0,
};

const context = {
  console,
  rooms: [],
  selectedIndexes: [],
  roomCards: {},
  document: {
    body: { classList: { remove() {} } },
    getElementById() { return null; },
    querySelector(selector) { return context.roomCards[selector] || null; },
    querySelectorAll(selector) {
      if (!selector.includes('.choice-group-select') || !selector.includes(':checked')) return [];
      return context.selectedIndexes.map((index) => ({ dataset: { itemIndex: String(index) } }));
    },
  },
  window: {},
  getQuoteDividerLabels() {
    return { singular: 'Room', singularLower: 'room' };
  },
  qdAlert: async () => {},
  qdConfirm: async () => true,
  qdPrompt: async () => null,
  qdTemplateEscapeHtml(value) { return String(value); },
  quoteBuilderSafeIconClass(value) { return String(value); },
  _pushUndo() { counters.undo += 1; },
  renderRooms() { counters.render += 1; },
  calculateTotals() { counters.totals += 1; },
  saveSessionQuote() { counters.save += 1; },
  markUnsaved() { counters.unsaved += 1; },
  showToast() {},
};

vm.createContext(context);
vm.runInContext(source.slice(helpersStart, helpersEnd), context);
vm.runInContext(source.slice(dragStart, dragEnd), context);

function resetCounters() {
  Object.keys(counters).forEach((key) => { counters[key] = 0; });
}

function itemNames(room) {
  return Array.from(room.items, (item) => item.description);
}

async function run() {
  const first = { description: 'First', photos: ['first.jpg'] };
  const second = { description: 'Second' };
  const third = { description: 'Third' };
  const existing = { description: 'Existing' };
  context.rooms = [
    { id: 1, name: 'Room One', items: [first, second, third] },
    { id: 2, name: 'Room Two', items: [existing] },
  ];
  context.selectedIndexes = [0, 2];
  context.openRoomBulkDestinationPicker = async () => context.rooms[1];

  await context.transferSelectedRoomItems(1, 'move');
  assert.deepStrictEqual(itemNames(context.rooms[0]), ['Second']);
  assert.deepStrictEqual(itemNames(context.rooms[1]), ['Existing', 'First', 'Third']);
  assert.strictEqual(context.rooms[1].items[1], first, 'move should preserve the original line item object');
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1 });

  resetCounters();
  context.rooms = [
    { id: 1, name: 'Room One', items: [first, second] },
    { id: 2, name: 'Room Two', items: [] },
  ];
  context.selectedIndexes = [0];
  context.openRoomBulkDestinationPicker = async () => context.rooms[1];

  await context.transferSelectedRoomItems(1, 'copy');
  assert.strictEqual(context.rooms[0].items.length, 2, 'copy should keep source items');
  assert.strictEqual(context.rooms[1].items.length, 1, 'copy should add the item to the destination');
  assert.notStrictEqual(context.rooms[1].items[0], first, 'copy should deep-clone the line item');
  assert.strictEqual(JSON.stringify(context.rooms[1].items[0].photos), JSON.stringify(['first.jpg']), 'copy should retain attached photo data');
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1 });

  resetCounters();
  context.rooms = [{ id: 1, name: 'Room One', items: [first, second] }];
  context.selectedIndexes = [1];
  await context.duplicateSelectedRoomItems(1);
  assert.deepStrictEqual(itemNames(context.rooms[0]), ['First', 'Second', 'Second']);
  assert.notStrictEqual(context.rooms[0].items[1], context.rooms[0].items[2], 'duplicate should clone the selected item');

  resetCounters();
  context.selectedIndexes = [0, 2];
  await context.deleteSelectedRoomItems(1);
  assert.deepStrictEqual(itemNames(context.rooms[0]), ['Second']);
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1 });

  resetCounters();
  const dragItem = { description: 'Drag Me', category: 'Flooring' };
  const sourceRemainder = { description: 'Stay Here', category: 'Flooring' };
  const destinationExisting = { description: 'Already There', category: 'Electrical' };
  context.rooms = [
    { id: 1, name: 'Room One', items: [dragItem, sourceRemainder] },
    { id: 2, name: 'Room Two', items: [destinationExisting] },
  ];
  const dragKey = context.quoteBuilderLineItemDragKey(dragItem);
  const sourceRemainderKey = context.quoteBuilderLineItemDragKey(sourceRemainder);
  const destinationExistingKey = context.quoteBuilderLineItemDragKey(destinationExisting);
  context.roomCards = {
    '.room-card[data-room-id="1"]': {
      querySelectorAll() { return [{ dataset: { itemKey: sourceRemainderKey } }]; },
    },
    '.room-card[data-room-id="2"]': {
      querySelectorAll() {
        return [
          { dataset: { itemKey: destinationExistingKey } },
          { dataset: { itemKey: dragKey } },
        ];
      },
    },
  };

  context.handleQuoteLineItemDragEnd({
    item: { dataset: { itemKey: dragKey } },
    from: { dataset: { roomId: '1' } },
    to: { dataset: { roomId: '2', category: 'Electrical' } },
    oldIndex: 0,
    newIndex: 1,
  });

  assert.deepStrictEqual(itemNames(context.rooms[0]), ['Stay Here']);
  assert.deepStrictEqual(itemNames(context.rooms[1]), ['Already There', 'Drag Me']);
  assert.strictEqual(dragItem.category, 'Electrical', 'dropping into a category should update the moved item category');
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1 });

  console.log('quote builder bulk room items behavior test passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

