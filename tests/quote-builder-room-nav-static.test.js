const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mobileBarStart = source.indexOf('id="mobileActionBar"');
const saveQuoteModalStart = source.indexOf('<!-- Save Quote Dialog Modal -->');
assert(mobileBarStart !== -1 && saveQuoteModalStart !== -1, 'mobile action bar and save quote modal markers should exist');

const mobileBar = source.slice(mobileBarStart, saveQuoteModalStart);
assert(mobileBar.includes('id="quoteBuilderRoomNavBtn"'), 'mobile action bar should include a room navigation button');
assert(mobileBar.includes('openQuoteBuilderRoomNav()'), 'room navigation button should open the room picker');
assert(mobileBar.includes('>Rooms<'), 'room navigation button should be labelled Rooms');
assert(!/<span[^>]*>\s*PDF\s*<\/span>/.test(mobileBar), 'mobile action bar should not keep the old PDF button');

assert(source.includes('id="quoteBuilderRoomNavModal"'), 'quote builder should include a room navigation modal');
assert(source.includes('id="quoteBuilderRoomNavList"'), 'room navigation modal should include a list target');
assert(source.includes('id="quoteBuilderRoomNavEmpty"'), 'room navigation modal should include an empty state');

assert(source.includes('function quoteBuilderRoomAnchorId'), 'quote builder should define stable room anchors');
assert(source.includes('function renderQuoteBuilderRoomNav'), 'quote builder should render the room navigation list');
assert(source.includes('function openQuoteBuilderRoomNav'), 'quote builder should expose a room navigation opener');
assert(source.includes('function jumpToQuoteBuilderRoom'), 'quote builder should jump to selected rooms');
assert(source.includes('room-jump-highlight'), 'selected room should receive a temporary highlight class');
assert(
  /scrollIntoView\(\s*\{\s*behavior:\s*['"]smooth['"]\s*,\s*block:\s*['"]start['"]\s*\}\s*\)/.test(source),
  'room navigation should smoothly scroll the selected room into view'
);

assert(
  source.includes('class="room-card" id="') && source.includes('quoteBuilderRoomAnchorId(room.id)'),
  'renderRooms should assign a stable anchor id to every room card'
);

const renderRoomsStart = source.indexOf('function renderRooms()');
const updateRoomScopeStart = source.indexOf('function updateRoomScopeNotes', renderRoomsStart);
assert(renderRoomsStart !== -1 && updateRoomScopeStart !== -1, 'renderRooms function should be found');
const renderRoomsBody = source.slice(renderRoomsStart, updateRoomScopeStart);
assert(
  (renderRoomsBody.match(/renderQuoteBuilderRoomNav\(\)/g) || []).length >= 2,
  'renderRooms should refresh the room navigation in both empty and populated states'
);

console.log('quote builder room navigation static test passed');
