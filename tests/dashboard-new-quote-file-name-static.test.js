const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="newQuoteFileName"') &&
    /File Name/.test(dashboard),
  'Start a New Quote modal should include a file name field'
);

assert(
  /document\.getElementById\('newQuoteFileName'\)\.value\s*=\s*''/.test(dashboard),
  'Opening the new quote modal should reset the file name field'
);

assert(
  /var quoteTitle\s*=\s*document\.getElementById\('newQuoteFileName'\)\.value\.trim\(\)/.test(dashboard),
  'New quote creation should read the file name field'
);

assert(
  /quoteTitle:\s*quoteTitle/.test(dashboard) &&
    /title:\s*quoteTitle/.test(dashboard),
  'New quote payload should save the file name into quote title fields'
);

assert(
  /data:\s*\{[\s\S]*quoteTitle:\s*quoteTitle[\s\S]*title:\s*quoteTitle/.test(dashboard),
  'New quote data should preserve the file name for dashboard and builder reloads'
);

assert(
  /\['newQuoteClientName','newQuoteAddress','newQuoteClientEmail','newQuoteClientPhone','newQuoteNumber','newQuoteFileName'\]/.test(dashboard),
  'File name input should participate in Enter-to-create behavior'
);

console.log('dashboard new quote file name static test passed');
