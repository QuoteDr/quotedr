const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  builder.includes('function detectRoomIconForName(roomName)'),
  'Quote builder should expose a room-name icon detector'
);

assert(
  builder.includes('function autoDetectRoomIcon(roomId)'),
  'Room icon picker should support auto detecting one room icon'
);

assert(
  builder.includes('function autoDetectAllRoomIcons()'),
  'Room icon picker should support auto detecting all room icons'
);

assert(
  builder.includes('Auto Detect') && builder.includes('Auto Detect All'),
  'Room icon picker should show Auto Detect and Auto Detect All actions'
);

assert(
  builder.includes('This will change all room icons if the tool thinks theirs better fits.'),
  'Auto Detect All should warn before changing every room icon'
);

assert(
  builder.includes("pattern: /\\b(bathroom|bath|ensuite|washroom|powder|toilet)\\b/") &&
  builder.includes("icon: 'fa-bath'"),
  'Detector should map bathroom-like room names to the bath icon'
);

assert(
  builder.includes("pattern: /\\b(kitchen|pantry|galley)\\b/") &&
  builder.includes("icon: 'fa-utensils'"),
  'Detector should map kitchen-like room names to the kitchen icon'
);

assert(
  builder.includes("pattern: /\\b(garage|carport)\\b/") &&
  builder.includes("icon: 'fa-car'"),
  'Detector should map garage-like room names to the car icon'
);

assert(
  builder.includes('selectRoomIcon(roomId, detectedIcon)'),
  'Single-room auto detect should reuse the normal room icon selection path'
);

assert(
  builder.includes('renderRooms();') && builder.includes('markUnsaved();'),
  'Auto Detect All should re-render rooms and mark the quote unsaved after changes'
);
