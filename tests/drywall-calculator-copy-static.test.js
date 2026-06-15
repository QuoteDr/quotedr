const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-calculators.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  builder.includes('id="drywallSheetSize"') &&
    builder.includes('<option value="32" selected>4x8 sheets</option>') &&
    builder.includes('<option value="36">4x9 sheets</option>') &&
    builder.includes('<option value="40">4x10 sheets</option>') &&
    builder.includes('<option value="48">4x12 sheets</option>'),
  'Drywall calculator should let the user choose 4x8, 4x9, 4x10, or 4x12 sheets'
);

assert(
  source.includes("document.getElementById('drywallSheetSize').value = '32';"),
  'Drywall calculator should default to 4x8 sheets when opened'
);

assert(
  source.includes("var sheetSqft = parseFloat(document.getElementById('drywallSheetSize').value) || 32;") &&
    source.includes('var sheetLabel = sheetSelect') &&
    source.includes('var sheets = Math.ceil(totalWithWaste / sheetSqft);'),
  'Drywall calculator should calculate sheet count from the selected sheet size'
);

assert(
  source.includes("Sheets of ' + sheetLabel + ' drywall"),
  'Drywall calculator results should show the selected sheet size'
);

assert(
  source.includes('Joint compound (4.5 gal buckets/17L boxes)'),
  'Drywall calculator should label joint compound as 4.5 gal buckets/17L boxes'
);

assert(
  !source.includes('Corner bead pieces') &&
    !source.includes('cornerBead'),
  'Drywall calculator should not estimate corner bead from square footage'
);

assert(
  source.includes('var tapeLinearFeet = Math.ceil(totalWithWaste * 0.4);') &&
    source.includes('var tapeRolls = Math.ceil(tapeLinearFeet / 500);'),
  'Drywall calculator should estimate paper tape as 400 linear feet per 1,000 sqft'
);

assert(
  source.includes('Paper tape (400 linear ft per 1,000 sqft)') &&
    source.includes('tapeLinearFeet.toLocaleString()') &&
    source.includes("' linear ft</strong>") &&
    source.includes("' @ 500ft)"),
  'Drywall calculator should show paper tape as linear feet with roll count context'
);

assert(
  source.includes('var drywallScrews = Math.ceil(totalWithWaste * 1.25);'),
  'Drywall calculator should estimate screws as 1,250 screws per 1,000 sqft'
);

assert(
  source.includes('<tr><td>Drywall screws</td>') &&
    source.includes('drywallScrews.toLocaleString()') &&
    source.includes("' screws</strong>"),
  'Drywall calculator should show drywall screws as a screw count, not pound boxes'
);
