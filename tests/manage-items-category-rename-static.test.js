const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  html.includes('renameSelectedCategory()') &&
    html.includes('title="Rename selected category"') &&
    html.includes('fa-pen'),
  'Add New Item category controls should include a rename button'
);

assert(
  items.includes('function renameManageItemsCategory') &&
    items.includes('window.renameManageItemsCategory = renameManageItemsCategory'),
  'Manage Items should expose a category rename function'
);

assert(
  items.includes('function categoryNameExists(cat, ignoreCat)') &&
    items.includes("categoryNameExists(nextName, oldCat)") &&
    items.includes("String(existing || '').trim() === ignoredName") &&
    items.includes('Choose a unique name so QuoteDr does not merge unrelated items.'),
  'Category rename should allow case-only renames of the current category while still blocking true duplicate category names'
);

assert(
  items.includes('function renameSelectedCategory') &&
    items.includes('window.renameSelectedCategory = renameSelectedCategory'),
  'Manage Items should expose a selected-category rename helper'
);

assert(
  items.includes('MANAGE_CATEGORY_RENAMES_KEY') &&
    items.includes('ald_manage_items_category_renames') &&
    items.includes('applyManageCategoryRenames()'),
  'Category renames should persist separately and be applied before rendering'
);

assert(
  items.includes('categoryStyles[newCat] = categoryStyles[oldCat]') &&
    items.includes('manageItemsCategoryState[newCat] = manageItemsCategoryState[oldCat]'),
  'Category rename should preserve category style and open/collapsed state'
);

assert(
  items.includes('item.category === oldCat') &&
    items.includes('option.category === oldCat'),
  'Category rename should update quote items and saved choice group option categories'
);

assert(
  items.includes("typeof rooms !== 'undefined'") &&
    items.includes('quoteRooms.forEach'),
  'Category rename should update current quote rooms even when rooms is not attached to window'
);

assert(
  items.includes('openCategoryStylePicker(${catJs}, this)') &&
    items.includes('renameManageItemsCategory(${catJs})'),
  'Rendered category headers should include a rename action near category style controls'
);
