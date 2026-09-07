const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-builder.html', 'utf8');
const ctx = {
  isQuotePriceTbd: item => item.priceTbd === true,
  normalizeLaborTime: value => value || {},
  normalizeQuoteItemUpgradeGroups: item => item.upgradeGroups || [],
  clearInvalidItemUpgradeSelections() {},
  getQuoteItemUpgradeBaseQuantity: item => item._baseQuantity ?? item.quantity,
  getSelectedItemUpgradeOptions: item => item.upgradeGroups.flatMap(group => group.options.filter(option => group.selectedOptionIds.includes(option.id))),
  isQuoteItemConsultationUpgradeOption: () => false,
  getQuoteItemUpgradeOptionQuantity: item => item.quantity,
  normalizeQuoteItemUpgradeQuantityMode: value => value || 'parent',
  quoteUpgradeUnitsDiffer: (a,b) => a !== b,
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function hasRecordedItemUpgradeBase('), source.indexOf('function qdUpgradeDomIdPart(')), ctx);
function fixture(base = 2100) {
  return {description:'Cabinet', quantity:1, unitType:'Flatrate', rate:base+400, total:base+400, materialCost:700,
    upgraded:true, _baseRate:base, _baseMaterialCost:600, _baseUnitType:'Flatrate',
    upgradeGroups:[{id:'g', selectedOptionIds:['addon'], options:[{id:'addon', name:'Add-on', upgradeType:'add_on', unitType:'Flatrate', rate:400, materialCost:100}]}]};
}
for (const modern of [false, true]) {
  let item = fixture();
  if (modern) { item._itemUpgradeBaseCaptured=true; item._baseQuantity=1; }
  assert.equal(ctx.hasRecordedItemUpgradeBase(item),true);
  const editorRate = ctx.hasRecordedItemUpgradeBase(item) ? item._baseRate : item.rate;
  assert.equal(editorRate,2100,'editor must show base, not selected add-on total');
  ctx.ensureItemUpgradeBaseState(item);
  assert.equal(item._baseRate,2100,'legacy conversion must not absorb add-on');
  ctx.syncEditedItemUpgradeBaseState(item,{rate:editorRate, quantity:1, unitType:'Flatrate', materialCost:600});
  // Adding another unselected option must not change the base or selected total.
  item.upgradeGroups[0].options.push({id:'extra',name:'Another option',upgradeType:'add_on',rate:50,unitType:'Flatrate'});
  ctx.applyItemUpgradeGroupsToItem(item);
  assert.equal(item.total,2500);
  assert.equal(item._baseRate,2100);
  item=JSON.parse(JSON.stringify(item));
  item.upgradeGroups[0].selectedOptionIds=[];
  ctx.applyItemUpgradeGroupsToItem(item);
  assert.equal(item.total,2100,'deselection after reload restores actual base');
  item.upgradeGroups[0].selectedOptionIds=['addon'];
  ctx.applyItemUpgradeGroupsToItem(item);
  assert.equal(item.total,2500,'reselection charges the add-on exactly once');
}
const freeBase=fixture(0);
ctx.ensureItemUpgradeBaseState(freeBase);
freeBase.upgradeGroups[0].selectedOptionIds=[];
ctx.applyItemUpgradeGroupsToItem(freeBase);
assert.equal(freeBase.total,0,'zero base is not replaced by effective price');
const editSource=source.slice(source.indexOf('function editLineItem('),source.indexOf('function editLineItemNote('));
assert(editSource.includes('if (hasRecordedItemUpgradeBase(item))'));
console.log('Legacy and grouped upgrades: 2100 base + 400 selected, edit/reload/deselect/reselect and zero-base checks passed.');
