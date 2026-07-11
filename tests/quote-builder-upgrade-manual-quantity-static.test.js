const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');

assert(
  builder.includes('function handleItemUpgradeManualQuantityKeydown'),
  'manual upgrade quantity inputs should handle Enter explicitly'
);

assert(
  builder.includes('oninput="setItemUpgradeManualQuantity(event,'),
  'manual upgrade quantity inputs should persist edits as the user types'
);

assert(
  builder.includes('onkeydown="handleItemUpgradeManualQuantityKeydown(event,'),
  'manual upgrade quantity inputs should save and blur on Enter'
);

assert(
  builder.includes('options.render !== false'),
  'manual upgrade quantity input updates should support state-only saves without rerendering each keystroke'
);

assert(
  builder.includes('function mergeQuoteItemUpgradeGroupRuntimeState'),
  'choice-group rows should merge runtime upgrade quantity edits back into rehydrated option upgrade groups'
);

assert(
  builder.includes('quantityStateByGroupAndOption'),
  'choice-group upgrade merge should preserve per-option manual quantity state, not only selected option ids'
);

assert(
  builder.includes('function setItemUpgradeManualQuantityFromButton'),
  'manual upgrade quantity inputs should have a Set button action'
);

assert(
  builder.includes('item-upgrade-manual-quantity-set'),
  'manual upgrade quantity inputs should render a visible Set button beside the field'
);

console.log('quote-builder upgrade manual quantity static checks passed');
