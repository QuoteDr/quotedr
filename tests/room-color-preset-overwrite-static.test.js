const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('const ROOM_COLOR_PRESET_LIMIT = 8;'),
  'Room color preset limit should be named'
);

assert(
  source.includes('pendingRoomColorPresetOverwrite'),
  'Room color modal should track a pending overwrite when saved colors are full'
);

assert(
  source.includes('Max custom colour saves reached'),
  'Room color modal should tell the user when the custom color save limit is reached'
);

assert(
  source.includes('function overwriteRoomColorPreset('),
  'Room color modal should let the user choose which saved color to overwrite'
);

assert(
  source.includes("room-saved-colour-grid' + (pending && pending.color ? ' overwrite-mode' : '')"),
  'Overwrite mode should use a compact saved-color grid layout'
);

assert(
  source.includes('room-overwrite-icon-btn') && source.includes('fa-rotate'),
  'Overwrite mode should use a compact orange icon button instead of clipped text'
);

assert(
  /\(pending && pending\.color \? '' : color\.toUpperCase\(\)\)/.test(source),
  'Overwrite mode should hide hex color labels to prevent clipping'
);

const saveBlock = source.match(/function saveRoomColorPreset\(hex, overwriteHex\) \{[\s\S]*?\n        \}/);
assert(saveBlock, 'saveRoomColorPreset should accept an optional overwrite color');

assert(
  saveBlock[0].includes('needsOverwrite'),
  'Saving a new color at the limit should request overwrite instead of silently slicing'
);

assert(
  !/JSON\.stringify\(presets\.slice\(0,\s*8\)\)/.test(saveBlock[0]),
  'saveRoomColorPreset should not silently drop older colors with slice(0, 8)'
);
