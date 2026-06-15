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
