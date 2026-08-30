const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  builder.includes('id="roomCategoryOrderModal"') &&
    builder.includes('Choose my own order') &&
    builder.includes('Follow Manage Line Items order') &&
    builder.includes('Alphabetical') &&
    builder.includes('openRoomCategoryOrderModal('),
  'Each room Edit menu should open a category ordering modal with all three modes'
);

assert(
  builder.includes("return mode === 'manage' || mode === 'alphabetical' ? mode : 'manual';") &&
    builder.includes('const sortedItems = room.items.slice();') &&
    builder.includes('const orderedCats = getRoomOrderedCategories(room, groupOrder);'),
  'Rooms without a saved mode should default to their own item-added category order'
);

assert(
  builder.includes("room.categoryOrderMode = 'manual';") &&
    builder.includes('Automatic category ordering has been turned off for this room') &&
    builder.includes('Your new order has been kept.'),
  'Dragging an automatically ordered category should keep the new arrangement and switch only that room to manual mode'
);

assert(
  items.includes("saveManageCategoryCustomOrder(order, { customized: true });\n            showManageItemsToast('Custom category order saved.', true);\n            if (typeof renderRooms === 'function') renderRooms();") &&
    items.includes("renderAllItemsList();\n            if (typeof renderRooms === 'function') renderRooms();"),
  'Rooms following Manage Line Items should refresh when its custom order or ordering mode changes'
);

console.log('quote builder room category order static test passed');
