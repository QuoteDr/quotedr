const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const start = coordinator.indexOf('    async function flushSavedOperation(operation, options) {');
const end = coordinator.indexOf('\n    async function runFlush(options)', start);

assert(start >= 0 && end > start, 'flushSavedOperation should be present');

const requests = [];
let flushCount = 0;
let makeLockAvailable = true;
const context = {
  navigator: {
    locks: {
      request(name, options, callback) {
        const hasOptions = typeof options !== 'function';
        const lockOptions = hasOptions ? options : null;
        const lockCallback = hasOptions ? callback : options;
        requests.push({ name, options: lockOptions });
        return Promise.resolve(lockCallback(makeLockAvailable ? { name } : null));
      }
    }
  },
  flushOperation: async (operation, options) => {
    flushCount += 1;
    return { state: 'cloud_saved', operation, options };
  },
  publicResult: (state, operation, result, error) => ({ state, operation, result, error })
};

vm.createContext(context);
vm.runInContext(coordinator.slice(start, end) + '\nthis.flushSavedOperation = flushSavedOperation;', context);

(async () => {
  const operation = { key: 'user:client_portal:portal-1', revision: 'revision-1' };

  const foregroundResult = await context.flushSavedOperation(operation, { force: true });
  assert.strictEqual(foregroundResult.state, 'cloud_saved', 'An explicit save should run after acquiring the shared lock');
  assert.strictEqual(requests[0].name, 'quotedr-durable-save-flush');
  assert.strictEqual(requests[0].options, null, 'An explicit save should queue for the lock instead of using ifAvailable');
  assert.strictEqual(flushCount, 1, 'The queued explicit save should reach the cloud adapter');

  makeLockAvailable = false;
  const backgroundResult = await context.flushSavedOperation(operation, { force: true, ifAvailable: true });
  assert.strictEqual(backgroundResult.state, 'local_pending', 'A busy background worker may leave the save pending');
  assert.strictEqual(backgroundResult.error, null, 'Ordinary background lock contention should not be reported as a save error');
  assert.strictEqual(requests[1].options.ifAvailable, true, 'Background retries should remain nonblocking');
  assert.strictEqual(flushCount, 1, 'A busy background retry should not start a competing cloud write');

  assert(
    !coordinator.includes('Another QuoteDr tab is syncing this account.'),
    'Normal cross-tab lock contention should never surface as a portal save failure'
  );

  const deferredCalls = coordinator.match(/setTimeout\(function\(\) \{ flushSavedOperation\([^\n]+ifAvailable: true/g) || [];
  assert.strictEqual(deferredCalls.length, 3, 'All deferred single-operation retries should use nonblocking lock requests');

  console.log('durable save cross-tab lock checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
