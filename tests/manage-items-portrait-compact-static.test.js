const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');

assert(
  items.includes('MANAGE_PORTRAIT_FIELDS_KEY') &&
    items.includes('ald_manage_items_portrait_fields') &&
    items.includes('function getManageItemsPortraitFields') &&
    items.includes('function applyManageItemsPortraitFieldSettings') &&
    items.includes('window.applyManageItemsPortraitFieldSettings = applyManageItemsPortraitFieldSettings'),
  'Manage Items should persist and expose portrait row field preferences'
);

assert(
  items.includes('manage-items-portrait-optional') &&
    items.includes('data-manage-portrait-field="badges"') &&
    items.includes('data-manage-portrait-field="unit"') &&
    items.includes('data-manage-portrait-field="rate"') &&
    items.includes('data-manage-portrait-field="material"') &&
    items.includes('data-manage-portrait-field="supplier"') &&
    items.includes('manage-items-actions-cell') &&
    items.includes('applyManageItemsPortraitFieldSettings();'),
  'Manage Items rows should mark optional portrait fields and keep actions/details visible'
);

assert(
  html.includes('@media (max-width: 768px) and (orientation: portrait)') &&
    html.includes('#manageItemsModal .manage-items-row td.manage-items-portrait-optional') &&
    html.includes('#manageItemsModal[data-portrait-show-unit="1"]') &&
    html.includes('#manageItemsModal[data-portrait-show-rate="1"]') &&
    html.includes('#manageItemsModal[data-portrait-show-material="1"]') &&
    html.includes('#manageItemsModal[data-portrait-show-supplier="1"]') &&
    html.includes('#manageItemsModal[data-portrait-show-badges="1"]') &&
    html.includes('#manageItemsModal .manage-items-actions-cell'),
  'Phone portrait CSS should hide optional Manage Items row fields unless the user opts them in'
);

assert(
  settings.includes('Phone Portrait Layout') &&
    settings.includes('managePortraitShowUnit') &&
    settings.includes('managePortraitShowRate') &&
    settings.includes('managePortraitShowMaterial') &&
    settings.includes('managePortraitShowSupplier') &&
    settings.includes('managePortraitShowBadges') &&
    settings.includes('function saveManageItemsPortraitSettings') &&
    settings.includes('function loadManageItemsPortraitSettings') &&
    settings.includes('ald_manage_items_portrait_fields'),
  'Settings > Pricing and Data should let users choose which Manage Items fields show in phone portrait'
);
