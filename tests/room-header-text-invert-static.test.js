const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('.room-header.room-text-dark'),
  'Quote builder should define a dark-text room header style'
);

assert(
  source.includes('function toggleRoomHeaderText('),
  'Quote builder should include a per-room text invert toggle'
);

assert(
  /room\.invertHeaderText/.test(source),
  'Room header text inversion should be stored on the room'
);

assert(
  /room-header' \+ \(room\.invertHeaderText \? ' room-text-dark' : ''\)/.test(source),
  'Room header should render the dark-text class when inverted'
);

assert(
  /toggleRoomHeaderText\(' \+ room\.id \+ '\)/.test(source) && /Invert/.test(source),
  'Room header should render an Invert text button'
);
