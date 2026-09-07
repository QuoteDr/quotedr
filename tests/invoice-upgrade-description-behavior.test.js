const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('invoice-viewer.html', 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function getInvoiceUpgradeDescription('), source.indexOf('function getHiddenProfileFields(')), ctx);
const base = 'Supply and install heavy-duty bypass doors and hardware.';
const mirror = 'Supply and install the custom mirror insert.';
const softClose = 'Install soft-close hardware.';
function check(item, name, description, original = null) {
  const before = JSON.stringify(item);
  assert.equal(ctx.getInvoiceItemName(item, original, !!item.upgraded || !!original), name);
  assert.equal(ctx.getInvoiceItemDescription(item, original, !!item.upgraded || !!original), description);
  assert.equal(JSON.stringify(item), before, 'display must not mutate saved values');
}
const item = { description: 'Heavy-Duty Bypass Door', itemDescription: base, rate: 2100 };
check(item, item.description, base);
const addon = { ...item, upgraded: true, _baseItemDescription: base, upgrade: {name: 'Mirror', type: 'add_on', description: mirror} };
check(addon, item.description, base + '\n\n' + mirror);
check({...addon, itemDescription: base + '\n\n' + mirror}, item.description, base + '\n\n' + mirror);
const legacyCombined = {...addon, itemDescription: base + '\n\n' + mirror};
delete legacyCombined._baseItemDescription;
check(legacyCombined, item.description, base + '\n\n' + mirror);
check({...addon, upgrade: {...addon.upgrade, type: 'replacement'}}, 'Mirror', mirror);
check({...addon, upgrade: {...addon.upgrade, type: 'consultation'}}, item.description, base);
// Modern grouped exports have already resolved the selected scope in the builder.
// Their legacy mirror must never override that combined description or base name.
const grouped = {...addon, upgradeGroups: [{id: 'g', selectedOptionIds: ['mirror']}], itemDescription: base + '\n\n' + mirror};
check(grouped, item.description, base + '\n\n' + mirror);
check({...grouped, itemDescription: base + '\n\n' + mirror + '\n\n' + softClose}, item.description, base + '\n\n' + mirror + '\n\n' + softClose);
check({...grouped, description: 'Replacement Door', itemDescription: 'Replacement scope.\n\n' + mirror}, 'Replacement Door', 'Replacement scope.\n\n' + mirror);
check({...grouped, upgraded: false, itemDescription: base}, item.description, base);
// Historical flattened signed exports can find their base via original_rooms.
check({description:'Mirror'}, item.description, base + '\n\n' + mirror, addon);
assert(source.includes('const displayName = getInvoiceItemName(item, originalUpgradeItem, isUpgraded);'));
assert(source.includes('const displayDesc = getInvoiceItemDescription(item, originalUpgradeItem, isUpgraded);'));
console.log('Invoice/PDF upgrade name and description behavior passed');
