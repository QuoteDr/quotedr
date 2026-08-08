const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const importer = require('../quickbooks-import.js');

const controllerSource = fs.readFileSync('quickbooks-import-controller.js', 'utf8');

function createHarness(initialData, behavior) {
  behavior = behavior || {};
  const values = { ald_custom_items: JSON.stringify(initialData || {}) };
  const calls = [];
  const localStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; }
  };
  const context = {
    console,
    localStorage,
    QuoteDrQuickBooksImport: importer,
    saveUserDataValue: async function(key, value) {
      calls.push({ kind: 'undo', key, value });
      return behavior.undoResult || { state: 'cloud_saved', error: null };
    },
    loadUserDataValue: async function() { return { data: null, error: null }; },
    backupItemsToCloud: async function(data) {
      calls.push({ kind: 'items', data });
      return behavior.itemResult || { state: 'cloud_saved', error: null };
    },
    saveAllClientsToSupabase: async function(data) {
      calls.push({ kind: 'clients', data });
      return behavior.clientResult || { state: 'cloud_saved', error: null };
    },
    QuoteDrSave: {
      requireCloudAck: async function(entityType, entityId) {
        calls.push({ kind: 'ack', entityType, entityId });
        return behavior.acknowledged === true;
      },
      discardPending: async function(entityType, entityId) {
        calls.push({ kind: 'discard', entityType, entityId });
        return { state: 'discarded' };
      }
    },
    Date,
    Math,
    JSON,
    Promise,
    Object,
    Array,
    String,
    Error
  };
  context.window = context;
  vm.runInNewContext(controllerSource, context, { filename: 'quickbooks-import-controller.js' });
  return { context, calls, values };
}

(async function() {
  const original = { Painting: [{ name: 'Walls', rate: 10 }] };
  const record = { id: 'qb-walls', name: 'Walls', rate: 12 };
  const success = createHarness(original);
  const imported = await success.context.QuoteDrQuickBooksImportController.importRecords('items', [record], {
    pricePolicy: 'keep_quotedr',
    importedAt: '2026-08-08T12:00:00.000Z'
  });
  assert.equal(imported.changed, true);
  assert.deepEqual(success.calls.map(call => call.kind), ['undo', 'items'], 'the full undo snapshot must reach cloud before primary item data');
  assert.equal(JSON.parse(success.values.ald_custom_items).Painting.length, 1);
  assert.equal(JSON.parse(success.values.ald_custom_items).Painting[0].qb_id, 'qb-walls');

  success.calls.length = 0;
  await success.context.QuoteDrQuickBooksImportController.undoLastImport('items');
  assert.deepEqual(success.calls.map(call => call.kind), ['items', 'undo'], 'undo should restore primary data before marking its snapshot used');
  assert.deepEqual(JSON.parse(success.values.ald_custom_items), original);

  const backupFailure = createHarness(original, {
    undoResult: { state: 'local_failed', error: { message: 'backup offline' } }
  });
  await assert.rejects(
    () => backupFailure.context.QuoteDrQuickBooksImportController.importRecords('items', [record], { importedAt: '2026-08-08T12:00:00.000Z' }),
    /backup offline/
  );
  assert.equal(backupFailure.calls.some(call => call.kind === 'items'), false, 'primary data must not save without a confirmed undo backup');
  assert.deepEqual(JSON.parse(backupFailure.values.ald_custom_items), original);

  const primaryFailure = createHarness(original, {
    itemResult: { state: 'local_failed', error: { message: 'items offline' } }
  });
  await assert.rejects(
    () => primaryFailure.context.QuoteDrQuickBooksImportController.importRecords('items', [record], { importedAt: '2026-08-08T12:00:00.000Z' }),
    /items offline/
  );
  assert(primaryFailure.calls.some(call => call.kind === 'discard'), 'a failed queued primary save should be removed before local rollback');
  assert.deepEqual(JSON.parse(primaryFailure.values.ald_custom_items), original, 'a failed primary save should restore the original local item library');

  const pendingThenConfirmed = createHarness(original, {
    undoResult: { state: 'local_pending', error: null },
    acknowledged: true
  });
  await pendingThenConfirmed.context.QuoteDrQuickBooksImportController.importRecords('items', [record], { importedAt: '2026-08-08T12:00:00.000Z' });
  assert(pendingThenConfirmed.calls.some(call => call.kind === 'ack' && call.entityType === 'user_data'), 'a pending undo backup should require explicit cloud acknowledgement');

  console.log('QuickBooks import controller transaction tests passed');
})().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
