const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

assert(source.includes('@media (min-width: 769px)'), 'desktop Manage Items sizing should be scoped away from mobile');
assert(source.includes('#manageItemsModal .modal-dialog'), 'Manage Items modal should have dedicated dialog sizing');
assert(source.includes('width: 96vw !important;'), 'desktop Manage Items modal should nearly fill the viewport width');
assert(source.includes('height: 92vh;'), 'desktop Manage Items modal should nearly fill the viewport height');
assert(source.includes('#manageItemsModal .modal-body'), 'Manage Items modal body should have dedicated flex sizing');
assert(source.includes('display: flex;\n                flex-direction: column;'), 'Manage Items modal should use a column flex shell');
assert(source.includes('#manageItemsModal #customItemsList'), 'Manage Items item list should be explicitly sized');
assert(source.includes('max-height: none !important;'), 'desktop item list should override the old 460px inline cap');
assert(source.includes('max-width:96vw'), 'inline Manage Items fallback width should not keep the old 90vw cap');
assert(!source.includes('max-width:90vw;margin-left:auto;margin-right:auto;width:96%;'), 'Manage Items modal should not keep the old 90vw desktop cap');

console.log('manage items modal size static test passed');
