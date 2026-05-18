const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const match = source.match(/function setRoomColor\(roomId, colorIndex\) \{[\s\S]*?\n        \}/);

assert(match, 'setRoomColor should exist');
const body = match[0];

assert(
  /querySelectorAll\('\.color-swatch'\)/.test(body),
  'setRoomColor should clear active state from all swatches, including saved custom colors'
);

assert(
  /s\.hasAttribute\('data-preset-index'\)/.test(body),
  'setRoomColor should only activate the matching built-in preset swatch after clearing all swatches'
);
