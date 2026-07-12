const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex !== -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex) : source.length;
  assert(endIndex !== -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const manageUpgradeOption = sliceBetween(items, 'function normalizeManageUpgradeOption', 'function normalizeManageItemUpgradeGroups');
assert(manageUpgradeOption.includes('photo:'), 'Manage Items upgrade options should preserve attached upgrade option photos');

const manageChoiceEnhancement = sliceBetween(items, 'function normalizeChoiceGroupEnhancementOption', 'function normalizeChoiceGroupEnhancementGroup');
assert(manageChoiceEnhancement.includes('photo:'), 'Manage Items choice group enhancement options should preserve photos');

const quoteUpgradeOption = sliceBetween(builder, 'function normalizeQuoteItemUpgradeOption', 'function isQuoteItemConsultationUpgradeOption');
assert(quoteUpgradeOption.includes('photo:'), 'Quote builder upgrade option normalization should preserve photos');

const quoteChoiceEnhancement = sliceBetween(builder, 'function normalizeChoiceGroupEnhancementOption', 'function normalizeChoiceGroupEnhancementGroups');
assert(quoteChoiceEnhancement.includes('photo:'), 'Quote builder choice group enhancement option normalization should preserve photos');

const savedItemFingerprint = sliceBetween(builder, 'function getSavedItemFingerprintForQuoteSync', 'function savedItemQuoteSource');
assert(savedItemFingerprint.includes('photo: item.upgrade.photo'), 'Saved item sync fingerprints should include legacy upgrade photos');
assert(savedItemFingerprint.includes('photo: option.photo'), 'Saved item sync fingerprints should include upgrade option photos');

const choiceHydration = sliceBetween(builder, 'function hydrateChoiceGroupOptionsFromSavedItems', 'function getQuoteItemChoiceGroupKeys');
assert(choiceHydration.includes('next.photo = saved.photo'), 'Choice group hydration should carry saved item photos onto choice options');

const quoteItemHydration = sliceBetween(builder, 'function hydrateQuoteLineItemPhotoFromSavedItem', 'function buildSavedItemFromEditedLineItem');
assert(quoteItemHydration.includes('findSavedItemForQuoteEdit'), 'Existing quote line photo hydration should use the saved item lookup');
assert(quoteItemHydration.includes('item.photo = saved.photo'), 'Existing quote line photo hydration should copy missing saved item photos');
assert(builder.includes('hydrateQuoteLineItemPhotoFromSavedItem(item);'), 'Quote builder rendering should hydrate missing saved item photos before showing row actions');

const confirmAddLine = sliceBetween(builder, 'async function confirmAddLine', 'function saveLineItemToDatabase');
assert(confirmAddLine.includes('photo: dbItem?.photo'), 'New quote lines added from saved items should copy the saved item photo');
assert(confirmAddLine.includes('item.photo = savedItemForEdit.photo'), 'Existing quote lines refreshed from saved items should copy the saved item photo');
assert(confirmAddLine.includes('item.photo = savedUpdateResult.item.photo'), 'Existing quote lines refreshed after updating a saved item should copy the updated saved item photo');

assert(builder.includes('quote-line-photo-btn'), 'Quote builder rows should render a compact line item photo button');
assert(builder.includes('openQuoteLineItemPhoto'), 'Quote builder should open line item photos without inline data URLs');

const viewerUpgradeOption = sliceBetween(viewer, 'function normalizeViewerItemUpgradeOption', 'function isViewerConsultationUpgradeOption');
assert(viewerUpgradeOption.includes('photo:'), 'Client viewer upgrade option normalization should preserve photos');

const viewerChoiceEnhancement = sliceBetween(viewer, 'function normalizeViewerChoiceGroupEnhancementOption', 'function normalizeViewerChoiceGroupEnhancementGroups');
assert(viewerChoiceEnhancement.includes('photo:'), 'Client viewer choice enhancement option normalization should preserve photos');

assert(viewer.includes('renderViewerPhotoButton'), 'Client viewer should render reusable compact photo buttons');
assert(viewer.includes('data-viewer-photo-key'), 'Client viewer photo buttons should use photo keys instead of inline data URLs');
assert(viewer.includes('Picture'), 'Client viewer should label compact line item photo buttons as Picture');
assert(viewer.includes('Upgrade Picture'), 'Client viewer should label upgrade option photo buttons clearly');
assert(viewer.includes('function normalizeViewerPhotoList'), 'Client viewer should normalize multi-photo arrays with legacy single-photo fallback');
assert(viewer.includes('viewerPhotoRegistry[key] = photos'), 'Client viewer photo registry should store photo arrays for lightbox navigation');
assert(viewer.includes('viewer-line-photo-actions'), 'Client viewer should render line item photo buttons in a separate action row');
assert(viewer.includes('viewer-line-title-actions'), 'Client viewer should place standard line item photo buttons beside the line item title area');
assert(viewer.includes('viewer-choice-option-photo-actions'), 'Client viewer should give choice option photo buttons a protected action row before upgrade panels');
assert(viewer.includes('choice-option-with-photo'), 'Client viewer should position choice option photo buttons inside the option card area instead of below the card');
assert(viewer.includes('function showViewerPhotoAt'), 'Client viewer lightbox should support switching between registered photos');
assert(viewer.includes('viewerPhotoLightboxPrev'), 'Client viewer lightbox should render a previous-photo control');
assert(viewer.includes('viewerPhotoLightboxNext'), 'Client viewer lightbox should render a next-photo control');
assert(viewer.includes('viewerPhotoLightboxCounter'), 'Client viewer lightbox should render a current photo counter');
assert(viewer.includes('touchstart') && viewer.includes('touchend'), 'Client viewer lightbox should support mobile swipe navigation');

console.log('line item photo static checks passed');
