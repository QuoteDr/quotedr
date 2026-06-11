const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('applyAllRoomColorModal'),
  'Room colour modal should expose a Change All action'
);

assert(
  source.includes('Change All') &&
    source.includes('Apply this colour to every room header'),
  'Room colour modal should label the all-room colour action clearly'
);

assert(
  source.includes('finishRoomColorModalApply(color, { allRooms: true })') ||
    source.includes('finishRoomColorModalApply(color, {allRooms:true})'),
  'Change All should reuse the modal apply flow and target all rooms'
);

assert(
  source.includes('rooms.forEach(function(room)') &&
    source.includes('room.customColor = normalizeHexColor(color)') &&
    source.includes('room.colorIndex = -1'),
  'Change All should apply the chosen custom colour to every room'
);

assert(
  source.includes('pendingRoomColorPresetOverwrite.applyAll'),
  'Overwrite mode should remember whether the user chose Change All'
);
