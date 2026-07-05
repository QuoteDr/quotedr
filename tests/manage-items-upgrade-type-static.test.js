const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const quoteItems = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const quoteBuilder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');

assert(
  quoteItems.includes('function normalizeManageUpgradeType'),
  'quote-items.js should normalize saved upgrade type values'
);

assert(
  quoteItems.includes("id === 'newItemUpgradeType'"),
  'resetNewItemUpgradePanel should reset the new item upgrade type to replacement'
);

assert(
  quoteItems.includes("document.getElementById('newItemUpgradeType')?.value"),
  'collectNewItemUpgrade should read the new item upgrade type selector'
);

assert(
  quoteItems.includes('type: upgradeType'),
  'collectNewItemUpgrade should save upgrade type on new upgrades'
);

assert(
  quoteItems.includes("collapseRow.querySelector('.upgrade-type')?.value"),
  'saveItemRowCore should read upgrade type from existing item upgrade details'
);

assert(
  quoteItems.includes('type: upgType'),
  'existing item upgrade saves should persist the selected upgrade type'
);

assert(
  quoteBuilder.includes('id="newItemUpgradeType"'),
  'New Item upgrade panel should include an upgrade type selector'
);

assert(
  quoteBuilder.includes('value="replacement"') && quoteBuilder.includes('value="add_on"'),
  'Upgrade type selector should offer Replacement and Add-on options'
);

console.log('manage-items-upgrade-type-static passed');
