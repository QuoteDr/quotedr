const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');

assert(
  items.includes('function getManageUpgradePhotoTargets') &&
    items.includes('function setManageUpgradeOptionPhoto') &&
    items.includes('function removeManageUpgradePhoto'),
  'Manage Items should expose helpers for upgrade-option-specific photos'
);

assert(
  items.includes('class="upgrade-photo-value"') &&
    items.includes("photo: optionEl.querySelector('.upgrade-photo-value')?.value || ''"),
  'Upgrade option photos should persist through the manual upgrade editor collection path'
);

assert(
  items.includes('function syncManageUpgradePhotoFromDetails') &&
    items.includes("hidden.value = photo || ''") &&
    items.includes('collectManageItemUpgradeGroups(detailsRow, true)') &&
    items.includes('upgradePhotoSyncedFromDetails'),
  'Upgrade photo uploads should update the open details editor before re-rendering'
);

assert(
  items.includes('manage-upgrade-photo-target') &&
    items.includes('data-upgrade-group-id') &&
    items.includes('data-upgrade-option-id') &&
    items.includes('upgrade-photo-remove-btn'),
  'Photos details should list upgrade options and attach add/remove controls to a specific option'
);

assert(
  builder.includes('openManageItemPhotoFilePicker(cat, name, field, photoIndex, upgradeGroupId, upgradeOptionId)') &&
    builder.includes('inp.dataset.upgradeGroupId = upgradeGroupId') &&
    builder.includes('inp.dataset.upgradeOptionId = upgradeOptionId') &&
    builder.includes('removeManageUpgradePhoto('),
  'Photo picker should pass upgrade group and option IDs through to upload and remove handlers'
);

assert(
  items.includes('data-upgrade-group-id="legacy_upgrade"') &&
    items.includes('data-upgrade-option-id="legacy_upgrade_option"'),
  'Legacy single upgrade photo buttons should still target the legacy upgrade slot explicitly'
);

console.log('manage item upgrade photo static checks passed');
