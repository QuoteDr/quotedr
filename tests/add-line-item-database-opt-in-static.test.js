const assert = require('assert');
const fs = require('fs');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  builder.includes('id="lineNewServiceName"') &&
    builder.includes('function startNewLineServiceEditor') &&
    builder.includes('function syncNewLineServiceName'),
  'new services should have an editable name field inside the Add Line Item modal'
);

const serviceChangeStart = builder.indexOf('serviceSelect.onchange = async function()');
const serviceChangeEnd = builder.indexOf('if (services.length === 0)', serviceChangeStart);
const serviceChangeBlock = builder.slice(serviceChangeStart, serviceChangeEnd);
assert(serviceChangeStart >= 0 && serviceChangeEnd > serviceChangeStart, 'new-service selection flow should exist');
assert(
  !serviceChangeBlock.includes("localStorage.setItem('ald_custom_items'") &&
    !serviceChangeBlock.includes('pricingDatabase[cat].push'),
  'choosing Add New Service must not persist the service before explicit approval'
);

assert(
  builder.includes('id="saveNewLineItemPromptModal"') &&
    builder.includes('id="saveNewLineItemDontAskAgain"') &&
    builder.includes("LINE_ITEM_DATABASE_PROMPT_PREF_KEY = 'ald_new_line_item_database_prompt'") &&
    builder.includes("localStorage.setItem(LINE_ITEM_DATABASE_PROMPT_PREF_KEY, 'quote_only')"),
  'new quote-only items should offer an accessible save prompt with a safe do-not-ask preference'
);

const confirmStart = builder.indexOf('async function confirmAddLine()');
const confirmEnd = builder.indexOf('function checkIfNewItem()', confirmStart);
const confirmBlock = builder.slice(confirmStart, confirmEnd);
assert(
  confirmBlock.includes('await promptToSaveNewLineItemToDatabase(description)') &&
    confirmBlock.includes('await saveLineItemToDatabase()') &&
    confirmBlock.indexOf("await _hideBootstrapModalAndWait('addLineModal')") < confirmBlock.indexOf('await promptToSaveNewLineItemToDatabase(description)'),
  'the item database save should happen only after the contractor accepts the prompt'
);

assert(
  items.includes('function isManageCustomItem(category, item)') &&
    items.includes('const isCustom = isManageCustomItem(cat, item);') &&
    items.includes("pricingDatabase[category] = pricingDatabase[category].filter(i => i && i.name !== name);"),
  'legacy custom services missing the in-memory custom marker should still be deletable'
);

console.log('Add Line Item database opt-in static checks passed.');
