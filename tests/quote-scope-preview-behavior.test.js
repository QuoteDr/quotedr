const fs = require('fs');
const assert = require('assert');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const start = viewer.indexOf('        function renderExpandableScopeNotes(text, id) {');
const end = viewer.indexOf('        function viewerDescriptionKey(value) {', start);

assert(start >= 0 && end > start, 'scope preview renderer should be extractable');

const source = viewer.slice(start, end);
const buildRenderer = new Function(
  'resolveViewerDocumentStyle',
  'formatDescriptionText',
  source + '\nreturn renderExpandableScopeNotes;'
);

function renderWithStyle(style, text) {
  const render = buildRenderer(
    () => style,
    (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  );
  return render(text, 'room_scope_0');
}

const shortScope = 'Install the new vanity and reconnect the plumbing.';
assert(!renderWithStyle({ scopePreviewLength: 120 }, shortScope).includes('Show more'), 'short scopes should remain fully visible');

const longScope = Array(50).fill('Detailed scope item').join(' ');
const collapsed = renderWithStyle({ scopePreviewLength: 120 }, longScope);
assert(collapsed.includes('id="room_scope_0_short"'), 'long scopes should include a short preview');
assert(collapsed.includes('id="room_scope_0_full"'), 'long scopes should preserve the full text');
assert(collapsed.includes('Show more'), 'long scopes should expose the expansion control');

assert(
  renderWithStyle({ scopePreviewLength: 1000 }, longScope).includes('Show more') === false,
  'a longer selected limit should keep the same scope expanded'
);

const legacyScope = Array(90).fill('Legacy scope').join(' ');
assert(renderWithStyle({}, legacyScope).includes('Show more'), 'older quotes should use the 400-character fallback');
assert(renderWithStyle({ scopePreviewLength: 120, alwaysShowFullDescriptions: true }, longScope).includes('Show more'), 'scope length should remain independent from the line-description switch');

console.log('quote scope preview behavior checks passed');
