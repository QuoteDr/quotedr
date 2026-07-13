const fs = require('fs');
const assert = require('assert');

const items = fs.readFileSync('quote-items.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  items.includes("secondaryText: 'Save All and Exit'") &&
    items.includes("secondaryValue: 'save_all_and_exit'") &&
    items.includes("secondaryClass: 'btn-success'"),
  'Manage Items unsaved-close dialog should offer a green Save All and Exit action'
);

assert(
  items.includes('function finishManageItemsClose(choice)') &&
    /choice === 'save_all_and_exit'[\s\S]*saveAllPricingRows\(\)[\s\S]*hideManageItemsModal\(\)/.test(items),
  'Save All and Exit should save every Manage Items row before closing the modal'
);

assert(
  /confirmDiscardManageItemsChanges\(\)\.then\(function\(shouldExit\)[\s\S]*finishManageItemsClose\(shouldExit\)/.test(items) &&
    /const closeChoice = await confirmDiscardManageItemsChanges\(\);[\s\S]*return finishManageItemsClose\(closeChoice\);/.test(items),
  'Both Bootstrap close interception and the explicit Close button should use the same save-and-exit handling'
);

assert(
  builder.includes('quote-items.js?v=1783269306'),
  'Quote Builder should cache-bust the Manage Items script so the new exit action loads immediately'
);

console.log('manage items Save All and Exit static checks passed');
