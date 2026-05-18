const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('function mixRoomColorWithWhite('),
  'Room header intensity should blend the selected color toward white'
);

assert(
  source.includes('function deepenRoomColor('),
  'Room header intensity should deepen the selected color at the high end'
);

assert(
  /function roomHeaderBackground\(room\)[\s\S]*mixRoomColorWithWhite/.test(source),
  'roomHeaderBackground should use the white blend helper'
);

assert(
  /function roomHeaderBackground\(room\)[\s\S]*deepenRoomColor/.test(source),
  'roomHeaderBackground should use the deep color helper'
);

const roomHeaderBackground = source.match(/function roomHeaderBackground\(room\) \{[\s\S]*?\n        \}/);
assert(roomHeaderBackground, 'roomHeaderBackground should exist');

assert(
  !roomHeaderBackground[0].includes('linear-gradient(135deg,#2d2d2d 0%,#111111 100%)'),
  'roomHeaderBackground should not layer transparent colors over black'
);

assert(
  /var slider = \(intensity - 20\) \/ 80;/.test(roomHeaderBackground[0]),
  'roomHeaderBackground should remap the 20-100 slider range before blending'
);

assert(
  /0\.55 \+ slider \* 0\.35/.test(roomHeaderBackground[0]),
  'Low intensity should still keep enough selected color to avoid washed-out headers'
);

assert(
  /return 'linear-gradient\(135deg, rgb\(' \+ strong\.r[\s\S]*?0%[\s\S]*?rgb\(' \+ soft\.r[\s\S]*?100%/.test(roomHeaderBackground[0]),
  'Room header gradient should place the stronger color on the left behind the white title text'
);
