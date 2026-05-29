const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  /replace\("\/quote-builder\\\(\\\.html\\\)\?\\\/\?\$\/,\s*'invoice-viewer\.html'\)/.test(builder) ||
    builder.includes("replace(/quote-builder(\\.html)?\\/?$/, 'invoice-viewer.html')"),
  'Invoice viewer base URL should point to invoice-viewer.html so local preview opens on the static server'
);

assert(
  builder.includes('function openCurrentInvoicePreview('),
  'Invoice modal should define a dedicated open invoice preview handler'
);

assert(
  builder.includes('onclick="openCurrentInvoicePreview(event)"'),
  'Open Invoice button should use the dedicated preview handler'
);

assert(
  builder.includes("window.open(invoiceUrl, '_blank')") &&
    builder.includes('window.location.href = invoiceUrl'),
  'Open Invoice handler should open a new tab and fall back to same-window navigation'
);
