const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-items.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
function section(from, to) { return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))); }
const copy = value => JSON.parse(JSON.stringify(value));
const panel = { open: true };
const summary = { innerHTML: '' };
let closed = 0;
const ctx = {
  window: {},
  document: { getElementById(id) { return {lineItemUpgradePanel: panel, lineItemUpgradeSummary: summary, lineUnitType: {value: 'each'}}[id]; } },
  cloneManageUpgradeGroups: copy,
  cloneManageUpgradeGroup: copy,
  normalizeManageItemUpgradeGroups: item => {
    // Simulate the normalizer's legacy ID mutation to prove source isolation.
    if (item.upgradeGroups?.[0]) item.upgradeGroups[0].id ||= 'generated';
    return item.upgradeGroups || [];
  },
  manageItemsEscape: String, manageItemsAttr: String,
  collectManageUpgradeWizardForm() {},
  closeManageUpgradeWizard() { closed++; },
  manageUpgradeWizardAlert(message) { throw Error(message); },
  // Any saved-item write would fail this test: no persistence API is provided.
};
vm.createContext(ctx);
vm.runInContext(section('var lineItemUpgradeDraft =', 'var manageUpgradeWizardCloseConfirmed'), ctx);
vm.runInContext(section('function getManageUpgradeWizardContextFromButton(', 'function ensureManageUpgradeWizardModal('), ctx);
vm.runInContext(section('function saveManageUpgradeWizard()', 'function syncNewItemUpgradeWizardSummary('), ctx);
const original = {upgradeGroups: [{name: 'Original', type: 'multiple', options: [{id: 'o1', name: 'Shelf', upgradeType: 'add_on'}]}]};
ctx.resetLineItemUpgradeDraft(original);
assert.equal(original.upgradeGroups[0].id, undefined, 'opening must not mutate the live item');
assert.equal(panel.open, false, 'panel starts collapsed');
const draft = ctx.getLineItemUpgradeDraft();
draft[0].name = 'Mutated copy';
assert.equal(ctx.getLineItemUpgradeDraft()[0].name, 'Original');
const context = ctx.getManageUpgradeWizardContextFromButton({closest: selector => selector === '#lineItemUpgradePanel' ? panel : null});
assert.equal(context.context, 'quoteLine');
assert.equal(context.baseUnitType, 'each');
ctx.manageUpgradeWizardState = {context: 'quoteLine', groups: [], editingGroupId: '', group: {id: 'new', name: 'Extra choices', type: 'multiple', options: [{id: 'o2', name: 'Mirror'}]}};
ctx.saveManageUpgradeWizard();
assert.equal(closed, 1);
assert.equal(ctx.getLineItemUpgradeDraft()[0].name, 'Extra choices');
assert.equal(ctx.window.lineItemUpgradesWereEdited(), true);
assert.equal(original.upgradeGroups[0].name, 'Original', 'wizard save only updates modal draft');
ctx.removeLineItemUpgradeGroup(0);
assert.equal(ctx.getLineItemUpgradeDraft().length, 0);
ctx.resetLineItemUpgradeDraft(original);
assert.equal(ctx.window.lineItemUpgradesWereEdited(), false);
assert.equal(ctx.getLineItemUpgradeDraft()[0].name, 'Original', 'cancel/reopen restores quote data');
ctx.resetLineItemUpgradeDraft({});
assert.equal(ctx.getLineItemUpgradeDraft().length, 0, 'next new item starts empty');
assert.match(builder, /<details id="lineItemUpgradePanel"[^>]*>/);
assert(!/<details id="lineItemUpgradePanel"[^>]*\bopen\b/.test(builder));
assert(builder.includes('applyLineItemUpgradeDraft(item, previousUpgradeGroups)'));
assert(builder.includes('quote-items.js?v=2026090701'), 'new HTML must request the matching item-editor script');
assert(builder.includes('quote-storage.js?v=2026090701'), 'quote storage must use the matching release');
assert(builder.includes("typeof window.getLineItemUpgradeDraft !== 'function'"), 'mixed-version pages must warn before opening an incompatible wizard');
assert(builder.includes('if (window.lineItemUpgradesWereEdited?.()) {\n                savedItem.upgradeGroups = window.getLineItemUpgradeDraft();'));
console.log('Quote-only upgrade draft isolation, wizard save, removal, reopening and opt-in persistence passed.');

// Quote-only choice upgrades must survive both builder hydration and storage preparation.
const saved = {upgrade: {name: 'Old legacy upgrade'}, upgradeGroups: [{id: 'saved', options: []}]};
const hydration = {
  findSavedItemForChoiceGroupOption: () => ({item: saved}),
  getChoiceGroupOptionItemDescription: () => '',
  cloneSavedItemForQuoteSync: copy,
  normalizeQuoteItemUpgradeGroups: item => copy(item.upgradeGroups || []),
  mergeQuoteItemUpgradeGroupRuntimeState: target => copy(target),
};
vm.createContext(hydration);
vm.runInContext(builder.slice(builder.indexOf('function hydrateChoiceGroupOptionsFromSavedItems('), builder.indexOf('function getQuoteItemChoiceGroupKeys(')), hydration);
for (const groups of [[], [{id: 'local', options: [{id: 'new', name: 'Mirror'}]}]]) {
  const group = {options: [{id: 'choice', quoteUpgradeOverride: true, upgrade: null, upgradeGroups: copy(groups)}]};
  hydration.hydrateChoiceGroupOptionsFromSavedItems(group, 'Cabinetry');
  assert.equal(JSON.stringify(group.options[0].upgradeGroups), JSON.stringify(groups));
  assert.equal(group.options[0].upgrade, null);
}
const storage = fs.readFileSync('quote-storage.js', 'utf8');
assert(storage.includes('var mergedUpgradeGroups = !option.quoteUpgradeOverride && savedUpgradeGroups.length'));
assert(storage.includes('if (!option.quoteUpgradeOverride && saved && saved.upgrade'));
console.log('Quote-only choice upgrade definitions and deliberate removal survive hydration.');
