const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('id="addRoomModal"') &&
    source.includes('data-enter-submit="#addRoomBreakBtn"') &&
    source.includes('id="addRoomBreakBtn"'),
  'Add Room modal should declare its Enter key primary action'
);

assert(
  source.includes('function handleModalEnterSubmit(event)') &&
    source.includes("event.key !== 'Enter'") &&
    source.includes("tagName === 'TEXTAREA'") &&
    source.includes('button.click()'),
  'Modal Enter helper should submit opt-in modals while ignoring multiline fields'
);

assert(
  source.includes("document.addEventListener('keydown', handleModalEnterSubmit)"),
  'Modal Enter helper should be registered globally for opt-in modals'
);

assert(
  source.includes("modalEl.addEventListener('shown.bs.modal'") &&
    source.includes("document.getElementById('newRoomName').focus()"),
  'Add Room modal should focus the room name input when opened'
);
