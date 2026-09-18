const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ctx = {window:{}};
vm.createContext(ctx); vm.runInContext(fs.readFileSync('quote-find.js','utf8'),ctx);
const search = ctx.window.QuoteDrQuoteFind.search;
const rooms = [{id:1,name:'Basement',items:[{description:'Pot lights',category:'Electrical',itemDescription:'Install six recessed fixtures',notes:'Dimmer by stairs'},{description:'Drywall',itemDescription:'Paint-ready finish'}]}];
const before = JSON.stringify(rooms);
assert.equal(search(rooms,'BASEMENT lights').length,1);
assert.equal(search(rooms,'six fixtures')[0].title,'Pot lights');
assert.equal(search(rooms,'stairs')[0].index,0);
assert.equal(search(rooms,'basement electrical')[0].index,0);
assert.equal(search(rooms,'lights drywall').length,0);
assert.equal(search(rooms,'   ').length,0);
assert.equal(search([], 'lights').length,0);
assert.equal(JSON.stringify(rooms),before);
console.log('Quote find names, scope, notes, categories and read-only tests passed');
Object.assign(ctx.window, {
 isQuotePriceTbd: item => item.priceTbd,
 qdFormatMoney: n => '$' + n.toFixed(2),
 quoteItemMarkedAmount: (room,item,n) => n * (1 + (room.markup || 0)/100),
 itemChargedTotal: item => item.quantity * item.rate - (item.discount || 0),
 qdDiscounts: () => ({activeRate:item => item.rate}),
 quoteOptionalItemIncludedByDefault: item => !item.excluded,
 coDisplayLineAmount: () => -50
});
const values = ctx.window.QuoteDrQuoteFind.valuesText;
const sample = {quantity:462.5,unitType:'sq ft',rate:2,discount:25};
assert.match(values({markup:10},sample), /Quantity: 462.5 sq ft.*\$2.20.*\$990.00/);
assert.match(values({}, {...sample,quantity:0,priceTbd:true,excluded:true}), /Quantity: 0.*Price TBD.*Not included/);
assert.match(values({}, {...sample,quantity:null}), /Quantity: Not set/);
ctx.window._quoteDocumentType='change_order';
assert.match(values({},sample), /Line total \(before tax\): \$-50.00/);
console.log('Show Values quantities, markup, discounts, TBD, exclusions and change orders passed');
const builder = fs.readFileSync('quote-builder.html','utf8');
const deleteCode = builder.slice(builder.indexOf('        function deleteQuoteFindItems('), builder.indexOf('        function deleteItem('));
const a = {}, b = {}, original = {original:true};
const room = {items:[a,b,original]};
let pushes = 0, finishes = 0;
Object.assign(ctx, {rooms:[room], collectQuoteData:()=>({}), quoteDataIsPortalLockedForBuilder:()=>false,
 _pushUndo:()=>pushes++, markQuoteBuilderOriginalItemRemoved:item=>{ if(item.original) {item.removed=true;return true;} return false; },
 finishRoomBulkItemAction:()=>finishes++});
vm.runInContext(deleteCode,ctx);
assert.equal(ctx.deleteQuoteFindItems([{room,item:a},{room,item:original}]),true);
assert.deepEqual(room.items,[b,original]); assert.equal(original.removed,true);
assert.equal(pushes,1); assert.equal(finishes,1);
assert.equal(ctx.deleteQuoteFindItems([{room,item:a}]),false);
ctx.quoteDataIsPortalLockedForBuilder=()=>true;
assert.equal(ctx.deleteQuoteFindItems([{room,item:b}]),false);
assert.equal(pushes,1);
console.log('Bulk find deletion: identity validation, one undo snapshot, retained originals and locked guard passed');
