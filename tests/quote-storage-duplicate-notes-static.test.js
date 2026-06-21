const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-storage.js', 'utf8');

assert(
  source.includes('function sanitizeQuoteRoomsForSave'),
  'Quote storage should sanitize quote rooms before saving'
);

assert(
  source.includes('qdQuoteStorageTextKey(note) === qdQuoteStorageTextKey(description)') &&
    source.includes("item.notes = '';"),
  'Quote storage should remove exact duplicate job notes that match imported descriptions'
);

assert(
  source.includes('rooms: sanitizeQuoteRoomsForSave(rooms)'),
  'collectQuoteData should save sanitized room data'
);

assert(
  !/rooms:\s*JSON\.parse\(JSON\.stringify\(rooms\)\)/.test(source),
  'collectQuoteData should not save raw room data with duplicate imported notes'
);
