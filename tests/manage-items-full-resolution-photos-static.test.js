const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');
const migrationPath = path.join(root, 'supabase/migrations/20260712090000_item_full_res_photos.sql');
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex !== -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex) : source.length;
  assert(endIndex !== -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

assert(
  items.includes('MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024') &&
    items.includes('function getManageFullResPhotoUsageBytes') &&
    items.includes('function canAddManageFullResPhotoBytes') &&
    items.includes('allowed: nextUsageBytes <= MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES'),
  'Manage Items should enforce a 10 GB account-level full-resolution photo quota'
);

assert(
  items.includes('async function uploadManageFullResPhoto') &&
    items.includes("storage.from(MANAGE_FULL_RES_PHOTO_BUCKET).upload") &&
    items.includes('getPublicUrl(path)'),
  'Manage Items should upload originals to Supabase Storage for signed-in users'
);

const uploadBlock = sliceBetween(items, 'async function uploadManageFullResPhoto', 'function removeManageFullResPhotoMeta');
assert(
  !uploadBlock.includes("hasFeature('full_resolution_photos')") &&
    !uploadBlock.includes('manageCanUseFullResPhotos') &&
    uploadBlock.includes('getCurrentUser') &&
    uploadBlock.includes("throw new Error('Sign in to retain full-resolution photos.')"),
  'Full-resolution retention should not require Pro; upload should only require authentication and quota'
);

assert(
  items.includes("Full-resolution photo storage is not set up yet. The compressed thumbnail was saved.") &&
    items.includes('/bucket not found|not found/i.test'),
  'Bucket-missing failures should fall back to compressed thumbnails with a clear setup message'
);

assert(
  items.includes('photosFull') &&
    items.includes('photoFull') &&
    items.includes('normalizeManageItemPhotosFull') &&
    items.includes('syncManageItemPhotoCompatibility') &&
    items.includes('setManageUpgradeOptionPhotoFull'),
  'Manage Items should preserve full-resolution metadata for base item and upgrade photos'
);

assert(
  items.includes('Upgrade to Pro to show full resolution') &&
    items.includes("feature=' + encodeURIComponent(MANAGE_FULL_RES_PHOTO_FEATURE)") &&
    items.includes("MANAGE_FULL_RES_PHOTO_FEATURE = 'full_resolution_photos'"),
  'Basic and Standard users should see a Pro upgrade note near photo controls without implying originals were not retained'
);

assert(
  items.includes('function openManageItemPhotoLightbox') &&
    items.includes('data-full-photo') &&
    items.includes('manageFullResPhotoUrl') &&
    !items.includes('onclick="openPhotoLightbox(this.src)"'),
  'Manage Items thumbnails should open photoFull for Pro users instead of always using compressed thumbnail src'
);

assert(
  builder.includes('photoFull: item.photoFull') &&
    builder.includes('photosFull: Array.isArray(item.photosFull)') &&
    builder.includes('photoFull: option.photoFull') &&
    builder.includes('item.photoFull = saved.photoFull'),
  'Quote builder should carry full-resolution photo metadata from saved items into quote lines and upgrades'
);

assert(
  viewer.includes('function normalizeViewerPhotoFullList') &&
    viewer.includes('registerViewerPhoto(src, fullSrc)') &&
    viewer.includes('viewerPhotoRegistry[key] = photos') &&
    viewer.includes('openPhotoLightbox(photos)') &&
    viewer.includes('renderViewerPhotoButton(option.photo') &&
    viewer.includes('option.photoFull') &&
    viewer.includes('getViewerItemPhotoFullList(item)') &&
    viewer.includes('photoFull: option.photoFull') &&
    viewer.includes('function viewerFullResolutionPhotosEnabled') &&
    viewer.includes('quoteData.fullResolutionPhotosEnabled === true') &&
    viewer.includes('adminPreviewFullResolutionPhotosEnabled'),
  'Client viewer should open full-resolution URLs when quote payload enables them, with Pro admin preview fallback'
);

assert(
  builder.includes('async function quoteBuilderFullResolutionPhotosEnabled') &&
    builder.includes("hasFeature('full_resolution_photos')") &&
    builder.includes('await quoteBuilderFullResolutionPhotosEnabled()'),
  'Quote builder photo preview should also gate full-resolution display by Pro access'
);

assert(
  supabase.includes('async function quoteFullResolutionPhotosEnabledForSave') &&
    supabase.includes("hasFeature('full_resolution_photos')") &&
    supabase.includes('fullResolutionPhotosEnabled: await quoteFullResolutionPhotosEnabledForSave()') &&
    supabase.includes('quoteData.fullResolutionPhotosEnabled = await quoteFullResolutionPhotosEnabledForSave()'),
  'Quote save/share payloads should stamp a render-time full-resolution access flag'
);

assert(
  migration.includes("item-full-res-photos") &&
    migration.includes("public = true") &&
    migration.includes("storage.objects") &&
    migration.includes("auth.uid()::text = (storage.foldername(name))[1]") &&
    migration.includes("quotedr_item_full_res_photo_usage_bytes") &&
    migration.includes("<= 10737418240"),
  'Supabase migration should create a public-read bucket with owner-scoped 10 GB write policies'
);

console.log('manage items full-resolution photo static checks passed');
