const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(items.includes('Requires consultation'), 'Manage Items should offer Requires consultation as an upgrade group selection type');
assert(items.includes('data-upgrade-group-action="add-single-upgrade"'), 'Manage Items should keep a quick Single Upgrade action beside Add Upgrade Group');
assert(items.includes("action === 'add-single-upgrade'"), 'Single Upgrade action should create a simple one-option upgrade group');
assert(items.includes("group.type === 'consultation'"), 'Manage Items should preserve consultation upgrade group type');
assert(items.includes('requiresConsultation'), 'Upgrade options should persist consultation metadata');
assert(items.includes("upgradeType: group.type === 'consultation' ? 'consultation'"), 'Consultation groups should force consultation upgrade options');

assert(builder.includes('isQuoteItemConsultationUpgradeOption'), 'Quote builder should identify consultation upgrade options');
assert(builder.includes('Consultation required'), 'Quote builder should display consultation upgrades without forcing a price');
assert(builder.includes("group.type === 'consultation'"), 'Quote builder should preserve consultation upgrade group type');
assert(builder.includes("option.upgradeType === 'consultation'"), 'Quote builder should not add consultation upgrade pricing to totals');

assert(viewer.includes('isViewerConsultationUpgradeOption'), 'Client viewer should identify consultation upgrade options');
assert(viewer.includes('hasConsultationUpgradeSelections'), 'Client viewer should treat selected consultation upgrades as requested changes');
assert(viewer.includes('submitUpgrades(event);'), 'Client viewer main action should submit requested changes instead of opening signature when needed');
assert(viewer.includes('Consultation required'), 'Client viewer should label consultation upgrade choices clearly');
assert(viewer.includes("option.upgradeType === 'consultation'"), 'Client viewer should keep consultation upgrades out of price math');

console.log('upgrade consultation static checks passed');
