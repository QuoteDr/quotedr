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

const baseOnlyUpgradeItem = {
  quantity: 2,
  rate: 275,
  total: 550,
  _undiscountedTotal: 550,
  _baseRate: 175,
  _baseQuantity: 2,
  _itemUpgradeBaseCaptured: true,
  upgraded: true,
  upgradeGroups: [{ id: 'finish-options' }],
  discountType: 'percent',
  discountValue: 50,
  discountAppliesToUpgrades: false
};

assert(money(discounts.originalTotal(baseOnlyUpgradeItem)) === 550, 'wizard upgrades should retain their undiscounted gross total');
assert(money(discounts.baseTotal(baseOnlyUpgradeItem)) === 350, 'base total should exclude selected add-ons');
assert(money(discounts.discountableTotal(baseOnlyUpgradeItem)) === 350, 'base-only discount should use only the base item total');
assert(money(discounts.discountAmount(baseOnlyUpgradeItem)) === 175, 'base-only percent discount should not discount add-ons');
assert(money(discounts.chargedTotal(baseOnlyUpgradeItem)) === 375, 'add-ons should remain full price when excluded from discount');

const allUpgradeDiscountItem = Object.assign({}, baseOnlyUpgradeItem, { discountAppliesToUpgrades: true });
assert(money(discounts.discountAmount(allUpgradeDiscountItem)) === 275, 'opted-in percent discount should include selected add-ons');
assert(money(discounts.chargedTotal(allUpgradeDiscountItem)) === 275, 'opted-in add-ons should use the full-line discount');

const baseOnlyAmountItem = Object.assign({}, baseOnlyUpgradeItem, {
  discountType: 'amount',
  discountValue: 999
});
assert(money(discounts.discountAmount(baseOnlyAmountItem)) === 350, 'base-only amount discount should not exceed the base item total');
assert(money(discounts.chargedTotal(baseOnlyAmountItem)) === 200, 'fixed add-on value should remain after a full base-item discount');

const reopenedUpgradeItem = Object.assign({}, baseOnlyUpgradeItem, { total: 375 });
assert(money(discounts.originalTotal(reopenedUpgradeItem)) === 550, 'reopened quote should use persisted gross total instead of discounting a charged total twice');
assert(money(discounts.chargedTotal(reopenedUpgradeItem)) === 375, 'reopened quote should preserve the charged total');

const acceptedGroupedUpgrade = {
  quantity: 1,
  rate: 3495.59,
  total: 3943.89,
  upgraded: true,
  _baseQuantity: 1,
  _baseRate: 3306.10,
  _undiscountedTotal: 3943.89,
  discountType: 'percent',
  discountValue: 50,
  discountAppliesToUpgrades: false
};
assert(money(discounts.chargedTotal(acceptedGroupedUpgrade)) === 2290.84, 'accepted grouped upgrades should remain payable after a base-only discount');
const acceptedGroupedBase = Object.assign({}, acceptedGroupedUpgrade, {
  upgraded: false,
  rate: 3306.10,
  total: undefined,
  _undiscountedTotal: 3306.10
});
assert(money(discounts.chargedTotal(acceptedGroupedBase)) === 1653.05, 'the corresponding pre-upgrade base should retain its own discounted amount');
assert(money(discounts.chargedTotal(acceptedGroupedUpgrade) - discounts.chargedTotal(acceptedGroupedBase)) === 637.79, 'the screenshot-class selected upgrades should reconcile exactly');

const freeItem = { quantity: 2, rate: 425 };
discounts.applyMakeFree(freeItem, 'Courtesy upgrade');

assert(freeItem.discountType === 'percent', 'make free should set percent discount type');
assert(Number(freeItem.discountValue) === 100, 'make free should set 100 percent discount');
assert(freeItem.discountLabel === 'Courtesy upgrade', 'make free should store custom label');
assert(freeItem.discountAppliesToUpgrades === true, 'make free should include selected upgrades');
assert(money(discounts.chargedTotal(freeItem)) === 0, 'make free should charge zero');

console.log('quote discount helper test passed');
