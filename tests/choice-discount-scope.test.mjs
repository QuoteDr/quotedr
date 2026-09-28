import assert from 'node:assert/strict';
import '../quote-discounts.js';
import {calculateClientDocumentTotals, projectClientDocumentData} from '../supabase/functions/_shared/client-document-policy.mjs';
import {accountingLineItems} from '../supabase/functions/_shared/accounting-export.mjs';
const math=globalThis.QuoteDrDiscounts;
const options=[{id:'a',name:'Custom stairs',quantityMode:'inherit',rate:225},{id:'b',name:'Modified stairs',quantityMode:'inherit',rate:235}];
function fixture(selected='a',extra={}) {
 const total=selected==='a'?2700:2820;
 return {name:'Stairs',quantity:12,rate:total/12,total,_undiscountedTotal:total,discountType:'per_unit',discountValue:25,discountChoiceScope:'selected',discountChoiceOptionIds:['a'],choiceGroup:{type:'single',options,selectedOptionIds:[selected],defaultOptionId:'a'},...extra};
}
function check(item,expected) {
 const data={taxEnabled:false,rooms:[{name:'Stairs',markup:0,items:[item]}]};
 assert.equal(math.chargedTotal(item),expected,'browser');
 assert.equal(calculateClientDocumentTotals(data).subtotal,expected,'server');
 assert.equal(accountingLineItems({data})[0].lineTotal,expected,'accounting');
 const projected=projectClientDocumentData(data).rooms[0].items[0];
 assert.equal(math.chargedTotal(projected),expected,'projection');
 assert.equal(math.chargedTotal(JSON.parse(JSON.stringify(item))),expected,'reload');
}
check(fixture(),2400);
check(fixture('b'),2820);
check(fixture('b',{discountChoiceScope:'all'}),2520);
check(fixture('b',{discountChoiceScope:undefined}),2520);
check(fixture('a',{discountType:'percent',discountValue:10}),2430);
check(fixture('a',{discountType:'amount',discountValue:300}),2400);
check(fixture('a',{discountValue:999}),0);
check(fixture('a',{discountChoiceOptionIds:[]}),2700);
const multi=fixture('a',{rate:460,total:5520,_undiscountedTotal:5520,choiceGroup:{type:'multiple',options,selectedOptionIds:['a','b']}});
check(multi,5220);
check({...multi,discountType:'amount',discountValue:100},5420);
check({...multi,discountChoiceScope:'all'},4920);
console.log('Choice discounts: targeted/all/legacy, amount/percent/per-unit, caps, multiple choices, reload, client projection and accounting passed.');
