const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(ctx, file, from, to) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), ctx);
}
const ctx = vm.createContext({
  rooms: [{quoteCategoryStyles: {DESIGN: {icon:'fa-drafting-compass'}, 'SITE PREPARATION': {icon:'fa-shield-alt'}}}],
  categoryStyles: {DESIGN: {icon:'fa-tag', color:'#eee'}},
  localStorage: {getItem: () => '{}'}, window: {}, quoteStudioMode: false,
  canonicalCat: value => value, escapeHtml: value => value,
  QUOTE_VIEWER_CUSTOM_CATEGORY_ICONS: {}
});
load(ctx, 'quote-storage.js', 'function getQuoteCategoryStylesSnapshot()', 'function quoteStorageEditTime(');
const snapshot = ctx.getQuoteCategoryStylesSnapshot();
assert.equal(snapshot.DESIGN.icon, 'fa-drafting-compass');
assert.equal(snapshot.DESIGN.color, '#eee');
assert.equal(ctx.categoryStyles.DESIGN.icon, 'fa-tag', 'quote-only icons must not change the reusable database');
load(ctx, 'interactive-quote-viewer.html', 'function quoteViewerCategoryStyle(', 'function normalizeQuoteDividerLabel(');
load(ctx, 'invoice-viewer.html', 'function invoiceCategoryStyle(', 'function invoiceCategoryBackground(');
for (const topLevel of [{}, ctx.categoryStyles, snapshot]) {
  // Real JSON round-trip, without owner localStorage, for old and new snapshots.
  const data = JSON.parse(JSON.stringify({rooms: ctx.rooms, categoryStyles: topLevel}));
  const before = JSON.stringify(data);
  ctx.quoteData = data;
  ctx.invoiceData = data;
  assert(ctx.quoteViewerCategoryIconMarkup('DESIGN').includes('fa-drafting-compass'));
  assert(ctx.quoteViewerCategoryIconMarkup('site preparation').includes('fa-shield-alt'));
  assert.equal(ctx.invoiceCategoryStyle('SITE PREPARATION').icon, 'fa-shield-alt');
  assert.equal(JSON.stringify(data), before, 'viewing must not mutate the document');
}
ctx.quoteData = {categoryStyles:{DEMOLITION:{icon:'fa-trash'}}};
assert(ctx.quoteViewerCategoryIconMarkup('DEMOLITION').includes('fa-trash'));
assert(ctx.quoteViewerCategoryIconMarkup('Unknown').includes('fa-tag'));
console.log('Client category icons: old/new snapshots, room overrides, JSON round-trip and fallbacks passed');
