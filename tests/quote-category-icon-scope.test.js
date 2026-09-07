const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-builder.html', 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const ctx = {
  categoryStyles: {Saved: {icon:'fa-tag', color:'#ffffff'}},
  pricingDatabase: {Saved: []},
  rooms: [{id:1,items:[]}, {id:2,items:[]}],
  CAT_ICONS: [{fa:'fa-tag'},{fa:'fa-hammer'}],
  writes:0, finishes:0, _pushUndo(){},
  saveCategoryStyle(){ ctx.writes++; },
  finishRoomBulkItemAction(){ ctx.finishes++; }
};
vm.createContext(ctx);
vm.runInContext(slice('function quoteCategoryStyleSnapshot()', 'function populateQuoteCategoryIcons()') + slice('function applyQuoteCategoryIcon(', 'function replaceQuoteCategoryOrder('), ctx);
ctx.applyQuoteCategoryIcon('Temporary','fa-hammer');
assert.equal(ctx.writes,0,'quote-only icons must not update the reusable database');
assert.equal(ctx.categoryStyles.Temporary,undefined);
assert.equal(ctx.quoteCategoryStyleSnapshot().Temporary.icon,'fa-hammer');
ctx.rooms=JSON.parse(JSON.stringify(ctx.rooms));
assert.equal(ctx.quoteCategoryStyleSnapshot().Temporary.icon,'fa-hammer','quote room serialization preserves icons');
ctx.applyQuoteCategoryIcon('Saved','fa-hammer');
assert.equal(ctx.writes,1,'saved category uses existing persistence');
assert.equal(ctx.categoryStyles.Saved.icon,'fa-hammer');
assert.equal(ctx.categoryStyles.Saved.color,'#ffffff');
ctx.applyQuoteCategoryIcon('Temporary','not-a-valid-icon');
assert.equal(ctx.finishes,2,'unknown icon rejected');
ctx.rooms=[{id:3,items:[]}];
assert.equal(ctx.quoteCategoryStyleSnapshot().Temporary,undefined,'a new quote must not inherit quote-only icons');
assert(source.includes('categoryStyles: JSON.parse(JSON.stringify(quoteCategoryStyleSnapshot()))'),'client snapshot includes local icons');
const save=slice('async function saveLineItemToDatabase()', 'function toggleDepositSection()');
assert(save.indexOf('await qdConfirm') < save.indexOf('customItems[category] = []'),'explicit promotion confirmation precedes database writes');
assert(save.indexOf('savedLocally = true') < save.indexOf('delete categorySelect.dataset.oneTimeCategory'),'category remains quote-only until a snapshot is saved');
assert(source.includes('saveNewItemBtn.disabled = !desc;'),'explicit save stays available for a quote-only category');
console.log('PASS: category icon scope, quote round-trip, saved persistence, invalid icons, explicit promotion');
