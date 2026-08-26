const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

assert(source.includes('@media (min-width: 769px)'), 'desktop Manage Items sizing should be scoped away from mobile');
assert(source.includes('#manageItemsModal .modal-dialog'), 'Manage Items modal should have dedicated dialog sizing');
assert(source.includes('width: 96vw !important;'), 'desktop Manage Items modal should nearly fill the viewport width');
assert(source.includes('height: 92vh;'), 'desktop Manage Items modal should nearly fill the viewport height');
assert(source.includes('#manageItemsModal .modal-body'), 'Manage Items modal body should have dedicated flex sizing');
assert(/display:\s*flex;\s*flex-direction:\s*column;/.test(source), 'Manage Items modal should use a column flex shell');
assert(source.includes('#manageItemsModal #customItemsList'), 'Manage Items item list should be explicitly sized');
assert(source.includes('max-height: none !important;'), 'desktop item list should override the old 460px inline cap');
assert(source.includes('max-width:96vw'), 'inline Manage Items fallback width should not keep the old 90vw cap');
assert(!source.includes('max-width:90vw;margin-left:auto;margin-right:auto;width:96%;'), 'Manage Items modal should not keep the old 90vw desktop cap');

const mobileStart = source.indexOf('@media (max-width: 768px)');
const portraitStart = source.indexOf('@media (max-width: 768px) and (orientation: portrait)', mobileStart);
assert(mobileStart >= 0 && portraitStart > mobileStart, 'Manage Items should have a dedicated mobile layout block');
const mobileCss = source.slice(mobileStart, portraitStart);
assert(
  /#manageItemsModal \.modal-content\s*\{[^}]*height:\s*100dvh;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s.test(mobileCss),
  'mobile Manage Items should use a viewport-height flex shell'
);
assert(
  /#manageItemsModal \.modal-body\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s.test(mobileCss),
  'mobile Manage Items body should remain vertically scrollable'
);
assert(
  /#manageItemsModal \.manage-items-row\s*\{[^}]*overflow:\s*visible;/s.test(mobileCss),
  'mobile item cards should not clip the Details dropdown'
);

const landscapeStart = source.indexOf('@media (max-height: 500px) and (orientation: landscape)');
const landscapeEnd = source.indexOf('/* Fix Google Places autocomplete', landscapeStart);
assert(landscapeStart >= 0 && landscapeEnd > landscapeStart, 'Manage Items should inherit the short landscape modal layout');
const landscapeCss = source.slice(landscapeStart, landscapeEnd);
assert(
  landscapeCss.includes('#manageItemsModal .modal-body') &&
    landscapeCss.includes('max-height: none;') &&
    landscapeCss.includes('overflow-y: auto;'),
  'short landscape Manage Items should keep the item list reachable by scrolling'
);

console.log('manage items modal size static test passed');
