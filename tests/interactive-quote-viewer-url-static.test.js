const fs = require('fs');
const path = require('path');

const quoteStyle = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const quoteBuilder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  quoteStyle.includes("_base + 'interactive-quote-viewer.html'"),
  'quote link generation should target the actual interactive quote viewer HTML file'
);
assert(
  quoteBuilder.includes("_base + 'interactive-quote-viewer.html?'"),
  'rebuilt secure quote URLs should target the actual interactive quote viewer HTML file'
);
assert(
  !quoteStyle.includes("_base + 'interactive-quote-viewer',"),
  'quote-style.js should not generate extensionless interactive quote viewer URLs'
);
assert(
  !quoteBuilder.includes("_base + 'interactive-quote-viewer?'"),
  'quote-builder.html should not rebuild extensionless interactive quote viewer URLs'
);

console.log('interactive quote viewer URL static test passed');
