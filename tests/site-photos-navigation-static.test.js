const fs = require('fs');
const path = require('path');
const assert = require('assert');

const viewer = fs.readFileSync(path.join(__dirname, '..', 'interactive-quote-viewer.html'), 'utf8');

assert(viewer.includes('function renderViewerSitePhotos'), 'Quote viewer should register each room site-photo collection');
assert(viewer.includes('function normalizeViewerLightboxPhotoList'), 'The shared lightbox should retain every site photo instead of applying the three-item line-photo limit');
assert(viewer.includes('data-viewer-photo-index'), 'Site-photo thumbnails should preserve the clicked photo index');
assert(viewer.includes('onclick="openViewerPhotoThumbnail(event, this)"'), 'Site-photo thumbnails should open the shared navigable lightbox');
assert(viewer.includes('openPhotoLightbox(entry.photos, entry.fallbacks, Number.isFinite(index) ? index : 0)'), 'Site photos should open at the clicked thumbnail');
assert(viewer.includes('${renderViewerSitePhotos(room.photos)}'), 'Room site photos should use the navigable thumbnail renderer');

console.log('site photo navigation static checks passed');
