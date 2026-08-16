const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const start = source.indexOf('async function confirmAddLine()');
const end = source.indexOf('function checkIfNewItem()', start);
assert(start >= 0 && end > start, 'confirmAddLine should be present');

const fields = {
  currentRoomId: { value: '1' },
  lineDescription: { value: 'Saved framing item' },
  lineItemDescription: { value: 'Reusable description' },
  lineCategory: { value: 'Deck Construction' },
  lineUnitType: { value: 'sq ft' },
  lineQuantity: { value: '2' },
  linePriceTbd: { checked: false },
  lineRate: { value: '45' },
  lineNotes: { value: '' },
  lineMaterialCost: { value: '10' },
  lineService: { value: 'Saved framing item' },
  saveNewItemBtn: { dataset: { databaseState: 'existing' } }
};

let editorClosed = false;
let promptCount = 0;
let renderCount = 0;

const context = {
  document: { getElementById: id => fields[id] || null },
  window: {},
  rooms: [{
    id: 1,
    items: [{
      description: 'Saved framing item',
      category: 'Deck Construction',
      serviceName: 'Saved framing item',
      unitType: 'sq ft',
      quantity: 2,
      rate: 30,
      materialCost: 10,
      total: 60,
      _baseRate: 30,
      _baseMaterialCost: 10,
      _baseQuantity: 2,
      _baseUnitType: 'sq ft',
      _itemUpgradeBaseCaptured: true
    }]
  }],
  editingItemIndex: 0,
  pricingDatabase: {
    'Deck Construction': [{ name: 'Saved framing item', rate: 30, materialCost: 10 }]
  },
  validateAddLineItemRequiredFields: () => true,
  normalizeLineItemCategoryValue: field => field.value,
  normalizeLineUnitTypeValue: field => field.value,
  isLineItemOneTimeCategory: () => false,
  shouldPromptToSaveNewLineItem: () => false,
  promptToSaveNewLineItemToDatabase: async () => false,
  saveLineItemToDatabase: async () => false,
  buildSavedItemFromEditedLineItem: () => ({
    name: 'Saved framing item',
    category: 'Deck Construction',
    unitType: 'sq ft',
    rate: 45,
    materialCost: 10
  }),
  cloneSavedItemForQuoteSync: value => JSON.parse(JSON.stringify(value || {})),
  savedItemQuoteSource: (category, item) => ({ category, name: item.name }),
  _pushUndo: () => {},
  getLineItemSupplierUrlFromForm: () => '',
  normalizeLaborTime: value => value || null,
  normalizeQuoteItemUpgradeGroups: () => [],
  getSavedItemFingerprintForQuoteSync: () => '',
  applyLineDiscountFields: () => {},
  coRefreshItemDelta: () => {},
  resetLineItemEditState: () => { context.editingItemIndex = null; },
  renderRooms: () => {
    renderCount += 1;
    const item = context.rooms[0].items[0];
    if (item._itemUpgradeBaseCaptured) {
      item.rate = item._baseRate;
      item.total = item.quantity * item.rate;
    }
  },
  updateBuilderGuide: () => {},
  _hideBootstrapModalAndWait: async () => { editorClosed = true; },
  maybeConfirmSavedItemDatabaseUpdate: async item => {
    promptCount += 1;
    assert(editorClosed, 'database prompt should open after the editor closes');
    assert.strictEqual(item.rate, 45, 'quote rate should be committed before the database prompt');
    return 'quote_only';
  },
  saveEditedLineItemToDatabase: async () => null,
  autoGroupQuoteItem: async item => [item]
};

vm.createContext(context);
const upgradeBaseStart = source.indexOf('function syncEditedItemUpgradeBaseState(');
const upgradeBaseEnd = source.indexOf('function applyItemUpgradeGroupsToItem(', upgradeBaseStart);
assert(upgradeBaseStart >= 0 && upgradeBaseEnd > upgradeBaseStart, 'upgrade base edit helper should be present');
vm.runInContext(source.slice(upgradeBaseStart, upgradeBaseEnd), context);
vm.runInContext(source.slice(start, end), context);

(async () => {
  await context.confirmAddLine();
  assert.strictEqual(context.rooms[0].items[0].rate, 45, 'Save Changes should update the quote rate');
  assert.strictEqual(context.rooms[0].items[0]._baseRate, 45, 'Save Changes should update the upgrade group base rate');
  assert.strictEqual(context.rooms[0].items[0].total, 90, 'Save Changes should recalculate the line total');
  assert.strictEqual(promptCount, 1, 'editing a saved item should offer the database update once');
  assert(renderCount >= 1, 'the quote should rerender after the edit');
  console.log('edit line item save order test passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
