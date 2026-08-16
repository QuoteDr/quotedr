const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  source.includes('.viewer-line-summary') &&
    source.includes('grid-template-columns: minmax(0, 1fr) minmax(140px, max-content)'),
  'Line item summaries should define independent copy and price columns'
);

assert(
  source.includes('.viewer-line-copy') &&
  source.includes('.viewer-line-title') &&
    source.includes('.viewer-line-price') &&
    source.includes('.viewer-line-description'),
  'Line item copy, title, price, and description styles should be defined'
);

assert(
  source.includes('<div class="viewer-line-copy">') &&
    source.includes('<div class="viewer-line-description">') &&
    source.includes('${renderExpandableDescription(displayDesc, `itemdesc_${roomIdx}_${itemIndex}`)}'),
  'Expandable descriptions should render directly beneath the title inside the left summary column'
);

assert(
  !source.includes('class="d-flex justify-content-between align-items-baseline mb-1"'),
  'The legacy flex row should not force descriptions below tall discount details'
);

assert(
  source.includes('@media (max-width: 575.98px)') &&
    source.includes('grid-template-columns: minmax(0, 1fr)') &&
    source.includes('row-gap: 0.35rem'),
  'Phone layouts should stack pricing beneath the full-width title and description'
);

console.log('quote viewer line description layout static test passed');
