const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

const expectedIcons = [
  ['qd-roof-shingles', 'Roof Shingles'],
  ['qd-roof-peak', 'Roof Peak'],
  ['qd-roof-vent', 'Roof Vent'],
  ['qd-gutter-downspout', 'Gutter Downspout'],
  ['qd-chimney-flashing', 'Chimney Flashing'],
  ['qd-roofing-nailer', 'Roofing Nailer'],
];

expectedIcons.forEach(([id, label]) => {
  assert(
    builder.includes(`{ fa: '${id}'`) && builder.includes(`label: '${label}'`),
    `Category style picker should include ${label}`
  );

  assert(
    builder.includes(`if (icon === '${id}')`),
    `Category icon renderer should support ${label}`
  );
});

assert(
  builder.includes("tags: 'roof roofing shingles shingle asphalt'") &&
    builder.includes("tags: 'roof roofing gutter eavestrough downspout drainage'"),
  'Roofing icons should include searchable roofing tags'
);
