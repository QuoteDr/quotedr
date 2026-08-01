const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const quoteStorage = fs.readFileSync('quote-storage.js', 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function loadFunctions(source, names, context) {
  names.forEach(name => vm.runInContext(extractFunction(source, name), context));
}

const validId = '11111111-1111-1111-1111-111111111111';
const ownerId = '22222222-2222-2222-2222-222222222222';

const coordinatorContext = { console, Date, Error, String, Array, Object };
vm.createContext(coordinatorContext);
loadFunctions(coordinator, ['isUuidIdentifier', 'quoteOperationIdentifierError'], coordinatorContext);
assert.strictEqual(coordinatorContext.quoteOperationIdentifierError({
  entityId: validId,
  action: 'update',
  target: { table: 'quotes', action: 'update', filters: [{ column: 'id', value: validId }] }
}), null, 'valid quote update IDs should remain retryable');
const malformedError = coordinatorContext.quoteOperationIdentifierError({
  entityId: 'undefined',
  action: 'update',
  target: { table: 'quotes', action: 'update', filters: [{ column: 'id', value: 'undefined' }] }
});
assert.strictEqual(malformedError.code, 'QD_INVALID_IDENTIFIER', 'malformed quote IDs should be quarantined');
const legacyUuidError = coordinatorContext.quoteOperationIdentifierError({
  entityType: 'quote',
  entityId: 'undefined',
  action: 'update',
  target: {},
  lastError: { code: '22P02', message: 'invalid input syntax for type uuid: \"undefined\"' },
  payload: { supabaseId: 'undefined', rooms: [] }
});
assert.strictEqual(legacyUuidError.code, 'QD_INVALID_IDENTIFIER', 'legacy quote retries should be quarantined from their stored UUID error even without target metadata');
assert.strictEqual(coordinatorContext.quoteOperationIdentifierError({
  entityId: 'quote-number:Q-1',
  action: 'insert',
  target: { table: 'quotes', action: 'insert', values: { quote_number: 'Q-1' } }
}), null, 'new quote inserts may use a deterministic non-UUID coordinator key');

assert(coordinator.includes("operation.state === 'conflict' || operation.state === 'action_required'"), 'flush should skip quarantined saves');
assert(coordinator.includes('await quarantineMalformedOperations();'), 'startup should quarantine old malformed operations');
assert(coordinator.includes('Resolve Failed Save'), 'recovery UI should offer cloud-aware resolution');
assert(coordinator.includes('Export &amp; Remove Failed Save'), 'recovery UI should let the user safely clear an obsolete retry');
assert(coordinator.includes('var retryAction = status.retryableCount ?'), 'Retry Now should be hidden when nothing is safely retryable');
assert(coordinator.indexOf("state: 'cloud_copy_found'") < coordinator.indexOf('if (options.saveIfMissing !== true)'), 'cloud copies should be checked before recovery can create a new copy');

const storageState = { ald_active_quote_id: 'undefined' };
const supabaseContext = {
  console,
  Date,
  Error,
  String,
  Array,
  Object,
  window: { _supabaseQuoteId: 'undefined' },
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageState, key) ? storageState[key] : null; },
    removeItem(key) { delete storageState[key]; }
  }
};
vm.createContext(supabaseContext);
loadFunctions(supabase, ['qdNormalizeQuoteUuid', 'qdDurableTargetIdentifierError', 'qdNormalizeQuoteIdentityForSave'], supabaseContext);
const invalidQuote = { supabaseId: 'undefined', _serverUpdatedAt: 'old-version', serverUpdatedAt: 'old-version' };
supabaseContext.qdNormalizeQuoteIdentityForSave(invalidQuote);
assert.strictEqual(invalidQuote.supabaseId, null, 'an invalid active quote ID should be cleared before saving');
assert.strictEqual(invalidQuote._serverUpdatedAt, null, 'an invalid ID should not retain a cloud base version');
assert.strictEqual(storageState.ald_active_quote_id, undefined, 'the invalid persisted active ID should be removed');
assert.strictEqual(supabaseContext.window._supabaseQuoteId, null, 'the invalid in-memory active ID should be removed');
assert.strictEqual(supabaseContext.qdDurableTargetIdentifierError({
  table: 'quotes', action: 'delete', filters: [{ column: 'id', value: 'undefined' }]
}).code, 'QD_INVALID_IDENTIFIER', 'malformed direct quote writes should be stopped before reaching Supabase');

const quoteContext = { console, Date, JSON, String, Array, Object };
vm.createContext(quoteContext);
loadFunctions(quoteStorage, [
  'quoteStorageNormalizeCloudId',
  'quoteStorageRecoveredQuoteNumber',
  'quoteStorageOperationHasInvalidQuoteId',
  'quoteStorageRecoveryQuoteFromOperation'
], quoteContext);
const malformedOperation = {
  key: 'owner::quote::undefined',
  operationId: 'operation-bad',
  revision: 'revision-bad',
  userId: ownerId,
  entityType: 'quote',
  entityId: 'undefined',
  entityLabel: 'New Deck',
  action: 'update',
  state: 'action_required',
  localSavedAt: '2026-07-15T22:28:15.000Z',
  baseVersion: '2026-07-15T22:00:00.000Z',
  target: { table: 'quotes', action: 'update', filters: [{ column: 'id', value: 'undefined' }] },
  payload: {
    supabaseId: 'undefined',
    _serverUpdatedAt: '2026-07-15T22:00:00.000Z',
    quoteTitle: 'New Deck',
    quoteNumber: 'Q-742459980',
    rooms: [{ name: 'Deck', items: [] }]
  }
};
const recovered = quoteContext.quoteStorageRecoveryQuoteFromOperation(malformedOperation);
assert.strictEqual(recovered.supabaseId, null, 'a malformed backup should not preserve the bad cloud ID');
assert.strictEqual(recovered._serverUpdatedAt, null, 'a malformed backup should not preserve the bad server version');
assert(recovered.quoteNumber.startsWith('Q-742459980-RECOVERED-'), 'a malformed backup should reopen as a separate quote number');
assert(recovered.quoteTitle.endsWith('(Recovered Copy)'), 'a malformed backup should be visibly identified');
const legacyRecovered = quoteContext.quoteStorageRecoveryQuoteFromOperation({
  ...malformedOperation,
  target: {},
  lastError: { code: '22P02', message: 'invalid input syntax for type uuid: \"undefined\"' }
});
assert.strictEqual(legacyRecovered.supabaseId, null, 'legacy UUID failures should export without the malformed cloud ID');
assert(legacyRecovered.quoteNumber.includes('-RECOVERED-'), 'legacy UUID failures should reopen as a separate recovered quote');

const recoverySaveCalls = [];
const recoveryDiscardCalls = [];
const recoveryContext = {
  console,
  Date,
  JSON,
  Promise,
  String,
  Array,
  Object,
  OUTBOX_STORE: 'outbox',
  async getStoreValue() { return malformedOperation; },
  cloneValue(value) { return JSON.parse(JSON.stringify(value)); },
  errorObject(error) { return { message: String(error && error.message || error) }; },
  async discardPendingByKey(key, options) { recoveryDiscardCalls.push({ key, options }); },
  async saveQuoteToSupabase(payload) {
    recoverySaveCalls.push(payload);
    return { state: 'cloud_saved', error: null, data: [{ id: validId }] };
  }
};
vm.createContext(recoveryContext);
loadFunctions(coordinator, ['isRecoverableMalformedQuoteOperation', 'recoveredQuoteNumber', 'resolveMalformedQuoteOperation'], recoveryContext);

(async () => {
  recoveryContext.findMalformedQuoteCloudMatches = async () => ({
    checked: true,
    quoteNumber: 'Q-742459980',
    matches: [{ id: validId, quote_number: 'Q-742459980' }]
  });
  let result = await recoveryContext.resolveMalformedQuoteOperation(malformedOperation.key);
  assert.strictEqual(result.state, 'cloud_copy_found', 'an existing cloud copy should be reported');
  assert.strictEqual(recoverySaveCalls.length, 0, 'an existing cloud copy must not trigger another save');
  assert.strictEqual(recoveryDiscardCalls.length, 0, 'the stale retry must remain until the user confirms removal');

  recoveryContext.findMalformedQuoteCloudMatches = async () => ({ checked: true, quoteNumber: 'Q-742459980', matches: [] });
  result = await recoveryContext.resolveMalformedQuoteOperation(malformedOperation.key);
  assert.strictEqual(result.state, 'cloud_copy_missing', 'a missing cloud copy should require confirmation');
  assert.strictEqual(recoverySaveCalls.length, 0, 'a missing copy must not be saved without confirmation');

  result = await recoveryContext.resolveMalformedQuoteOperation(malformedOperation.key, { saveIfMissing: true });
  assert.strictEqual(result.state, 'cloud_saved', 'confirmed recovery should save a separate cloud copy');
  assert.strictEqual(recoverySaveCalls.length, 1, 'confirmed recovery should save exactly once');
  assert.strictEqual(recoverySaveCalls[0].supabaseId, null, 'confirmed recovery should insert rather than overwrite');
  assert.strictEqual(recoverySaveCalls[0].forceNew, true, 'confirmed recovery should bypass quote-number dedupe');
  assert(recoverySaveCalls[0].quoteNumber.includes('-RECOVERED-'), 'confirmed recovery should use a unique quote number');
  assert.strictEqual(recoverySaveCalls[0].portal_visible, false, 'a recovered copy should not be published automatically');
  assert.strictEqual(recoveryDiscardCalls.length, 1, 'the obsolete operation should clear only after cloud acknowledgement');

  console.log('durable malformed-save recovery checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
