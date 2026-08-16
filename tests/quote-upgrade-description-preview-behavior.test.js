const fs = require('fs');
const assert = require('assert');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const start = viewer.indexOf('        function renderExpandableUpgradeDescription(text, id) {');
const end = viewer.indexOf('        function viewerDescriptionKey(value) {', start);

assert(start >= 0 && end > start, 'upgrade-description preview renderer should be extractable');

const source = viewer.slice(start, end);
const buildRenderer = new Function(
  'resolveViewerDocumentStyle',
  'formatDescriptionText',
  source + '\nreturn renderExpandableUpgradeDescription;'
);

function renderWithStyle(style, text) {
  const render = buildRenderer(
    () => style,
    (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  );
  return render(text, 'upgrade_description_0');
}

const longDescription = Array(60).fill('Premium upgrade detail').join(' ');
const shortened = renderWithStyle({ upgradeDescriptionPreviewLength: 120 }, longDescription);
assert(shortened.includes('id="upgrade_description_0_short"'), 'selected upgrade limit should produce a short preview');
assert(shortened.includes('Show more'), 'a long upgrade description should remain expandable');

assert(
  !renderWithStyle({ upgradeDescriptionPreviewLength: 600 }, longDescription.slice(0, 500)).includes('Show more'),
  'a longer upgrade limit should show a matching description in full'
);

assert(
  renderWithStyle({ descriptionPreviewLength: 120 }, longDescription).includes('Show more'),
  'older quotes should fall back to their existing description preview length'
);

assert(
  !renderWithStyle({ upgradeDescriptionPreviewLength: 120, alwaysShowFullDescriptions: true }, longDescription).includes('Show more'),
  'the existing full-description preference should remain compatible with upgrade descriptions'
);

console.log('quote upgrade description preview behavior checks passed');
