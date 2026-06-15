const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('Press Scan Quote below to scan your quote and calculate how much drywall you need.'),
  'Drywall scan tab should show idle instructions before the user scans'
);

assert(
  !source.includes('Scanning quote for Drywall items...'),
  'Drywall scan tab should not show a loading message before Scan Quote is pressed'
);
