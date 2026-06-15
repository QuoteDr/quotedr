const fs = require('fs');
const path = require('path');

const viewer = fs.readFileSync(path.join(__dirname, '..', 'interactive-quote-viewer.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(viewer.includes('id="quoteStickyNav"'), 'quote viewer should include the sticky navigation shell');
assert(viewer.includes('id="quoteStickyNavToggle"'), 'quote viewer sticky navigation should include an expandable toggle');
assert(viewer.includes('id="quoteStickyNavRooms"'), 'quote viewer sticky navigation should include a room list container');
assert(viewer.includes('function updateQuoteStickyNav'), 'quote viewer should render sticky room navigation from quote rooms');
assert(viewer.includes('function toggleQuoteStickyNav'), 'quote viewer should expose a sticky nav toggle');
assert(viewer.includes('function jumpToQuoteTop'), 'quote viewer sticky navigation should support jumping to the top');
assert(viewer.includes('function jumpToQuoteBottom'), 'quote viewer sticky navigation should support jumping to the bottom');
assert(viewer.includes('updateQuoteStickyNav();'), 'room locator updates should refresh quote sticky navigation');
assert(viewer.includes('.quote-sticky-nav-panel'), 'quote viewer sticky navigation should have panel styling');
assert(viewer.includes('bottom: 22px'), 'quote viewer sticky navigation should sit in the bottom-right corner');
assert(viewer.includes('@media print'), 'quote viewer sticky navigation should be hidden from printed quotes');

console.log('quote viewer sticky navigation static test passed');
