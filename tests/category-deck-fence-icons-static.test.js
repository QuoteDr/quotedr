const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

const expectedIcons = [
  ['qd-deck-boards', 'Deck Boards'],
  ['qd-deck-stairs', 'Deck Stairs'],
  ['qd-deck-railing', 'Deck Railing'],
  ['qd-fence-panel', 'Fence Panel'],
  ['qd-fence-gate', 'Fence Gate'],
  ['qd-pergola', 'Pergola'],
  ['qd-pressure-washer', 'Pressure Washer'],
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
  builder.includes("ico.label + ' ' + (ico.tags || '')") &&
    builder.includes("tags: 'deck patio porch boards planks'") &&
    builder.includes("tags: 'fence fencing privacy panel pickets'"),
  'Outdoor icons should include searchable deck and fence tags'
);
