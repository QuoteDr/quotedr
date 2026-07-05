const fs = require('fs');
const assert = require('assert');

const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  items.includes('function updateManageRowMargin'),
  'Manage Items should define a live margin updater for edited rows'
);

assert(
  items.includes('function updateManageDetailMargin'),
  'Manage Items should define a live margin updater for the details supplier/cost section'
);

assert(
  items.includes('manage-row-margin-target') &&
    items.includes('manage-detail-margin-target'),
  'Rendered margin pills should have stable target containers that can be recalculated'
);

assert(
  items.includes('oninput="markPricingDirty(this); updateManageRowMargin(this)"'),
  'Rate and material cost row inputs should recalculate row margin as the user types'
);

assert(
  items.includes('oninput="syncManageDetailBaseField(this); markPricingDirty(this); updateManageDetailMargin(this)"'),
  'Details material cost input should recalculate margin as the user types'
);

assert(
  items.includes('updateManageRowMargin(row);') &&
    items.includes('updateManageDetailMargin(detailsRow);'),
  'Saving a row should refresh visible margin pills from the saved values'
);

assert(
  items.includes('window.updateManageRowMargin = updateManageRowMargin') &&
    items.includes('window.updateManageDetailMargin = updateManageDetailMargin'),
  'Live margin update helpers should be exposed for inline handlers'
);

console.log('manage-items live margin static checks passed');
