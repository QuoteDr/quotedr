const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'property-memory.js'), 'utf8');

function loadModule() {
  const store = {};
  const context = {
    window: { confirm: () => true },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; }
    },
    localStorage: {
      get length() { return Object.keys(store).length; },
      key(index) { return Object.keys(store)[index] || null; },
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; }
    },
    console,
    setTimeout,
    clearTimeout,
    Date,
    encodeURIComponent,
    decodeURIComponent,
    isFinite
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, store, api: context.window.QuoteDrPropertyMemory };
}

async function run() {
  const { context, store, api } = loadModule();
  const test = api.__test;

  assert.strictEqual(test.scopedLocalKey('user-a', '123 main st'), 'ald_property_memory:user-a:123%20main%20st');
  assert.notStrictEqual(test.scopedLocalKey('user-a', '123 main st'), test.scopedLocalKey('user-b', '123 main st'), 'device fallbacks must be account scoped');

  const normalized = test.normalizeRecord({
    clientName: 'Do not persist',
    clientPhone: 'Do not persist',
    reminders: [
      { id: 'rem-electrical', label: 'Panel access', message: 'Confirm panel access before work.', targetType: 'category', category: 'Electrical' },
      { id: 'rem-vanity', label: 'Stone top', message: 'Protect the stone top.', targetType: 'item', category: 'Cabinetry', itemReference: 'cabinetry::vanity installation', itemLabel: 'Vanity Installation' }
    ]
  }, '123 Main Street', '123 main st');
  assert.strictEqual(normalized.reminders.length, 2);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, 'clientName'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, 'clientPhone'), false);

  const legacyOne = test.normalizeReminder({ message: 'Protect floors', mode: 'category', category: 'Painting' });
  const legacyTwo = test.normalizeReminder({ message: 'Protect floors', mode: 'category', category: 'Painting' });
  assert.strictEqual(legacyOne.id, legacyTwo.id, 'legacy reminders without IDs need a deterministic stable ID');

  assert.strictEqual(test.reminderMatchesItem(normalized.reminders[0], { category: ' electrical ', description: 'Install receptacle' }), true);
  assert.strictEqual(test.reminderMatchesItem(normalized.reminders[0], { category: 'Plumbing', description: 'Install vanity' }), false);
  assert.strictEqual(test.reminderMatchesItem(normalized.reminders[1], {
    category: 'Cabinetry',
    serviceName: 'Vanity Installation',
    savedItemSource: { category: 'Cabinetry', key: 'cabinetry::vanity installation', name: 'Vanity Installation' }
  }), true);
  assert.strictEqual(test.reminderMatchesItem(normalized.reminders[1], { category: 'Cabinetry', serviceName: 'Cabinet Installation' }), false);

  const quoteItems = [
    { category: 'Electrical', description: 'Install receptacle' },
    { category: 'Cabinetry', serviceName: 'Vanity Installation' }
  ];
  const pricingSnapshot = JSON.stringify(quoteItems);
  const matches = test.findMatchingReminders(normalized, '123 MAIN ST.', quoteItems, []);
  assert.deepStrictEqual(Array.from(matches, reminder => reminder.id), ['rem-electrical', 'rem-vanity']);
  const acknowledgement = test.reminderAcknowledgementKey('123 main st', normalized.reminders[0]);
  const afterDismissal = test.findMatchingReminders(normalized, '123 Main Street', quoteItems, [acknowledgement]);
  assert.deepStrictEqual(Array.from(afterDismissal, reminder => reminder.id), ['rem-vanity']);
  assert.strictEqual(test.findMatchingReminders(normalized, '999 Other Road', quoteItems, []).length, 0, 'reminders must stay isolated to the matching property');
  assert.strictEqual(JSON.stringify(quoteItems), pricingSnapshot, 'reminder evaluation must not mutate quote items or pricing');

  const localRecord = test.normalizeRecord({ generalSiteNotes: 'Local copy' }, '123 Main Street', '123 main st');
  const cloudRecord = test.normalizeRecord({ generalSiteNotes: 'Cloud copy' }, '123 Main Street', '123 main st');
  const otherRecord = test.normalizeRecord({ generalSiteNotes: 'Other' }, '9 Side Road', '9 side rd');
  const merged = test.mergeRecords([localRecord, otherRecord], [cloudRecord]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged.find(entry => entry.record.normalizedAddress === '123 main st').record.generalSiteNotes, 'Cloud copy', 'cloud data should win while retaining local parity metadata');
  assert.strictEqual(merged.find(entry => entry.record.normalizedAddress === '123 main st').hasLocal, true);
  assert(test.searchText(normalized).includes('panel access'), 'manager search should cover reminders');

  const target = test.buildDeleteTarget('123 main st');
  assert.strictEqual(target.table, 'user_data');
  assert.strictEqual(target.action, 'delete');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(target.filters)), [{ column: 'key', value: 'property_memory:123%20main%20st' }]);
  assert.strictEqual(target.expectRows, false, 'an already-absent exact cloud row should be a safe deletion success');

  let capturedOperation = null;
  context.qdDurableSupabaseOperation = async operation => {
    capturedOperation = operation;
    return { state: 'cloud_saved', error: null };
  };
  await test.removeCloudRecord('123 main st', '123 Main Street', { id: 'user-a' });
  assert.strictEqual(capturedOperation.entityId, 'property_memory:123%20main%20st');
  assert.strictEqual(capturedOperation.action, 'delete');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(capturedOperation.target.filters)), [{ column: 'key', value: 'property_memory:123%20main%20st' }]);
  assert.strictEqual(capturedOperation.target.ownerScoped, undefined, 'durable deletes should retain the default authenticated owner scope');

  const scopedKey = test.scopedLocalKey('user-a', '123 main st');
  store[scopedKey] = JSON.stringify(localRecord);
  context.qdDurableSupabaseOperation = async () => ({ state: 'local_pending', error: null });
  await assert.rejects(() => test.removeCloudRecord('123 main st', '123 Main Street', { id: 'user-a' }), /pending/i);
  assert(store[scopedKey], 'partial/offline cloud failure must retain the exact device fallback for retry');

  test.finishDeletion('123 main st', '123 Main Street', 'user-a');
  assert.strictEqual(store[scopedKey], undefined, 'confirmed deletion must remove only the matching account-scoped fallback');
  const unrelatedKey = test.scopedLocalKey('user-b', '123 main st');
  store[unrelatedKey] = JSON.stringify(localRecord);
  test.finishDeletion('123 main st', '123 Main Street', 'user-a');
  assert(store[unrelatedKey], 'confirmed deletion must not touch another account\'s device fallback');

  console.log('property memory completion behavior tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
