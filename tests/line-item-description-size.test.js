const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
assert.match(html, /#lineItemDescription\s*\{\s*height: 9rem;\s*min-height: 4rem;\s*resize: vertical;\s*overflow: auto;/);
assert.match(html, /@media \(min-width: 992px\)\s*\{\s*#lineItemDescription\s*\{\s*height: 16rem;/);
assert.match(html, /<textarea id="lineItemDescription"[^>]*rows="6"/);
console.log('Description size defaults and manual resizing checks passed.');
