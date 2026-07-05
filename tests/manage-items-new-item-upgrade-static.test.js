const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(html.includes('id="toggleNewItemUpgradeBtn"'), 'new item form should include an Add Upgrade toggle button');
assert(html.includes('onclick="toggleNewItemUpgradePanel()"'), 'upgrade toggle should call toggleNewItemUpgradePanel');
assert(html.includes('id="newItemUpgradePanel"'), 'new item form should include a hidden upgrade panel');
assert(html.includes('id="newItemUpgradeName"'), 'upgrade panel should collect upgrade name');
assert(html.includes('id="newItemUpgradeUnit"'), 'upgrade panel should collect upgrade unit');
assert(html.includes('id="newItemUpgradeRate"'), 'upgrade panel should collect upgrade rate');
assert(html.includes('id="newItemUpgradeMaterialCost"'), 'upgrade panel should collect upgrade material cost');
assert(html.includes('id="newItemUpgradeSupplierUrl"'), 'upgrade panel should collect upgrade supplier URL');
assert(html.includes('id="newItemUpgradeDescription"'), 'upgrade panel should collect upgrade description');

assert(js.includes('function toggleNewItemUpgradePanel'), 'quote-items should define toggleNewItemUpgradePanel');
assert(js.includes('function resetNewItemUpgradePanel'), 'quote-items should define resetNewItemUpgradePanel');
assert(js.includes('function collectNewItemUpgrade'), 'quote-items should define collectNewItemUpgrade');
assert(js.includes('const upgrade = collectNewItemUpgrade(unitType);'), 'addCustomItem should collect optional upgrade data');
assert(js.includes('newItem.upgrade = upgrade;'), 'addCustomItem should attach the collected upgrade to the saved item');
assert(js.includes('resetNewItemUpgradePanel();'), 'new item upgrade panel should reset after open/add');
assert(js.includes('window.toggleNewItemUpgradePanel = toggleNewItemUpgradePanel;'), 'toggle should be exposed for the inline button');

console.log('manage-items new item upgrade static checks passed');
