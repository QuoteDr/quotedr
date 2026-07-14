const fs = require('fs');
const path = require('path');
const assert = require('assert');

const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

assert(builder.includes('function openRoomPhotoLightbox'), 'Room thumbnails should open their complete room photo gallery');
assert(builder.includes('onclick="openRoomPhotoLightbox(event,'), 'Each room thumbnail should preserve its clicked photo index');
assert(builder.includes('quoteBuilderPhotoLightboxPrev'), 'Room photo galleries should include a previous-photo control');
assert(builder.includes('quoteBuilderPhotoLightboxNext'), 'Room photo galleries should include a next-photo control');
assert(builder.includes('quoteBuilderPhotoLightboxCounter'), 'Room photo galleries should show the current photo position');
assert(builder.includes("prev.style.display = total > 1 ? 'block' : 'none'"), 'Gallery controls should remain hidden for single photos');
assert(builder.includes("event.key === 'ArrowRight'"), 'Room photo galleries should support keyboard navigation');
assert(builder.includes("lb.addEventListener('touchend'"), 'Room photo galleries should support mobile swipe navigation');

console.log('quote builder room photo navigation static checks passed');
