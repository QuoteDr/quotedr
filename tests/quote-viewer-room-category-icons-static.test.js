const fs = require('fs');
const assert = require('assert');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');

const mainScriptMarker = viewer.indexOf('let quoteData = {}');
const mainScriptStart = viewer.lastIndexOf('<script>', mainScriptMarker);
const mainScriptEnd = viewer.indexOf('</script>', mainScriptMarker);
assert(mainScriptStart >= 0 && mainScriptEnd > mainScriptStart, 'Client viewer main script should be present');
assert.doesNotThrow(
  () => new Function(viewer.slice(mainScriptStart + '<script>'.length, mainScriptEnd)),
  'Client viewer icon rendering changes should remain valid JavaScript'
);

assert(
  storage.includes('rooms: sanitizeQuoteRoomsForSave(rooms)') &&
    storage.includes('function getQuoteCategoryStylesSnapshot()') &&
    storage.includes("localStorage.getItem('ald_category_styles')") &&
    storage.includes('categoryStyles: getQuoteCategoryStylesSnapshot()'),
  'Saved quote data should preserve room icons and the category style snapshot'
);

assert(
  viewer.includes('function quoteRoomIconClass(room)') &&
    viewer.includes('<i class="${quoteRoomIconClass(room)}"></i> ${escapeHtml(room.name)}'),
  'Client quote room headers should render each saved room icon'
);

assert(
  viewer.includes('function quoteViewerCategoryStyle(catName)') &&
    viewer.includes('quoteData && quoteData.categoryStyles') &&
    viewer.includes("localStorage.getItem('ald_category_styles')") &&
    viewer.includes('normalizedCanonicalKey') &&
    viewer.includes('function quoteViewerCategoryIconMarkup(catName)') &&
    viewer.includes('quoteViewerCategoryIconMarkup(catName) + catDisplay'),
  'Client quote category headers should resolve and render saved category icons'
);

assert(
  viewer.includes("'qd-drywall-knife'") &&
    viewer.includes("'qd-roof-shingles'") &&
    viewer.includes("'qd-deck-boards'") &&
    viewer.includes("'qd-fence-gate'"),
  'Client quote category icons should support QuoteDr custom SVG selections'
);

assert(
  !viewer.includes('<h5 class="mb-0"><i class="fas fa-th"></i> ${escapeHtml(room.name)}</h5>') &&
    !viewer.includes('<i class="fas fa-tag me-1"></i>${catDisplay}'),
  'Client quote headers should not hard-code fallback icons when saved choices exist'
);

const categoryStyleFunctionSource = viewer.slice(
  viewer.indexOf('function quoteViewerCategoryStyle(catName)'),
  viewer.indexOf('function quoteViewerCategoryIconMarkup(catName)')
);
const resolveCategoryStyle = new Function(
  'quoteData',
  'window',
  'localStorage',
  'canonicalCat',
  'quoteStudioMode',
  'isContractorPreviewView',
  categoryStyleFunctionSource + '; return quoteViewerCategoryStyle;'
)(
  { categoryStyles: {} },
  { _quoteRow: null },
  { getItem: () => JSON.stringify({ landscape: { icon: 'fa-seedling' } }) },
  (category) => category,
  false,
  () => true
);
assert.strictEqual(
  resolveCategoryStyle('LANDSCAPE').icon,
  'fa-seedling',
  'Owner previews should recover locally saved category icons despite case differences'
);

const snapshotFunctionSource = storage.slice(
  storage.indexOf('function getQuoteCategoryStylesSnapshot()'),
  storage.indexOf('function collectQuoteData()')
);
const getCategoryStylesSnapshot = new Function(
  'localStorage',
  'categoryStyles',
  snapshotFunctionSource + '; return getQuoteCategoryStylesSnapshot;'
)(
  { getItem: () => JSON.stringify({ Landscape: { icon: 'fa-seedling' } }) },
  { Demolition: { icon: 'fa-hammer' } }
);
assert.deepStrictEqual(
  getCategoryStylesSnapshot(),
  {
    Landscape: { icon: 'fa-seedling' },
    Demolition: { icon: 'fa-hammer' }
  },
  'Outgoing quote snapshots should merge saved and currently loaded category icons'
);

console.log('quote viewer room and category icon static checks passed');
