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
  coRefreshItemDelta(item) {
    if (!item._coOriginal) {
      item._coChangeStatus = 'added';
      item.total = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
      item.changeOrderNote = 'Added item.';
      return item;
    }
    if (item._coRemoved) {
      item._coChangeStatus = 'removed';
      item.total = -Math.abs(Number(item._coOriginal.total) || 0);
      item.changeOrderNote = 'Removed original line.';
    } else if (item.category !== item._coOriginal.category) {
      item._coChangeStatus = 'changed';
      item.total = ((Number(item.quantity) || 0) * (Number(item.rate) || 0)) - (Number(item._coOriginal.total) || 0);
      item.changeOrderNote = 'Changed item details.';
    }
    return item;
  },
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
  context.window._quoteDocumentType = 'change_order';
  const originalSnapshot = { description: 'Original Work', quantity: 2, rate: 100, total: 200 };
  const originalChangeOrderItem = {
    description: 'Original Work',
    quantity: 2,
    rate: 100,
    total: 0,
    _coOriginal: originalSnapshot,
    _coChangeStatus: 'unchanged',
    changeOrderNote: '',
  };
  context.rooms = [
    { id: 1, name: 'Original Room', items: [originalChangeOrderItem] },
    { id: 2, name: 'New Room', items: [] },
  ];
  context.selectedIndexes = [0];
  context.openRoomBulkDestinationPicker = async () => context.rooms[1];

  await context.transferSelectedRoomItems(1, 'copy');
  const copiedChangeOrderItem = context.rooms[1].items[0];
  assert.strictEqual(context.rooms[0].items[0], originalChangeOrderItem, 'copy should leave the genuine original line in place');
  assert.strictEqual(copiedChangeOrderItem._coOriginal, undefined, 'a copied line must not inherit original-contract provenance');
  assert.strictEqual(copiedChangeOrderItem._coChangeStatus, 'added', 'a copied line should be included as added Change Order work');
  assert.strictEqual(copiedChangeOrderItem.total, 200, 'a copied line should carry its full added value');

  resetCounters();
  context.selectedIndexes = [0];
  await context.deleteSelectedRoomItems(2);
  assert.strictEqual(context.rooms[1].items.length, 0, 'deleting a copied Change Order line should remove it completely');

  resetCounters();
  context.selectedIndexes = [0];
  await context.deleteSelectedRoomItems(1);
  assert.strictEqual(context.rooms[0].items.length, 1, 'deleting genuine original work should retain a removal-credit row');
  assert.strictEqual(context.rooms[0].items[0]._coRemoved, true);
  assert.strictEqual(context.rooms[0].items[0]._coChangeStatus, 'removed');
  assert.strictEqual(context.rooms[0].items[0].total, -200);

  resetCounters();
  const moveOriginal = {
    description: 'Move Original',
    quantity: 1,
    rate: 80,
    total: 0,
    _coOriginal: { description: 'Move Original', quantity: 1, rate: 80, total: 80 },
    _coChangeStatus: 'unchanged',
  };
  context.rooms = [
    { id: 1, name: 'Original Room', items: [moveOriginal] },
    { id: 2, name: 'New Room', items: [] },
  ];
  context.selectedIndexes = [0];
  context.openRoomBulkDestinationPicker = async () => context.rooms[1];
  await context.transferSelectedRoomItems(1, 'move');
  assert.strictEqual(context.rooms[0].items[0]._coChangeStatus, 'removed', 'moving original work should record its removal from the source room');
  assert.strictEqual(context.rooms[0].items[0].total, -80);
  assert.strictEqual(context.rooms[1].items[0]._coChangeStatus, 'added', 'moving original work should record an addition in the destination room');
  assert.strictEqual(context.rooms[1].items[0].total, 80);

  resetCounters();
  const duplicateOriginal = {
    description: 'Duplicate Original',
    quantity: 3,
    rate: 25,
    total: 0,
    _coOriginal: { description: 'Duplicate Original', quantity: 3, rate: 25, total: 75 },
    _coChangeStatus: 'unchanged',
  };
  context.rooms = [{ id: 1, name: 'Original Room', items: [duplicateOriginal] }];
  context.selectedIndexes = [0];
  await context.duplicateSelectedRoomItems(1);
  assert.strictEqual(context.rooms[0].items[0]._coChangeStatus, 'unchanged');
  assert.strictEqual(context.rooms[0].items[1]._coOriginal, undefined, 'a same-room duplicate must not inherit original-contract provenance');
  assert.strictEqual(context.rooms[0].items[1]._coChangeStatus, 'added');
  assert.strictEqual(context.rooms[0].items[1].total, 75);

  context.window._quoteDocumentType = 'quote';

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

  resetCounters();
  context.window._quoteDocumentType = 'change_order';
  const dragOriginal = {
    description: 'Drag Original',
    category: 'Flooring',
    quantity: 2,
    rate: 60,
    total: 0,
    _coOriginal: { description: 'Drag Original', category: 'Flooring', quantity: 2, rate: 60, total: 120 },
    _coChangeStatus: 'unchanged',
  };
  const dragStay = { description: 'Still Original Room', category: 'Flooring' };
  const dragDestinationExisting = { description: 'Destination Existing', category: 'Electrical' };
  context.rooms = [
    { id: 1, name: 'Original Room', items: [dragOriginal, dragStay] },
    { id: 2, name: 'Destination Room', items: [dragDestinationExisting] },
  ];
  const dragOriginalKey = context.quoteBuilderLineItemDragKey(dragOriginal);
  const dragStayKey = context.quoteBuilderLineItemDragKey(dragStay);
  const dragDestinationKey = context.quoteBuilderLineItemDragKey(dragDestinationExisting);
  context.roomCards = {
    '.room-card[data-room-id="1"]': {
      querySelectorAll() { return [{ dataset: { itemKey: dragStayKey } }]; },
    },
    '.room-card[data-room-id="2"]': {
      querySelectorAll() {
        return [
          { dataset: { itemKey: dragDestinationKey } },
          { dataset: { itemKey: dragOriginalKey } },
        ];
      },
    },
  };

  context.handleQuoteLineItemDragEnd({
    item: { dataset: { itemKey: dragOriginalKey } },
    from: { dataset: { roomId: '1' } },
    to: { dataset: { roomId: '2', category: 'Electrical' } },
    oldIndex: 0,
    newIndex: 1,
  });

  assert.strictEqual(context.rooms[0].items[0]._coChangeStatus, 'removed', 'dragging original work to another room should leave a removal credit');
  assert.strictEqual(context.rooms[0].items[0].total, -120);
  assert.strictEqual(context.rooms[1].items[1]._coOriginal, undefined);
  assert.strictEqual(context.rooms[1].items[1]._coChangeStatus, 'added', 'dragging original work to another room should add it in the destination');
  assert.strictEqual(context.rooms[1].items[1].total, 120);
  assert.strictEqual(context.rooms[1].items[1].category, 'Electrical');

  resetCounters();
  const categoryOriginal = {
    description: 'Change Category',
    category: 'Flooring',
    quantity: 1,
    rate: 45,
    total: 0,
    _coOriginal: { description: 'Change Category', category: 'Flooring', quantity: 1, rate: 45, total: 45 },
    _coChangeStatus: 'unchanged',
  };
  context.rooms = [{ id: 1, name: 'Original Room', items: [categoryOriginal] }];
  const categoryOriginalKey = context.quoteBuilderLineItemDragKey(categoryOriginal);
  context.roomCards = {
    '.room-card[data-room-id="1"]': {
      querySelectorAll() { return [{ dataset: { itemKey: categoryOriginalKey } }]; },
    },
  };
  const categoryFrom = { dataset: { roomId: '1', category: 'Flooring' } };
  const categoryTo = { dataset: { roomId: '1', category: 'Electrical' } };
  context.handleQuoteLineItemDragEnd({
    item: { dataset: { itemKey: categoryOriginalKey } },
    from: categoryFrom,
    to: categoryTo,
    oldIndex: 0,
    newIndex: 0,
  });
  assert.strictEqual(context.rooms[0].items[0].category, 'Electrical');
  assert.strictEqual(context.rooms[0].items[0]._coChangeStatus, 'changed', 'dragging original work to a new category should register a Change Order edit');

  console.log('quote builder bulk room items behavior test passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

