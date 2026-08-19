const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260804022657_repair_client_sync_schema.sql', 'utf8');

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

assert(
  migration.includes('add column if not exists crm jsonb') &&
    migration.includes('add column if not exists updated_at timestamptz') &&
    migration.includes('create unique index if not exists clients_user_id_name_key') &&
    migration.includes("notify pgrst, 'reload schema'"),
  'client schema repair should add every column/index required by the current upsert and refresh PostgREST'
);

const operation = {
  key: 'owner::client::New Client',
  entityType: 'client',
  entityId: 'New Client',
  state: 'action_required',
  action: 'upsert',
  attempts: 4,
  payload: { name: 'New Client', crm: { tags: 'Referral' } },
  target: {
    table: 'clients',
    action: 'upsert',
    values: { name: 'New Client', crm: { tags: 'Referral' } },
    onConflict: 'user_id,name'
  },
  lastError: {
    code: 'PGRST204',
    message: "Could not find the 'crm' column of 'clients' in the schema cache."
  }
};

const stores = {
  outbox: JSON.parse(JSON.stringify(operation)),
  snapshots: { key: operation.key, state: 'action_required', payload: operation.payload }
};
const recoveryContext = {
  console,
  Date,
  Error,
  String,
  Array,
  Object,
  OUTBOX_STORE: 'outbox',
  SNAPSHOT_STORE: 'snapshots',
  async getStoreValue(store) { return stores[store] || null; },
  async putStoreValue(store, value) { stores[store] = value; },
  async notify() {},
  async flushSavedOperation(value) {
    assert.strictEqual(value.state, 'local_pending', 'resolve should return the retained save to a retryable state');
    assert.strictEqual(value.lastError, null, 'resolve should clear only the stale error before retrying');
    assert.deepStrictEqual(value.payload, operation.payload, 'resolve must preserve the retained client payload');
    assert.deepStrictEqual(value.target, operation.target, 'resolve must preserve the original cloud target');
    return { state: 'cloud_saved', error: null };
  }
};
vm.createContext(recoveryContext);
loadFunctions(coordinator, [
  'errorObject',
  'isClientSchemaContractError',
  'isRecoverableClientSchemaOperation',
  'retryActionRequiredByKey'
], recoveryContext);

assert.strictEqual(
  recoveryContext.isClientSchemaContractError(operation, operation.lastError),
  true,
  'PGRST204 on clients.crm should be treated as a permanent client schema contract error'
);
assert.strictEqual(
  recoveryContext.isClientSchemaContractError({
    entityType: 'quote',
    target: { table: 'quotes' }
  }, operation.lastError),
  false,
  'client schema handling must not reclassify unrelated durable saves'
);
assert.strictEqual(
  recoveryContext.isRecoverableClientSchemaOperation(operation),
  true,
  'an action-required client schema save should offer a safe resolve action'
);

assert(
  coordinator.includes("return markActionRequired(latest, error, { recordAttempt: true });") &&
    coordinator.includes('data-qd-resolve-retry') &&
    coordinator.includes('Resolve Failed Save'),
  'client schema failures should stop retrying forever and expose Resolve Failed Save'
);

const storage = {};
let resolveCloudSave;
let cloudSaveCalls = 0;
const dashboardContext = {
  console,
  JSON,
  Promise,
  Object,
  Array,
  window: {},
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = value; }
  },
  findNewQuoteClientByName() { return null; },
  populateNewQuoteClientSuggestions() {},
  saveClientToSupabase(client) {
    cloudSaveCalls += 1;
    assert.strictEqual(client.name, 'New Client');
    return new Promise(resolve => { resolveCloudSave = resolve; });
  }
};
vm.createContext(dashboardContext);
loadFunctions(dashboard, ['isNewQuoteClientDraftSaveable', 'saveNewQuoteClientDraft'], dashboardContext);

(async () => {
  let settled = false;
  const savePromise = dashboardContext.saveNewQuoteClientDraft({
    name: 'New Client',
    phone: '555-0100',
    email: 'new@example.com',
    address: '1 Main Street'
  }).then(result => {
    settled = true;
    return result;
  });

  await Promise.resolve();
  assert.strictEqual(cloudSaveCalls, 1, 'the exact Dashboard new-client path should start one cloud save');
  assert.strictEqual(settled, false, 'the Dashboard should wait for the cloud save acknowledgement');
  assert.strictEqual(JSON.parse(storage.ald_clients)['New Client'].name, 'New Client', 'the local client copy should be durable before cloud acknowledgement');

  resolveCloudSave({ state: 'cloud_saved', error: null });
  const result = await savePromise;
  assert.strictEqual(result.savedLocally, true);
  assert.strictEqual(result.cloudResult.state, 'cloud_saved');

  const retryResult = await recoveryContext.retryActionRequiredByKey(operation.key);
  assert.strictEqual(retryResult.state, 'cloud_saved', 'Resolve Failed Save should retry the retained client operation');

  console.log('client save schema recovery checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
