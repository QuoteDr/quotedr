const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  html.includes('function resetLineItemEditState()') &&
    html.includes('editingItemIndex = null;') &&
    html.includes("modalTitle.textContent = 'Add Line Item';") &&
    html.includes("saveBtn.textContent = 'Add Line Item';"),
  'Add/edit line item modal should have a central reset helper for stale edit state'
);

assert(
  /function addLine\(roomId\)\s*{\s*resetLineItemEditState\(\);/.test(html),
  'Opening Add Item should clear any previous edit mode before the modal is shown'
);

assert(
  html.includes("addLineModalEl.addEventListener('hidden.bs.modal', resetLineItemEditState);"),
  'Closing or dismissing the add/edit modal should clear edit mode'
);

assert(
  /resetLineItemEditState\(\);\s*renderRooms\(\);/.test(html),
  'Saving an edited or new line item should reset the modal before re-rendering'
);
