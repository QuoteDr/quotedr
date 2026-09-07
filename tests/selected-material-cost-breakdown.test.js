const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-builder.html','utf8');
const ctx = {
  getQuoteItemUpgradeBaseQuantity: item => item.quantity,
  hasRecordedItemUpgradeBase: item => item._itemUpgradeBaseCaptured || item.upgraded && item._baseRate !== undefined,
  getSelectedItemUpgradeOptions: item => (item.options || []).filter(o=>o.selected),
  isQuoteItemConsultationUpgradeOption: o => o.upgradeType === 'consultation',
  getQuoteItemUpgradeOptionQuantity: (item,o) => o.quantityMode === 'manual' ? o.manualQuantity : o.quantityMode === 'override' ? o.quantityOverride : o.quantityMode === 'multiplier' ? item.quantity*o.quantityMultiplier : item.quantity,
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function getQuoteItemMaterialBreakdown('),source.indexOf('function calculateMaterialTotal(')),ctx);
const item = {quantity:1, materialCost:910, upgraded:true, _baseRate:2100, _baseMaterialCost:675, options:[{name:'Soft close', selected:true, upgradeType:'add_on',materialCost:235}]};
let result=ctx.getQuoteItemMaterialBreakdown(item);
assert.equal(result.baseTotal,675);
assert.equal(result.rows[0].amount,235);
assert.equal(result.total,910,'combined cost must not be used as base and counted twice');
item.options[0].selected=false;
assert.equal(ctx.getQuoteItemMaterialBreakdown(item).total,675);
item.quantity=3;
item.options[0].selected=true;
item.options[0].quantityMode='manual'; item.options[0].manualQuantity=2;
assert.equal(ctx.getQuoteItemMaterialBreakdown(item).total,2495,'3 base units plus 2 add-on units');
item.options.unshift({name:'Replacement',selected:true,upgradeType:'replacement',materialCost:500,quantityMode:'override',quantityOverride:1});
result=ctx.getQuoteItemMaterialBreakdown(item);
assert.equal(result.baseIncluded,false);
assert.equal(result.total,970,'replacement substitutes for base, selected add-on is added');
item.options.push({selected:true,upgradeType:'consultation',materialCost:999});
assert.equal(ctx.getQuoteItemMaterialBreakdown(item).total,970);
const plain={quantity:3,materialCost:50};
assert.equal(ctx.getQuoteItemMaterialBreakdown(plain).total,150);
assert(source.includes('roomMaterial += getQuoteItemMaterialBreakdown(item).total'));
assert(source.includes('var lineMaterialCost = getQuoteItemMaterialBreakdown(item).total'));
assert(source.includes('Base Material Cost ($/unit)'));
console.log('Selected material breakdown: base/add-on separation, deselection, mixed quantities, replacement and profit totals passed.');
