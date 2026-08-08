const fs = require('fs');
const path = require('path');

const quoteStyle = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const quoteBuilder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const clientPortal = fs.readFileSync(path.join(__dirname, '..', 'client-portal.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  quoteStyle.includes("_base + 'interactive-quote-viewer.html'"),
  'contractor quote preview should target the actual interactive quote viewer HTML file'
);
assert(
  quoteStyle.includes("previewUrl.searchParams.set('preview', '1')") &&
    quoteStyle.includes("previewUrl.searchParams.set('admin_preview', '1')"),
  'contractor preview should use the authenticated admin-preview route'
);
assert(
  !quoteBuilder.includes("_base + 'interactive-quote-viewer.html?'"),
  'the builder should not rebuild a standalone secure quote URL'
);
assert(
  clientPortal.includes("interactive-quote-viewer.html?id=") &&
    clientPortal.includes("portal_anchor=") &&
    clientPortal.includes("token="),
  'the portal may still construct token-scoped internal viewer URLs for its documents'
);

console.log('interactive quote viewer URL static test passed');
