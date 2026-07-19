const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('function handleQuoteLineItemDragEnd'), 'quote builder should handle line-item drag completion');
assert(source.includes("group: { name: 'quote-line-items', pull: true, put: true }"), 'line-item sortables should share a cross-room drag group');
assert(source.includes("handle: '.line-item-drag-handle'"), 'line items should have a dedicated drag handle');
assert(source.includes('room-item-drop-zone quote-line-items-sortable'), 'each room should expose a line-item drop target');
assert(source.includes('data-category="\' + qdTemplateEscapeHtml(cat) + \'"'), 'category item lists should identify their destination category');
assert(source.includes('data-item-key="\' + itemDragKey + \'"'), 'rendered line items should carry stable runtime drag keys');

assert(source.includes('function transferSelectedRoomItems'), 'quote builder should support moving and copying selected items');
assert(source.includes('function duplicateSelectedRoomItems'), 'quote builder should support duplicating selected items');
assert(source.includes('function deleteSelectedRoomItems'), 'quote builder should support deleting selected items');
assert(source.includes('function applyMarkupToSelectedRoomItems'), 'quote builder should support marking up selected items');
assert(source.includes('function cloneQuoteBuilderLineItemAsAddition'), 'copied Change Order lines should use an addition-aware clone helper');
assert(source.includes('function markQuoteBuilderOriginalItemRemoved'), 'bulk deletion should reuse original-line Change Order removal semantics');
assert(source.includes('Move Selected to...'), 'Edit menu should include Move Selected');
assert(source.includes('Copy Selected to...'), 'Edit menu should include Copy Selected');
assert(source.includes('Duplicate Selected Here'), 'Edit menu should include Duplicate Selected Here');
assert(source.includes('Markup Selected'), 'Edit menu should include Markup Selected');
assert(source.includes('Delete Selected'), 'Edit menu should include Delete Selected');
assert(source.includes('Option Group from Selected'), 'Group menu should retain option grouping for selected items');
assert(source.includes('Saved Group'), 'Group menu should retain saved groups');
assert(source.includes("onchange=\"updateRoomBulkSelectionState(' + room.id + ')\""), 'item checkboxes should refresh bulk action availability');

assert(
  /function finishRoomBulkItemAction[\s\S]*?renderRooms\(\);[\s\S]*?saveSessionQuote\(\);[\s\S]*?markUnsaved\(\);/.test(source),
  'bulk item actions should render, save the session, and mark the quote unsaved'
);
assert(
  /function handleQuoteLineItemDragEnd[\s\S]*?_pushUndo\(\);[\s\S]*?finishRoomBulkItemAction\(message\);/.test(source),
  'cross-room dragging should be undoable and persist through the shared completion flow'
);
assert(
  /async function transferSelectedRoomItems[\s\S]*?_pushUndo\(\);[\s\S]*?finishRoomBulkItemAction/.test(source),
  'bulk move and copy should be undoable and persist'
);
assert(
  /async function deleteSelectedRoomItems[\s\S]*?_pushUndo\(\);[\s\S]*?finishRoomBulkItemAction/.test(source),
  'bulk delete should be undoable and persist'
);
assert(
  /async function applyMarkupToRoomItems[\s\S]*?_pushUndo\(\);[\s\S]*?finishRoomBulkItemAction/.test(source) &&
    /async function applyMarkupToSelectedRoomItems[\s\S]*?applyMarkupToRoomItems\(roomId, getSelectedRoomItemIndexes\(roomId\)\)/.test(source) &&
    /async function applyMarkupToRoomItem[\s\S]*?applyMarkupToRoomItems\(roomId, \[itemIndex\]\)/.test(source),
  'selected-item markup should be undoable and persist'
);
assert(
  source.includes('This is added on top of the room markup') &&
    source.includes('function quoteItemMarkupBadgeHtml(room, item, itemIndex)') &&
    source.includes("html += quoteItemMarkupBadgeHtml(room, item, origIndex);") &&
    source.includes("applyMarkupToRoomItem(' + roomIdArg + ', ' + itemIndex + ')'") &&
    source.includes("'% markup &middot; ' + visibilityLabel"),
  'room and item markup should share a clickable combined client-visibility badge'
);
assert(
  source.includes('Enter an additional markup percentage for ') &&
    !source.includes('Enter an additional markup percentage from 0 to 100') &&
    /if \(!clearOverride && \(!isFinite\(percent\) \|\| percent < 0\)\)/.test(source),
  'individual item markup should allow any non-negative percentage without an upper limit'
);
const globalMarkupBlock = source.slice(source.indexOf('async function applyGlobalMarkup()'), source.indexOf('// Template Management Functions'));
assert(
  !globalMarkupBlock.includes('delete item.markup') &&
    globalMarkupBlock.includes('Individual item markups were kept and added on top.'),
  'whole-quote room markup should preserve additional item markups'
);
assert(
  /function updateRoomMarkup[\s\S]*?_pushUndo\(\);[\s\S]*?saveSessionQuote\(\);[\s\S]*?markUnsaved\(\)/.test(source) &&
    /function toggleMarkupVisibility[\s\S]*?_pushUndo\(\);[\s\S]*?renderRooms\(\);[\s\S]*?saveSessionQuote\(\);[\s\S]*?markUnsaved\(\)/.test(source),
  'room markup amount and client visibility changes should be undoable, rerender badges, and persist'
);
assert(
  /function cloneQuoteBuilderLineItemAsAddition[\s\S]*?delete copy\._coOriginal;[\s\S]*?coRefreshItemDelta\(copy\)/.test(source),
  'copied and duplicated Change Order items should drop original provenance and recalculate as additions'
);
assert(
  /async function deleteSelectedRoomItems[\s\S]*?markQuoteBuilderOriginalItemRemoved\(item\)/.test(source),
  'bulk delete should retain genuine original Change Order lines as removal credits'
);

console.log('quote builder bulk room items static test passed');

