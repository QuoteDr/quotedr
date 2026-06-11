const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('function getRoomNameSpellingSuggestion('),
  'Quote builder should include a room-name spelling suggestion helper'
);

assert(
  source.includes('COMMON_ROOM_SPELLCHECK_WORDS') &&
    source.includes("'porch'") &&
    source.includes("'bathroom'") &&
    source.includes("'kitchen'"),
  'Room-name spellcheck should know common room and area words'
);

assert(
  source.includes('COMMON_ROOM_SPELLCHECK_EXCEPTIONS') &&
    source.includes('bathrom') &&
    source.includes('kitchn'),
  'Room-name spellcheck should catch common room-name typos'
);

assert(
  source.includes('function suggestRoomWordWithExtraLetters(') &&
    source.includes('word.startsWith(candidate)') &&
    source.includes('word.endsWith(candidate)'),
  'Room-name spellcheck should catch accidental extra letters on common room words'
);

assert(
  source.includes('renderRoomNameWithSpellcheck(room)'),
  'Room header rendering should use the spellcheck-aware room name renderer'
);

assert(
  source.includes('room-name-spelling-warning') &&
    source.includes('room-spelling-alert') &&
    source.includes('Maybe "') &&
    source.includes('showToast'),
  'Possible room-name spelling issues should have a visible warning state after saving the room name'
);

assert(
  !source.includes('text-decoration:underline dotted; padding:2px 4px;" title="Click to edit">' + "' + room.name"),
  'Room names should not always render with the old dotted underline'
);
