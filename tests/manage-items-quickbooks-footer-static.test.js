const fs = require('fs');
const assert = require('assert');

const quoteBuilder = fs.readFileSync('quote-builder.html', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');

assert(
  quoteBuilder.includes('id="manageItemsQuickBooksFooterBtn"'),
  'Manage Items footer should include a QuickBooks button'
);

assert(
  quoteBuilder.includes('href="settings.html#integrations"'),
  'QuickBooks footer button should link directly to the Settings integrations tab'
);

assert(
  quoteBuilder.includes('QuickBooks'),
  'QuickBooks footer button should have a clear label'
);

assert(
  settings.includes('window.location.hash') && settings.includes("replace(/^#/, '')"),
  'Settings page should read the URL hash to open a specific tab'
);

assert(
  settings.includes("'integrations'"),
  'Settings hash handling should allow the integrations tab'
);
