const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const context = {
  window: {},
  rooms: [],
  renderCount: 0,
  unsavedCount: 0,
  syncChoiceGroupSelectedOptionUpgradeRuntimeState() {},
  renderRooms() { this.renderCount += 1; },
  markUnsaved() { this.unsavedCount += 1; },
  normalizeQuoteItemUpgradeGroups(item) {
    return (item && item.upgradeGroups) || [];
  },
  normalizeQuoteItemUpgradeQuantityMode(value) {
    const clean = String(value || '').trim().toLowerCase();
    return ['manual', 'multiplier', 'override'].includes(clean) ? clean : 'parent';
  },
  isQuoteItemConsultationUpgradeOption(option) {
    return option && option.requiresConsultation === true;
  },
  isItemUpgradeOptionCompatible(option, selectedIds) {
    const required = option.availableAfterOptionIds || [];
    const blocked = option.blockedByOptionIds || [];
    if (required.length && !required.some((id) => selectedIds.includes(id))) return false;
    return !blocked.some((id) => selectedIds.includes(id));
  }
};
vm.createContext(context);
[
  'getQuoteItemUpgradeBaseQuantity',
  'getQuoteItemUpgradeOptionQuantity',
  'getZeroQuantityItemUpgradeOptions',
  'quoteItemHasUndismissedZeroUpgradeQuantities'
].forEach((name) => vm.runInContext(extractFunction(builder, name), context));
vm.runInContext(extractFunction(builder, 'dismissZeroUpgradeQuantityWarningForItem'), context);
vm.runInContext(`async ${extractFunction(builder, 'dismissZeroUpgradeQuantityWarningsForQuote')}`, context);

const item = {
  quantity: 7,
  unitType: 'each',
  upgradeGroups: [{
    id: 'rails',
    selectedOptionIds: [],
    options: [
      { id: 'manual-zero', quantityMode: 'manual', manualQuantity: 0, unitType: 'LF' },
      { id: 'manual-set', quantityMode: 'manual', manualQuantity: 31.5, unitType: 'LF' },
      { id: 'same-unit-parent', quantityMode: 'parent', unitType: 'each' },
      { id: 'same-unit-ratio', quantityMode: 'multiplier', quantityMultiplier: 1.5, unitType: 'each' },
      { id: 'consultation', quantityMode: 'manual', manualQuantity: 0, requiresConsultation: true }
    ]
  }]
};

assert.strictEqual(context.getQuoteItemUpgradeOptionQuantity(item, item.upgradeGroups[0].options[2]), 7, 'parent mode should follow the parent quantity 1:1');
assert.strictEqual(context.getQuoteItemUpgradeOptionQuantity(item, item.upgradeGroups[0].options[3]), 10.5, 'multiplier mode should recalculate the saved ratio from the parent quantity');
assert.deepStrictEqual(Array.from(context.getZeroQuantityItemUpgradeOptions(item), (option) => option.id), ['manual-zero'], 'only compatible, non-consultation zero quantities should be warned');
assert.strictEqual(context.quoteItemHasUndismissedZeroUpgradeQuantities(item), true);

item.zeroUpgradeQuantityWarningDismissed = true;
assert.strictEqual(context.quoteItemHasUndismissedZeroUpgradeQuantities(item), false, 'per-item dismissal should suppress only that item warning');
item.zeroUpgradeQuantityWarningDismissed = false;
context.window._zeroUpgradeQuantityWarningsDismissed = true;
assert.strictEqual(context.quoteItemHasUndismissedZeroUpgradeQuantities(item), false, 'quote-wide dismissal should suppress quote warnings');

const dismissItem = { upgradeGroups: [] };
context.rooms = [{ id: 12, items: [dismissItem] }];
context.dismissZeroUpgradeQuantityWarningForItem(null, 12, 0);
assert.strictEqual(dismissItem.zeroUpgradeQuantityWarningDismissed, true, 'item dismissal should persist on the quote item');

(async () => {
  context.window._zeroUpgradeQuantityWarningsDismissed = false;
  context.qdConfirm = async () => false;
  await context.dismissZeroUpgradeQuantityWarningsForQuote(null);
  assert.strictEqual(context.window._zeroUpgradeQuantityWarningsDismissed, false, 'cancelling quote-wide dismissal must keep warnings');
  context.qdConfirm = async () => true;
  await context.dismissZeroUpgradeQuantityWarningsForQuote(null);
  assert.strictEqual(context.window._zeroUpgradeQuantityWarningsDismissed, true, 'confirmed quote-wide dismissal should persist in quote state');

assert(builder.includes('Upgrade quantities need attention'), 'builder should render a prominent zero-quantity warning');
assert(builder.includes('Quantity not set'), 'zero-quantity options should be individually highlighted');
assert(builder.includes('Dismiss for this item') && builder.includes('Dismiss for all'), 'warning should offer item and quote dismissal scopes');
assert(builder.includes('Are you sure you want to dismiss this warning across the entire quote?'), 'quote-wide dismissal should require explicit confirmation');
assert(builder.includes('previousItemQuantity !== quantity || previousItemUnitType !== unitType'), 'changing the parent quantity or unit should re-arm an item dismissal');

assert(storage.includes('zeroUpgradeQuantityWarningsDismissed: window._zeroUpgradeQuantityWarningsDismissed === true'), 'quote-wide dismissal should save with the quote');
assert(storage.includes('window._zeroUpgradeQuantityWarningsDismissed = data.zeroUpgradeQuantityWarningsDismissed === true'), 'quote-wide dismissal should restore with the quote');
assert(storage.includes('window._zeroUpgradeQuantityWarningsDismissed = false'), 'new/closed quote context should not inherit another quote dismissal');

console.log('quote upgrade zero quantity warning checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
