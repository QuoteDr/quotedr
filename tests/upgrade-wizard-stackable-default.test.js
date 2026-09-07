const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'quote-items.js'), 'utf8');
const context = { manageUpgradeGroupId: () => 'test-id' };
vm.createContext(context);
vm.runInContext(source.slice(
  source.indexOf('function getManageUpgradeWizardOptionTemplate('),
  source.indexOf('function hydrateManageUpgradeWizardFromGroup(')
), context);
const stackable = context.buildManageUpgradeWizardGroup('multiple', 'each');
assert.equal(stackable.options[0].upgradeType, 'add_on');
assert.equal(stackable.options[0].unitType, 'each');
assert.equal(context.getManageUpgradeWizardOptionTemplate('each', 1, 'multiple').upgradeType, 'add_on');
// Removing every option and adding one again must still default to Add-on.
assert.equal(context.getManageUpgradeWizardOptionTemplate('each', 0, 'multiple').upgradeType, 'add_on');
assert.equal(context.buildManageUpgradeWizardGroup('simple', 'each').options[0].upgradeType, 'replacement');
assert.equal(context.buildManageUpgradeWizardGroup('path', 'each').options[0].upgradeType, 'replacement');
assert.equal(context.getManageUpgradeWizardOptionTemplate('each', 1, 'single_optional').upgradeType, 'add_on');
assert(source.includes('manageUpgradeWizardState.group.options.length, manageUpgradeWizardState.group.type)'), 'Add Option must use the current group type');
// Defaults apply only when creating options, not when reopening saved groups.
const hydrate = source.slice(source.indexOf('function hydrateManageUpgradeWizardFromGroup('), source.indexOf('function getManageUpgradeWizardContextFromButton('));
context.cloneManageUpgradeGroup = group => JSON.parse(JSON.stringify(group));
vm.runInContext(hydrate, context);
stackable.options[0].upgradeType = 'replacement';
assert.equal(context.hydrateManageUpgradeWizardFromGroup(stackable).options[0].upgradeType, 'replacement');
console.log('Stackable wizard defaults and saved-option preservation passed.');
