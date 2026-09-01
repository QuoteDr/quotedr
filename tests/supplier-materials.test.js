const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadModule() {
  const context = {
    console,
    Intl,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Set,
    Map,
    Promise,
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('supplier-materials.js', 'utf8'), context, { filename: 'supplier-materials.js' });
  return context.QuoteDrSupplierMaterials._test;
}

test('supplier CSV mapping recognizes common contractor catalogue headers', () => {
  const api = loadModule();
  const rows = api.parseStructuredRows([
    'Item Number,Description,UOM,Pack Size,Your Price,Manufacturer',
    'CES-100,12/2 NMD90 Cable,metre,75,$129.50,Northern Cable',
    'CES-200,20A Tamper Resistant Receptacle,each,10,$34.00,Leviton'
  ].join('\n'));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].supplierSku, 'CES-100');
  assert.equal(rows[0].purchaseUnit, 'metre');
  assert.equal(rows[0].packageQuantity, 75);
  assert.equal(rows[0].price, '129.50');
  assert.equal(rows[1].brand, 'Leviton');
});

test('recipe math applies fixed and per-task quantities, waste, minimum, and package rounding in order', () => {
  const api = loadModule();
  const line = api.calculateDraftComponent({
    fixedQuantity: 1,
    perItemQuantity: 2,
    wastePercent: 10,
    minimumQuantity: 8,
    packageQuantity: 5,
    roundingMode: 'ceil_packages',
    manualUnitCost: ''
  }, 3, { package_quantity: 5, last_price: 25 });

  assert.equal(line.requiredQuantity, 8);
  assert.equal(line.purchasedQuantity, 10);
  assert.equal(line.packageCount, 2);
  assert.equal(line.extendedCost, 50);
});

test('frozen quote snapshot recalculates quantity without adopting a newer supplier price', () => {
  const api = loadModule();
  const snapshot = {
    savedItemId: '11111111-1111-4111-8111-111111111111',
    itemQuantity: 1,
    totalCost: 25,
    lines: [{
      materialName: 'Cable pack',
      fixedQuantity: 0,
      perItemQuantity: 2,
      wastePercent: 0,
      minimumQuantity: 0,
      packageQuantity: 5,
      roundingMode: 'ceil_packages',
      unitPrice: 25,
      extendedCost: 25
    }]
  };
  const recalculated = api.recalculateFrozenSnapshot(snapshot, 6);

  assert.equal(recalculated.lines[0].unitPrice, 25);
  assert.equal(recalculated.lines[0].purchasedQuantity, 15);
  assert.equal(recalculated.totalCost, 75);
  assert.equal(snapshot.itemQuantity, 1, 'the original frozen snapshot remains unchanged');
});
