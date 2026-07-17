const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const start = source.indexOf('function setSelectedLineItemHighlights(');
const end = source.indexOf('async function openRoomBulkDestinationPicker(', start);
assert(start >= 0 && end > start, 'bulk highlight helper should be extractable');

const counters = { undo: 0, finish: 0 };
const context = {
  rooms: [
    {
      id: 7,
      items: [
        { description: 'First' },
        { description: 'Second' },
        { description: 'Third', highlightColor: 'blue' }
      ]
    }
  ],
  LINE_ITEM_HIGHLIGHTS: {
    yellow: { label: 'Yellow' },
    blue: { label: 'Blue' }
  },
  quoteBuilderRoomById(roomId) {
    return context.rooms.find((room) => String(room.id) === String(roomId));
  },
  _pushUndo() {
    counters.undo += 1;
  },
  finishRoomBulkItemAction(message) {
    counters.finish += 1;
    context.lastMessage = message;
  },
  Set,
  Number,
  Array
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

context.setSelectedLineItemHighlights(7, [0, 2], 'yellow');
assert.strictEqual(context.rooms[0].items[0].highlightColor, 'yellow');
assert.strictEqual(context.rooms[0].items[1].highlightColor, undefined, 'unselected items should not change');
assert.strictEqual(context.rooms[0].items[2].highlightColor, 'yellow');
assert.deepStrictEqual(counters, { undo: 1, finish: 1 });
assert(context.lastMessage.includes('2 selected line items'));

context.setSelectedLineItemHighlights(7, [0, 2], '');
assert.strictEqual(context.rooms[0].items[0].highlightColor, undefined, 'clear should remove selected highlights');
assert.strictEqual(context.rooms[0].items[2].highlightColor, undefined, 'clear should affect every selected item');
assert.deepStrictEqual(counters, { undo: 2, finish: 2 });

console.log('quote builder bulk highlight behavior test passed');
