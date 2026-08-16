const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const wizardCollector = items.slice(
  items.indexOf('function collectManageUpgradeWizardForm'),
  items.indexOf('function showManageUpgradeWizard')
);
const manualCollector = items.slice(
  items.indexOf('function collectManageItemUpgradeGroups'),
  items.indexOf('function handleManageUpgradeGroupTypeChange')
);

assert(items.includes('function openManageUpgradeWizard'), 'Manage Items should expose an Upgrade Wizard launcher for existing saved items');
assert(items.includes('function openManageNewItemUpgradeWizard'), 'Manage Items should expose an Upgrade Wizard launcher for the new-item form');
assert(items.includes('function renderManageUpgradeWizardModal'), 'Upgrade Wizard should render its own guided modal');
assert(items.includes('function hydrateManageUpgradeWizardFromGroup'), 'Upgrade Wizard should edit existing upgrade groups without rebuilding their ids');
assert(items.includes('function saveManageUpgradeWizard'), 'Upgrade Wizard should save generated groups back into upgradeGroups');
assert(items.includes('data-upgrade-wizard-action="edit-existing"'), 'Upgrade Wizard should list existing groups with Edit in Wizard actions');
assert(items.includes('data-upgrade-wizard-step="setup"'), 'Upgrade Wizard should include a setup step');
assert(items.includes('data-upgrade-wizard-step="options"'), 'Upgrade Wizard should include an options step');
assert(items.includes('data-upgrade-wizard-step="rules"'), 'Upgrade Wizard should include a rules step for paths');
assert(items.includes('data-upgrade-wizard-step="review"'), 'Upgrade Wizard should include a review step');
assert(items.includes('Simple Upgrade'), 'Upgrade Wizard should offer a Simple Upgrade setup card');
assert(items.includes('Pick One Upgrade Set'), 'Upgrade Wizard should offer a Pick One setup card');
assert(items.includes('Stackable Add-ons'), 'Upgrade Wizard should offer a stackable add-ons setup card');
assert(items.includes('Upgrade Path'), 'Upgrade Wizard should offer an upgrade path setup card');
assert(items.includes('availableAfterOptionIds') && items.includes('blockedByOptionIds'), 'Upgrade Wizard should write existing path rule fields');
assert(items.includes('manage-upgrade-wizard-preview'), 'Upgrade Wizard should show a review/preview summary');
assert(items.includes('Always available'), 'Upgrade Wizard path rules should offer an explicit Always available option');
assert(items.includes('handleManageUpgradePathSelectChange'), 'Upgrade Wizard path rule selects should normalize Always available back to no dependency');
assert(items.includes("filterManageUpgradeRuleOptionIds"), 'Upgrade Wizard should strip Always available sentinel values before saving rules');
assert(items.includes('manage-upgrade-rule-checkboxes'), 'Upgrade Wizard path rules should render checkbox groups instead of multi-select boxes');
assert(items.includes('type="checkbox"'), 'Upgrade Wizard path rule options should be selectable with checkboxes');
assert(items.includes('collectManageUpgradeRuleCheckboxIds'), 'Upgrade Wizard should collect multiple checked path rule options or none');
assert(items.includes('data-upgrade-wizard-action="toggle-note"'), 'Upgrade Wizard should let users add a note to an upgrade group');
assert(items.includes('upgrade-group-note'), 'Upgrade Wizard and manual editor should persist upgrade group notes');
assert(items.includes('manage-upgrade-unit-warning'), 'Upgrade setup should warn when base item and upgrade units differ');
assert(items.includes('upgrade-quantity-mode'), 'Upgrade setup should let users choose how mixed-unit upgrade quantities are calculated');
assert(items.includes('Enter quantity on quote'), 'Upgrade quantity modes should include a contractor-entered quote quantity option');
assert(items.includes('quantityMultiplier'), 'Upgrade quantity modes should persist multiplier values for mixed-unit upgrades');
assert(items.includes('function syncManageUpgradeWizardOptionQuantityState'), 'Upgrade Wizard should sync mixed-unit quantity mode selections into wizard state before re-rendering');
assert(items.includes('syncManageUpgradeWizardOptionQuantityState(optionEl);'), 'Upgrade Wizard quantity state should be preserved when quantity controls refresh');
assert(items.includes('syncManageUpgradeWizardOptionQuantityState(selectEl.closest'), 'Changing the Upgrade Wizard quantity mode should immediately persist the selected behavior');
assert(items.includes('function readManageUpgradeOptionQuantityState(optionEl, previousState)'), 'Upgrade Wizard quantity reader should accept prior option state so later steps cannot reset quantity behavior');
assert(wizardCollector.includes('...readManageUpgradeOptionQuantityState(optionEl, previous)'), 'Upgrade Wizard collection should preserve previous quantity behavior when a step omits quantity controls');
assert(!manualCollector.includes('...readManageUpgradeOptionQuantityState(optionEl, previous)'), 'Manual upgrade collection should not reference wizard-only previous option state');
assert(items.includes('saveManageUpgradeWizardRow(detailsRow)'), 'Upgrade Wizard Save should persist the edited Manage Items row immediately');
assert(
    items.includes('function closeManageUpgradeWizard()') &&
    items.includes('bootstrap.Modal.getOrCreateInstance(modalEl).hide()') &&
    /finally \{\s*manageUpgradeWizardState = null;\s*closeManageUpgradeWizard\(\);/.test(items),
  'Upgrade Wizard Save should reliably close the wizard after committing the upgrade group'
);
assert(
  items.includes('return backupItemsToCloud(itemsObj);') &&
    fs.readFileSync(path.join(root, 'save-coordinator.js'), 'utf8').includes("new Error('Cloud save timed out')") &&
    fs.readFileSync(path.join(root, 'save-coordinator.js'), 'utf8').includes(']).finally(function() { clearTimeout(timeoutId); })'),
  'Manage Items cloud backup should use the shared timed coordinator instead of leaving the saving indicator pending indefinitely'
);
assert(items.includes('function bindManageItemsCloseGuard'), 'Manage Items should guard every modal close path against unsaved changes');
assert(items.includes('You have unsaved changes, are you sure you want to exit?'), 'Manage Items close warning should use the clear unsaved changes message');
assert(items.includes("modalEl.addEventListener('hide.bs.modal'"), 'Manage Items close guard should catch header X, backdrop, and ESC closes');

assert(html.includes('openManageNewItemUpgradeWizard'), 'New item form should include an Upgrade Wizard button');
assert(html.includes('Upgrade Wizard'), 'Quote builder markup should contain the Upgrade Wizard label');
assert(html.includes('#manageUpgradeWizardModal .manage-upgrade-wizard-option-card'), 'Upgrade Wizard option cards should have visible separation styling inside the wizard modal');
assert(items.includes("renderManageUnitSelect(option.unitType || state.baseUnitType || '', 'upgrade-unit-type')"), 'Upgrade Wizard option units should use the shared Manage Items unit select');
assert(items.includes("renderManageUnitSelect(option.unitType || baseUnitType || '', 'upgrade-unit-type')"), 'Manual upgrade group option units should use the shared Manage Items unit select');
assert(items.includes('<option value="">Select Existing Item</option>'), 'Saved-item selectors should clearly prompt users to select an existing item');
assert(!items.includes('Type custom upgrade'), 'Saved-item selectors should not imply that custom upgrades are entered in the dropdown');
assert(items.includes('Select an existing saved item or create a new upgrade.'), 'Upgrade Wizard helper text should explain the two available paths');
assert((items.match(/manage-upgrade-choice-divider/g) || []).length >= 2, 'Wizard and manual upgrade editors should show a clear OR divider between existing and new items');
assert((items.match(/Create New Upgrade Name/g) || []).length >= 2, 'Wizard and manual upgrade editors should label the new-upgrade field clearly');

console.log('manage-items upgrade wizard static checks passed');
