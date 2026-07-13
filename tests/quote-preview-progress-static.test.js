const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const style = fs.readFileSync('quote-style.js', 'utf8');

assert(
  builder.includes('.quote-generation-progress') &&
    builder.includes('.quote-generation-progress-title') &&
    builder.includes('.quote-generation-progress-detail'),
  'Quote generation should have a prominent on-screen progress card'
);

assert(
  style.includes('function showQuoteGenerationProgress(') &&
    style.includes("panel.setAttribute('role', 'status')") &&
    style.includes("panel.setAttribute('aria-live', 'assertive')") &&
    style.includes('Uploading photos and building the client view.') &&
    style.includes('Quotes with photos may take a little longer.'),
  'The progress card should immediately explain that photo processing can take longer'
);

assert(
  style.includes("showQuoteGenerationProgress(generateBtn, 'Generating your quote...')") &&
    style.includes("showQuoteGenerationProgress(null, 'Preparing your preview...')") &&
    style.includes('function hideQuoteGenerationProgress()'),
  'Quote generation and preview should share the same progress feedback lifecycle'
);

console.log('quote preview progress static checks passed');
