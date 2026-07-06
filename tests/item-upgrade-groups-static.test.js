const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(items.includes('normalizeManageItemUpgradeGroups'), 'Manage Items should normalize legacy upgrades into item-level upgradeGroups');
assert(items.includes('renderManageItemUpgradeGroupsEditor'), 'Manage Items should render an item-level upgrade groups editor');
assert(items.includes('data-upgrade-group-action="add-group"'), 'Upgrade editor should let users add multiple upgrade groups');
assert(items.includes('data-upgrade-group-action="add-option"'), 'Upgrade editor should let users add multiple upgrade options');
assert(items.includes('Available after'), 'Upgrade editor should expose path rules with Available after wording');
assert(items.includes('Blocked by'), 'Upgrade editor should expose compatibility rules with Blocked by wording');
assert(items.includes('collectManageItemUpgradeGroups'), 'Manage Items should collect upgradeGroups when saving rows');
assert(items.includes('newItem.upgradeGroups = upgradeGroups;'), 'New items should save upgradeGroups');
assert(items.includes('data-detail-section="upgrade"'), 'Upgrade groups should remain available from the Details menu');

assert(builder.includes('normalizeQuoteItemUpgradeGroups'), 'Quote builder should normalize item-level upgradeGroups');
assert(builder.includes('renderItemUpgradeGroups'), 'Quote builder should render item-level upgrade group choices');
assert(builder.includes('toggleItemUpgradeOption'), 'Quote builder should toggle item upgrade options');
assert(builder.includes('toggleItemUpgradeDescription'), 'Quote builder should let upgrade descriptions expand inline');
assert(builder.includes('item-upgrade-option-description'), 'Quote builder should render upgrade descriptions in expandable panels');
assert(builder.includes('clearInvalidItemUpgradeSelections'), 'Quote builder should clear blocked upgrade path selections');
assert(builder.includes('applyItemUpgradeGroupsToItem'), 'Quote builder should apply selected upgrade groups to totals');
assert(builder.includes('selectedUpgradeOptionIds'), 'Quote builder should track selected item upgrade option ids');
assert(builder.includes('upgradeGroups: normalizeQuoteItemUpgradeGroups'), 'Quote builder should carry saved item upgradeGroups onto quote items');

assert(viewer.includes('normalizeViewerItemUpgradeGroups'), 'Client viewer should normalize item-level upgradeGroups');
assert(viewer.includes('renderViewerItemUpgradeGroups'), 'Client viewer should render client-facing item upgrade choices');
assert(viewer.includes('toggleViewerItemUpgradeOption'), 'Client viewer should toggle item upgrade choices');
assert(viewer.includes('toggleViewerUpgradeDescription'), 'Client viewer should let clients expand upgrade descriptions');
assert(viewer.includes('viewer-upgrade-option-description'), 'Client viewer should render upgrade descriptions in expandable panels');
assert(viewer.includes('clearInvalidViewerItemUpgradeSelections'), 'Client viewer should clear blocked upgrade path selections');
assert(viewer.includes('_clientItemUpgradeSelections'), 'Approval payload should record selected item upgrade paths');

console.log('item upgrade groups static checks passed');
