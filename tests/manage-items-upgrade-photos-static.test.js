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
    items.includes('class="upgrade-photos-value"') &&
    items.includes('photo: upgradePhotos[0] ||') &&
    items.includes('photos: upgradePhotos') &&
    items.includes('photosFull: upgradePhotos.map'),
  'Upgrade option photos should persist through the manual upgrade editor collection path'
);

assert(
  items.includes('function syncManageUpgradePhotoFromDetails') &&
    items.includes('hidden.value = photos[0] ||') &&
    items.includes('photosHidden.value = JSON.stringify(photos)') &&
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
  items.includes('function normalizeManageUpgradePhotos') &&
    items.includes('function normalizeManageUpgradePhotosFull') &&
    items.includes('upgrade-photos-value') &&
    items.includes('upgrade-photos-full-value') &&
    items.includes('data-photo-index="${index}"') &&
    items.includes('Add Upgrade Photo') &&
    items.includes('target.photos.length < MANAGE_ITEM_PHOTO_LIMIT'),
  'Upgrade options should support up to three compressed and full-resolution photos'
);

assert(
  items.includes('setManageUpgradeOptionPhoto(item, groupId, optionId, photo, photoIndex)') &&
    items.includes('setManageUpgradeOptionPhotoFull(item, groupId, optionId, photoFull, photoIndex)') &&
    items.includes('removeManageUpgradePhoto(cat, name, groupId, optionId, photoIndex)') &&
    items.includes('normalizeManageUpgradePhotos(existingTarget.option)') &&
    items.includes('normalizeManageUpgradePhotosFull(existingTarget.option)'),
  'Upload and remove handlers should target a specific upgrade photo slot'
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
