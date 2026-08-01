const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const style = fs.readFileSync('quote-style.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  builder.includes('for="quoteScopePreviewLength">Scope preview length</label>') &&
    builder.includes('id="quoteScopePreviewLength" min="120" max="1200" step="20" value="400"') &&
    builder.includes('id="quoteScopePreviewLengthValue"'),
  'Send Quote Settings should expose a separate scope preview length slider'
);

assert(
  style.includes('scopePreviewLength: 400') &&
    style.includes("style.scopePreviewLength = normalizeScopePreviewLength(document.getElementById('quoteScopePreviewLength')") &&
    style.includes("setFieldValue('quoteScopePreviewLength', _quoteStyle.scopePreviewLength)") &&
    style.includes("'quoteDescriptionPreviewLength','quoteAlwaysShowFullDescriptions','quoteScopePreviewLength'"),
  'Scope preview length should persist with quote style and update the live preview'
);

assert(
  viewer.includes('function renderExpandableScopeNotes(text, id)') &&
    viewer.includes('var limit = parseInt(viewerStyle.scopePreviewLength, 10);') &&
    viewer.includes("renderExpandableScopeNotes(room.scopeNotes, 'room_scope_' + roomIdx)") &&
    viewer.includes('class="scope-description"'),
  'The client viewer should truncate long scope notes using the dedicated saved limit'
);

console.log('quote scope preview settings static checks passed');
