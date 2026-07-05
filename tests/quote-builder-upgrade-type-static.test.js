const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const quoteBuilder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');

assert(
  quoteBuilder.includes('function normalizeQuoteUpgradeType'),
  'quote-builder should normalize upgrade type values for old and new upgrades'
);

assert(
  quoteBuilder.includes('function getQuoteDisplayItemDescription'),
  'quote-builder should centralize upgraded item description display'
);

assert(
  quoteBuilder.includes('getQuoteDisplayItemDescription(item, isUpgraded, hasUpgrade)'),
  'quote row rendering should use the upgrade-aware description helper'
);

assert(
  quoteBuilder.includes("upgradeType === 'add_on'"),
  'toggleItemUpgrade should branch for add-on upgrades'
);

assert(
  quoteBuilder.includes('item.rate = baseRate + upgradeRate'),
  'add-on upgrades should add their rate to the base item rate'
);

assert(
  quoteBuilder.includes('item.materialCost = baseMaterialCost + upgradeMaterialCost'),
  'add-on upgrades should add their material cost to the base item material cost'
);

assert(
  quoteBuilder.includes('item._baseItemDescription'),
  'toggleItemUpgrade should preserve the base item description for add-on display'
);

assert(
  quoteBuilder.includes('type: normalizeQuoteUpgradeType'),
  'saved item quote sync fingerprints should include normalized upgrade type'
);

console.log('quote-builder-upgrade-type-static passed');
