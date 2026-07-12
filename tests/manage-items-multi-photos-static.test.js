const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  items.includes('MANAGE_ITEM_PHOTO_LIMIT = 3') &&
    items.includes('function normalizeManageItemPhotos') &&
    items.includes('function syncManageItemPhotoCompatibility') &&
    items.includes('item.photos = photos') &&
    items.includes("item.photo = photos[0] || ''"),
  'Manage Items should normalize up to 3 base item photos and keep legacy item.photo synced to the first photo'
);

assert(
  items.includes('function shouldPromptManageItemPhotoReplacement') &&
    items.includes('function openManageItemPhotoReplacePicker') &&
    items.includes('data-photo-index') &&
    html.includes('openManageItemPhotoReplacePicker') &&
    html.includes('inp.dataset.photoIndex'),
  'Adding a fourth base photo should open a replace picker and pass the selected photo index to upload'
);

assert(
  items.includes('function setManageItemDetailSectionOpen') &&
    items.includes('function applyManageDetailSectionState') &&
    items.includes("setManageItemDetailSectionOpen(cat, name, 'photos', true)") &&
    html.includes('setManageItemDetailSectionOpenFromToggle'),
  'Photos detail section should remain open after add, replace, or remove photo actions'
);

assert(
    items.includes('item-photo-remove-btn') &&
    items.includes('function removeManageItemPhoto') &&
    items.includes("data-field=\"upgradePhoto\"") &&
    items.includes("setManageUpgradeOptionPhoto(item, 'legacy_upgrade', 'legacy_upgrade_option', dataUrl, requestedIndex)") &&
    items.includes('removeManageUpgradePhoto(cat, name, groupId, optionId, photoIndex)'),
  'Manage Items should allow removing base photos while keeping upgrade photos separate'
);
