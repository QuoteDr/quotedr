const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const style = fs.readFileSync('quote-style.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  builder.includes('id="quoteDescriptionPreviewLength" min="120" max="600" step="20" value="260"') &&
    builder.includes('id="quoteDescriptionPreviewLengthValue"') &&
    builder.includes('id="quoteAlwaysShowFullDescriptions"'),
  'Client View settings should expose a 260-character default slider and a full-description switch'
);

assert(
  style.includes('descriptionPreviewLength: 260') &&
    style.includes('alwaysShowFullDescriptions: false') &&
    style.includes("style.descriptionPreviewLength = normalizeDescriptionPreviewLength(document.getElementById('quoteDescriptionPreviewLength')") &&
    style.includes("style.alwaysShowFullDescriptions = document.getElementById('quoteAlwaysShowFullDescriptions')?.checked === true"),
  'Description settings should use the existing cutoff as their default and be read into quote style'
);

assert(
  style.includes("setFieldValue('quoteDescriptionPreviewLength', _quoteStyle.descriptionPreviewLength)") &&
    style.includes("setFieldValue('quoteAlwaysShowFullDescriptions', _quoteStyle.alwaysShowFullDescriptions)") &&
    style.includes("'quoteDescriptionPreviewLength','quoteAlwaysShowFullDescriptions'") &&
    style.includes('slider.disabled = alwaysShowFull'),
  'Saved description settings should restore into controls and update the live preview'
);

assert(
  viewer.includes('var viewerStyle = resolveViewerDocumentStyle();') &&
    viewer.includes('var limit = parseInt(viewerStyle.descriptionPreviewLength, 10);') &&
    viewer.includes('if (!isFinite(limit)) limit = 260;') &&
    viewer.includes('viewerStyle.alwaysShowFullDescriptions === true || raw.length <= limit'),
  'The client viewer should honor the selected cutoff while preserving 260 for older quotes'
);

console.log('quote description preview settings static checks passed');
