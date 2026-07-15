const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(builder.includes('function toggleOptionalItemDefault'), 'builder should let the contractor change an optional item default');
assert(builder.includes('optionalSelectedByDefault'), 'builder should persist the optional item default in quote JSON');
assert(builder.includes("optionalSelectedByDefault ? 'Added' : 'Not Added'"), 'builder should clearly show the selected default');
assert(builder.includes('function quoteOptionalItemIncludedByDefault'), 'builder should centralize whether an add-on belongs in the starting total');
assert(builder.includes('quoteOptionalItemIncludedByDefault(item) ? sum + itemChargedTotal(item) : sum'), 'builder totals should exclude add-ons that start unselected');
assert(viewer.includes('function toggleViewerOptionalItem'), 'viewer should let clients select optional add-ons');
assert(viewer.includes("optionalSelected ? 'Added to Quote' : 'Add to Quote'"), 'viewer should use positive add-on wording');
assert(!viewer.includes('Remove this item'), 'viewer should not describe optional add-ons as removals');

const helperStart = viewer.indexOf('function viewerOptionalItemDefaultSelected');
const helperEnd = viewer.indexOf('function qvLineRate', helperStart);
const helperSource = viewer.slice(helperStart, helperEnd);
assert(helperStart !== -1 && helperEnd > helperStart, 'viewer should centralize optional item state normalization');
const sandbox = {};
vm.runInNewContext(`${helperSource}; this.syncViewerOptionalItemState = syncViewerOptionalItemState; this.viewerOptionalItemChangedFromDefault = viewerOptionalItemChangedFromDefault;`, sandbox);

const legacy = { optional: true };
assert.strictEqual(sandbox.syncViewerOptionalItemState(legacy), true, 'legacy optional items should remain selected by default');
assert.strictEqual(legacy._removed, false, 'legacy optional items should remain in totals');

const startsUnselected = { optional: true, optionalSelectedByDefault: false };
assert.strictEqual(sandbox.syncViewerOptionalItemState(startsUnselected), false, 'new add-ons can start unselected');
assert.strictEqual(startsUnselected._removed, true, 'unselected add-ons should be excluded from totals');

const savedClientChoice = { optional: true, optionalSelectedByDefault: false, _optionalSelected: true };
assert.strictEqual(sandbox.syncViewerOptionalItemState(savedClientChoice), true, 'a saved client choice should override the quote default');
assert.strictEqual(savedClientChoice._removed, false, 'a selected add-on should be included in totals');
assert.strictEqual(sandbox.viewerOptionalItemChangedFromDefault(savedClientChoice), true, 'adding a default-off item should be tracked as a client change');

const untouchedDefaultOff = { optional: true, optionalSelectedByDefault: false };
sandbox.syncViewerOptionalItemState(untouchedDefaultOff);
assert.strictEqual(sandbox.viewerOptionalItemChangedFromDefault(untouchedDefaultOff), false, 'an untouched default-off add-on should not be called a client removal');

console.log('optional line item add-ons static test passed');

