const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function upgradeGroups(firstQuantity, secondQuantity) {
  return [{
    id: 'rails',
    type: 'multiple',
    selectedOptionIds: ['continuous', 'post_to_post'],
    options: [
      { id: 'continuous', quantityMode: 'manual', manualQuantity: firstQuantity },
      { id: 'post_to_post', quantityMode: 'manual', manualQuantity: secondQuantity }
    ]
  }];
}

const builderSource = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const builderContext = {
  normalizeQuoteItemUpgradeGroups(value) {
    return clone((value && value.upgradeGroups) || []);
  },
  findSavedItemForChoiceGroupOption() {
    return { category: 'Deck Construction', item: { upgradeGroups: upgradeGroups(0, 0) } };
  },
  cloneSavedItemForQuoteSync: clone
};
vm.createContext(builderContext);
vm.runInContext(extractFunction(builderSource, 'findQuoteUpgradeRuntimeGroup'), builderContext);
vm.runInContext(extractFunction(builderSource, 'findQuoteUpgradeRuntimeOption'), builderContext);
vm.runInContext(extractFunction(builderSource, 'mergeQuoteItemUpgradeGroupRuntimeState'), builderContext);
vm.runInContext(extractFunction(builderSource, 'hydrateChoiceGroupOptionsFromSavedItems'), builderContext);

const hydratedBuilderGroup = builderContext.hydrateChoiceGroupOptionsFromSavedItems({
  options: [{ id: 'base_a', upgradeGroups: upgradeGroups(7, 13) }]
}, 'Deck Construction');
assert.strictEqual(hydratedBuilderGroup.options[0].upgradeGroups[0].options[0].manualQuantity, 7);
assert.strictEqual(hydratedBuilderGroup.options[0].upgradeGroups[0].options[1].manualQuantity, 13);

const storageSource = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
const storageContext = {
  cloneQuoteStorageValue: clone,
  findSavedItemForChoiceOption() {
    return { upgradeGroups: upgradeGroups(0, 0) };
  },
  quoteStorageSavedItemUpgradeGroups(saved) {
    return clone((saved && saved.upgradeGroups) || []);
  }
};
vm.createContext(storageContext);
vm.runInContext(extractFunction(storageSource, 'findQuoteStorageUpgradeRuntimeGroup'), storageContext);
vm.runInContext(extractFunction(storageSource, 'findQuoteStorageUpgradeRuntimeOption'), storageContext);
vm.runInContext(extractFunction(storageSource, 'mergeQuoteStorageUpgradeGroupRuntimeState'), storageContext);
vm.runInContext(extractFunction(storageSource, 'hydrateChoiceGroupOptionsForSave'), storageContext);

const quoteItem = {
  category: 'Deck Construction',
  upgradeGroups: upgradeGroups(19, 23),
  choiceGroup: {
    type: 'single',
    defaultOptionId: 'base_a',
    selectedOptionIds: [],
    options: [
      { id: 'base_a', upgradeGroups: upgradeGroups(7, 13) },
      { id: 'base_b', upgradeGroups: upgradeGroups(5, 11) }
    ]
  }
};
storageContext.hydrateChoiceGroupOptionsForSave(quoteItem);

const selectedOptions = quoteItem.choiceGroup.options[0].upgradeGroups[0].options;
assert.strictEqual(selectedOptions[0].manualQuantity, 19);
assert.strictEqual(selectedOptions[1].manualQuantity, 23);

const otherOptions = quoteItem.choiceGroup.options[1].upgradeGroups[0].options;
assert.strictEqual(otherOptions[0].manualQuantity, 5);
assert.strictEqual(otherOptions[1].manualQuantity, 11);

console.log('quote upgrade manual quantity persistence test passed');
