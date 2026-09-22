import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {calculateClientDocumentTotals,projectClientDocumentData} from '../supabase/functions/_shared/client-document-policy.mjs';
import {accountingLineItems} from '../supabase/functions/_shared/accounting-export.mjs';
import {sanitizeQuoteRow} from '../supabase/functions/_shared/account-data-policy.mjs';
const context={};vm.runInNewContext(fs.readFileSync('quote-discounts.js','utf8'),context);
const math=context.QuoteDrDiscounts;
const door={name:'Door',quantity:6,rate:650,discountType:'per_unit',discountValue:50,discountAppliesToUpgrades:false};
function data(item,markup=0){return {taxEnabled:false,taxRate:0,rooms:[{name:'Basement',markup,items:[item]}]};}
for(const [item,expected] of [
 [door,3600], [{...door,quantity:3},1800], [{...door,quantity:2.5},1500],
 [{...door,quantity:0},0], [{...door,discountValue:900},0],
 [{...door,discountValue:-5},3900], [{...door,discountType:'amount'},3850],
 [{...door,discountType:'percent',discountValue:10},3510],
 [JSON.parse(JSON.stringify(door)),3600],
 [{...door,upgraded:true,upgrade:{type:'add_on',rate:100},discountValue:900},600],
 [{...door,upgraded:true,upgrade:{type:'add_on',rate:100},discountValue:900,discountAppliesToUpgrades:true},0]
]){
 assert.equal(math.chargedTotal(item),expected,'browser '+JSON.stringify(item));
 assert.equal(calculateClientDocumentTotals(data(item)).subtotal,expected,'client totals '+JSON.stringify(item));
 assert.equal(accountingLineItems({data:data(item)})[0].lineTotal,expected,'accounting '+JSON.stringify(item));
 const projected=projectClientDocumentData(data(item));
 assert.equal(math.chargedTotal(projected.rooms[0].items[0]),expected,'projected browser '+JSON.stringify(item));
}
const projected=projectClientDocumentData(data(door,10));
assert.equal(projected.rooms[0].items[0].discountValue,55);
assert.equal(projected.rooms[0].items[0].discountAppliesToUpgrades,false);
assert.equal(math.chargedTotal(projected.rooms[0].items[0]),3960,'existing markup applies consistently');
assert.equal(accountingLineItems({data:data(door,10)})[0].lineTotal,3960);
const restricted=sanitizeQuoteRow({data:data(door,10)},{canReadPricing:false});
assert.equal(restricted.data.rooms[0].items[0].discountValue,55);
assert.equal(math.chargedTotal(restricted.data.rooms[0].items[0]),3960);
const builder=fs.readFileSync('quote-builder.html','utf8');
const readFields=builder.slice(builder.indexOf('        function readLineDiscountFields()'),builder.indexOf('        function applyLineDiscountFields(item)'));
const elements={lineDiscountType:{value:'per_unit'},lineDiscountValue:{value:'50'},lineDiscountLabel:{value:'Honour old pricing'},lineDiscountApplyToUpgrades:{checked:false}};
vm.runInNewContext(readFields+'; result=readLineDiscountFields();',context.document ? context : Object.assign(context,{document:{getElementById:id=>elements[id]}}));
assert.equal(context.result.discountType,'per_unit');assert.equal(context.result.discountValue,50);
assert.equal(context.result.discountAppliesToUpgrades,false);
assert(fs.readFileSync('quote-builder.html','utf8').includes('<option value="per_unit">$ off each unit</option>'));
console.log('Per-unit discount: quantity, fractional units, caps, upgrades, reload, projection, markup and accounting passed.');
