const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0, 'missing source marker: ' + startMarker);
  assert(end > start, 'missing source marker: ' + endMarker);
  return source.slice(start, end);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function changedDefinitionFixture() {
  return {
    target: [{
      id: 'new-group-id',
      name: '2x6 Drink Rails',
      type: 'multiple',
      selectedOptionIds: [],
      options: [{
        id: 'new-option-id',
        name: '2x6 Post-To-Post Cap Rail/Drink Rail',
        unitType: 'LF',
        quantityMode: 'manual',
        manualQuantity: 0
      }]
    }],
    previous: [{
      id: 'old-group-id',
      name: '2x6 Drink Rails',
      type: 'multiple',
      selectedOptionIds: ['old-option-id'],
      options: [{
        id: 'old-option-id',
        name: '2x6 Post-To-Post Cap Rail/Drink Rail',
        unitType: 'LF',
        quantityMode: 'manual',
        manualQuantity: 57
      }]
    }]
  };
}

function assertRuntimeMerge(merge, label) {
  const fixture = changedDefinitionFixture();
  const merged = merge(fixture.target, fixture.previous);
  assert.strictEqual(merged[0].options[0].manualQuantity, 57, label + ' should retain the quote-entered quantity');
  assert.deepStrictEqual(Array.from(merged[0].selectedOptionIds), ['new-option-id'], label + ' should remap selection to the refreshed option id');

  const roundTrip = merge(clone(merged), clone(merged));
  assert.strictEqual(roundTrip[0].options[0].manualQuantity, 57, label + ' should survive a second save/reload merge');
}

const builderContext = {
  normalizeQuoteItemUpgradeGroups(value) {
    return clone(value && value.upgradeGroups || []);
  }
};
vm.createContext(builderContext);
vm.runInContext(sourceBetween(
  builder,
  'function quoteUpgradeRuntimeTextKey',
  'function syncChoiceGroupSelectedOptionUpgradeRuntimeState'
), builderContext);
assertRuntimeMerge(builderContext.mergeQuoteItemUpgradeGroupRuntimeState, 'Quote Builder merge');

const storageContext = {
  cloneQuoteStorageValue: clone,
  normalizeQuoteItemUpgradeGroups(value) {
    return clone(value && value.upgradeGroups || []);
  }
};
vm.createContext(storageContext);
vm.runInContext(sourceBetween(
  storage,
  'function quoteStorageUpgradeRuntimeTextKey',
  'function findSavedItemForChoiceOption'
), storageContext);
assertRuntimeMerge(storageContext.mergeQuoteStorageUpgradeGroupRuntimeState, 'Quote storage merge');

const viewerContext = {
  viewerNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  },
  normalizeViewerItemUpgradeGroups(value) {
    return clone(value && value.upgradeGroups || []);
  }
};
vm.createContext(viewerContext);
vm.runInContext(sourceBetween(
  viewer,
  'function viewerUpgradeRuntimeTextKey',
  'function applyViewerChoiceGroupToItem'
), viewerContext);
assertRuntimeMerge(viewerContext.mergeViewerItemUpgradeGroupRuntimeState, 'Client viewer merge');

console.log('manual upgrade quantity persistence checks passed');
