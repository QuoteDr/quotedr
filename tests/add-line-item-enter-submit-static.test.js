const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('id="addLineModal"') &&
    source.includes('data-enter-submit="#addLineItemBtn"') &&
    source.includes('id="addLineItemBtn"') &&
    source.includes('onclick="confirmAddLine()"'),
  'Add Line Item modal should declare its Enter key primary action'
);

assert(
  source.includes('function handleModalEnterSubmit(event)') &&
    source.includes("tagName === 'TEXTAREA'"),
  'Shared Enter submit helper should keep textarea Enter behavior intact'
);

assert(
  source.includes("modalEl.addEventListener('shown.bs.modal', function focusLineItemQuickSearch()") &&
    source.includes("document.getElementById('itemQuickSearch')") &&
    source.includes('quickSearch.focus()'),
  'Opening Add Line Item should focus Quick Search after the modal is ready for keyboard input'
);
