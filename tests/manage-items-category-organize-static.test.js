const fs = require('fs');
const assert = require('assert');

const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  items.includes('MANAGE_CATEGORY_ORDER_MODE_KEY') &&
    items.includes('ald_manage_items_category_order_mode') &&
    items.includes('MANAGE_CATEGORY_CUSTOM_ORDER_KEY') &&
    items.includes('ald_manage_items_category_custom_order'),
  'Manage Items should persist category order mode separately from the remembered custom order'
);

assert(
  items.includes('function getManageItemsCategoryOrderMode') &&
    items.includes('function setManageItemsCategoryOrderMode') &&
    items.includes("setManageItemsCategoryOrderMode('alphabetical')") &&
    items.includes("setManageItemsCategoryOrderMode('custom')"),
  'Manage Items should provide alphabetical and custom category organization modes'
);

assert(
  items.includes('function getOrderedManageCategories') &&
    items.includes('customOrder.concat') &&
    items.includes('localeCompare'),
  'Rendered Manage Items categories should use saved custom order or alphabetical sorting'
);

assert(
  items.includes('function initManageCategorySortable') &&
    items.includes("Sortable.create(container") &&
    items.includes("draggable: '.manage-items-category'") &&
    items.includes("handle: '.manage-category-drag-handle'") &&
    items.includes('saveManageCategoryOrderFromDom'),
  'Custom mode should enable Sortable category drag and save the resulting category order'
);

assert(
  items.includes('function showManageCategoryCustomOrderHelp') &&
    items.includes('Drag categories up or down') &&
    items.includes('function openManageCategoryOrganizeMenu'),
  'Selecting custom mode should explain drag-to-organize behavior from the Organize menu'
);

assert(
  items.includes('manage-category-drag-handle') &&
    items.includes('manage-category-order-mode-badge') &&
    items.includes('Organize'),
  'Manage Items toolbar and category headers should expose organization controls and drag handles'
);

assert(
  items.includes('renameManageCategoryOrder(oldCat, newCat)') &&
    items.includes('saveManageCategoryCustomOrder'),
  'Category rename should update the saved custom category order'
);

assert(
  items.includes('window.getManageItemsOrderedCategories') &&
    items.includes('loadManageCategoryOrderState();') &&
    items.includes('return getOrderedManageCategories().slice();'),
  'Manage Items should expose its current saved category order to other quote-builder modals'
);

assert(
  items.includes("MANAGE_CATEGORY_ORDER_CLOUD_KEY = 'manage_items_category_order'") &&
    items.includes('function persistManageCategoryOrderState') &&
    items.includes("saveUserDataValue(MANAGE_CATEGORY_ORDER_CLOUD_KEY") &&
    items.includes('function _restoreManageCategoryOrderFromCloud') &&
    items.includes('loadUserDataValue(MANAGE_CATEGORY_ORDER_CLOUD_KEY)') &&
    items.includes('Promise.all([itemRestorePromise, categoryOrderRestorePromise])'),
  'Manage Items category ordering should sync through account user_data and restore before the item library is ready'
);

assert(
  items.includes('localUpdatedAt > cloudUpdatedAt') &&
    items.includes('MANAGE_CATEGORY_ORDER_UPDATED_AT_KEY') &&
    items.includes('MANAGE_CATEGORY_ORDER_CUSTOMIZED_KEY') &&
    items.includes('localShouldWin') &&
    items.includes('cloudCustomized') &&
    items.includes('hasLegacyLocalOrder') &&
    items.includes('_saveManageCategoryOrderToCloud(migratedAt)'),
  'Category-order sync should prioritize an actually rearranged list and migrate a deliberate browser-only order into the account'
);
