const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('id="quoteBuilderRoomReorderModal"'), 'quote builder should include a room reorder modal');
assert(source.includes('id="quoteBuilderRoomReorderList"'), 'room reorder modal should include a compact sortable list target');
assert(source.includes('id="quoteBuilderRoomReorderEmpty"'), 'room reorder modal should include an empty state');

assert(source.includes('function openQuoteBuilderRoomReorder'), 'quote builder should expose a room reorder opener');
assert(source.includes('function renderQuoteBuilderRoomReorderList'), 'quote builder should render the compact reorder list');
assert(source.includes('function initQuoteBuilderRoomReorderSortable'), 'quote builder should initialize sortable behavior inside the modal');
assert(source.includes('function applyQuoteBuilderRoomReorder'), 'quote builder should apply the compact list order back to rooms');

assert(
  source.includes('openQuoteBuilderRoomReorder(event)'),
  'room header move control should open the reorder modal'
);
assert(
  source.includes('quote-builder-room-reorder-handle'),
  'compact list should have its own drag handle separate from the full room-card drag handle'
);
assert(
  /rooms\s*=\s*newOrder\s*\.map\(function\(roomId\)/.test(source),
  'applyQuoteBuilderRoomReorder should rebuild rooms from the compact list order'
);
assert(
  /markUnsaved\(\);\s*renderRooms\(\);/.test(source),
  'applying room reorder should mark the quote unsaved and re-render rooms'
);
assert(
  /Sortable\.create\(list,\s*\{[\s\S]*handle:\s*['"]\.quote-builder-room-reorder-handle['"][\s\S]*onEnd:\s*function/.test(source),
  'room reorder modal should use Sortable on the compact list handle'
);

console.log('quote builder room reorder modal static test passed');
