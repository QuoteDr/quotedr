const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-discounts.js'), 'utf8');

const context = { console };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const discounts = context.QuoteDrDiscounts;

const baseItem = {
  quantity: 2,
  rate: 425,
  discountType: 'none',
  discountValue: 0
};

assert(money(discounts.originalTotal(baseItem)) === 850, 'original total should be quantity times rate');
assert(money(discounts.discountAmount(baseItem)) === 0, 'no discount should return zero discount');
assert(money(discounts.chargedTotal(baseItem)) === 850, 'no discount should charge original total');
assert(discounts.hasDiscount(baseItem) === false, 'no discount should not be marked discounted');

const explicitTotalItem = {
  quantity: 1,
  rate: 100,
  total: 275,
  discountType: 'none'
};

assert(money(discounts.chargedTotal(explicitTotalItem)) === 275, 'non-discounted complex items should preserve explicit total');

const amountItem = {
  quantity: 2,
  rate: 425,
  discountType: 'amount',
  discountValue: 250
};

assert(money(discounts.discountAmount(amountItem)) === 250, 'amount discount should use fixed dollar value');
assert(money(discounts.chargedTotal(amountItem)) === 600, 'amount discount should reduce charged total');
assert(discounts.hasDiscount(amountItem) === true, 'amount discount should be marked discounted');

const percentItem = {
  quantity: 4,
  rate: 100,
  discountType: 'percent',
  discountValue: 25
};

assert(money(discounts.discountAmount(percentItem)) === 100, 'percent discount should calculate from original total');
assert(money(discounts.chargedTotal(percentItem)) === 300, 'percent discount should reduce charged total');

const overDiscountedItem = {
  quantity: 1,
  rate: 100,
  discountType: 'amount',
  discountValue: 999
};

assert(money(discounts.discountAmount(overDiscountedItem)) === 100, 'discount should not exceed original total');
assert(money(discounts.chargedTotal(overDiscountedItem)) === 0, 'over-discounted item should clamp to zero charged total');

const upgradeItem = {
  quantity: 3,
  rate: 100,
  upgraded: true,
  upgrade: { rate: 180 },
  discountType: 'percent',
  discountValue: 50
};

assert(money(discounts.activeRate(upgradeItem)) === 180, 'active rate should use selected upgrade rate');
assert(money(discounts.originalTotal(upgradeItem)) === 540, 'upgrade original total should use selected upgrade rate');
assert(money(discounts.discountAmount(upgradeItem)) === 270, 'upgrade discount should apply to selected upgrade total');
assert(money(discounts.chargedTotal(upgradeItem)) === 270, 'upgrade charged total should use discounted upgrade total');

const mutatedUpgradeItem = {
  quantity: 2,
  rate: 275,
  _baseRate: 175,
  upgraded: true,
  upgrade: { rate: 100, type: 'add_on' },
  discountType: 'amount',
  discountValue: 50
};

assert(money(discounts.activeRate(mutatedUpgradeItem)) === 275, 'mutated upgrade items should use current active rate');
assert(money(discounts.originalTotal(mutatedUpgradeItem)) === 550, 'mutated upgrade original total should not double-count add-ons');
assert(money(discounts.chargedTotal(mutatedUpgradeItem)) === 500, 'mutated upgrade discount should apply to current total');

const freeItem = { quantity: 2, rate: 425 };
discounts.applyMakeFree(freeItem, 'Courtesy upgrade');

assert(freeItem.discountType === 'percent', 'make free should set percent discount type');
assert(Number(freeItem.discountValue) === 100, 'make free should set 100 percent discount');
assert(freeItem.discountLabel === 'Courtesy upgrade', 'make free should store custom label');
assert(money(discounts.chargedTotal(freeItem)) === 0, 'make free should charge zero');

console.log('quote discount helper test passed');
