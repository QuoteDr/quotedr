const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  let end = source.indexOf(`function ${nextName}(`, start);
  if (source.slice(Math.max(0, end - 6), end) === 'async ') end -= 6;
  assert(start >= 0 && end > start, `${name} should be present`);
  return source.slice(start, end);
}

const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');

const supabaseContext = {};
vm.createContext(supabaseContext);
vm.runInContext(extractFunction(supabase, 'qdDurableVersionsMatch', 'qdApplyDurableFilters'), supabaseContext);

assert.strictEqual(
  supabaseContext.qdDurableVersionsMatch('2026-07-14T11:10:59.123Z', '2026-07-14 11:10:59.123+00'),
  true,
  'Supabase timestamp formatting differences should still acknowledge the same save'
);
assert.strictEqual(
  supabaseContext.qdDurableVersionsMatch('2026-07-14T11:10:59.123Z', '2026-07-14T11:11:00.123Z'),
  false,
  'Different cloud timestamps should remain different revisions'
);

(async () => {
  const operation = {
    operationId: 'stable-operation',
    revision: 'new-local-revision'
  };
  const target = {
    verifyVersionColumn: 'updated_at',
    verifyVersionValue: '2026-07-14T11:10:59.123Z',
    versionRead: { table: 'quotes' }
  };
  supabaseContext.qdReadDurableSupabaseVersion = async () => ({
    version: '2026-07-14T11:11:00.000Z',
    revision: 'new-local-revision',
    operationId: 'stable-operation'
  });
  const storedRevisionMatches = await supabaseContext.qdDurableAcknowledgementMatches(
    operation,
    target,
    { id: 'quote-id', updated_at: '2026-07-14T11:11:00.000Z' }
  );
  assert.strictEqual(
    storedRevisionMatches,
    true,
    'A lightweight write response should be acknowledged after the stored revision marker is verified'
  );

  supabaseContext.qdReadDurableSupabaseVersion = async () => ({
    version: '2026-07-14T11:11:00.000Z',
    revision: 'other-device-revision',
    operationId: 'other-device-operation'
  });
  const otherDeviceRevision = await supabaseContext.qdDurableAcknowledgementMatches(
    operation,
    target,
    { id: 'quote-id', updated_at: '2026-07-14T11:11:00.000Z' }
  );
  assert.strictEqual(
    otherDeviceRevision,
    false,
    'A different stored revision must not acknowledge the local save'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const coordinatorContext = {
  withTimeout: promise => promise
};
vm.createContext(coordinatorContext);
vm.runInContext(extractFunction(coordinator, 'versionsMatch', 'acknowledgedVersion'), coordinatorContext);
vm.runInContext('async ' + extractFunction(coordinator, 'checkConflict', 'flushOperation'), coordinatorContext);

(async () => {
  const operation = {
    operationId: 'stable-operation',
    revision: 'new-local-revision',
    baseVersion: '2026-07-14T11:00:00.000Z',
    timeoutMs: 1000,
    target: { verifyVersionValue: '2026-07-14T11:10:00.000Z' }
  };
  const ownEarlierWrite = await coordinatorContext.checkConflict(operation, {
    readVersion: async () => ({
      version: '2026-07-14T11:05:00.000+00:00',
      revision: 'earlier-local-revision',
      operationId: 'stable-operation'
    })
  });
  assert.strictEqual(ownEarlierWrite, null, 'an earlier coalesced write from this device should be safe to continue');

  const otherDeviceWrite = await coordinatorContext.checkConflict(operation, {
    readVersion: async () => ({
      version: '2026-07-14T11:05:00.000+00:00',
      revision: 'other-revision',
      operationId: 'other-device-operation'
    })
  });
  assert(otherDeviceWrite && otherDeviceWrite.code === 'QD_SAVE_CONFLICT', 'a genuinely different device revision should remain a conflict');

  const explicitLocalChoice = await coordinatorContext.checkConflict({
    ...operation,
    forceConflictOverwrite: true
  }, {
    readVersion: async () => {
      throw new Error('The cloud version should not be checked again after an explicit local choice');
    }
  });
  assert.strictEqual(explicitLocalChoice, null, 'Use This Device should explicitly bypass the resolved conflict');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

assert(
  coordinator.includes('versionsMatch(serverVersion, operation.baseVersion)') &&
    coordinator.includes('versionsMatch(serverVersion, expectedVersion)') &&
    coordinator.includes('serverVersion.operationId === operation.operationId') &&
    coordinator.includes('operation.forceConflictOverwrite = true'),
  'Conflict checks should accept either the loaded base version or an already-written expected version'
);

assert(
  supabase.includes('operationId: saveMeta && saveMeta.operationId'),
  'Cloud version reads should return the stable operation id so a coalesced save is not mistaken for another device'
);

assert(
  coordinator.includes('current.baseVersion = acknowledgedVersion(result, operation)') &&
    coordinator.includes("return publicResult('local_pending', current, result, null)"),
  'A coalesced successor should be rebased when its preceding cloud write is acknowledged'
);

assert(
  coordinator.includes("await flush({ force: true });") &&
    coordinator.includes('Use This Device') &&
    coordinator.includes('Load Cloud Copy'),
  'Startup should retry old conflicts and genuine conflicts should expose explicit resolution choices'
);

[
  'client-portal.html',
  'dashboard.html',
  'home-depot-price-sync.html',
  'home-depot-tracker.html',
  'interactive-quote-viewer.html',
  'invoice-viewer.html',
  'labor-tracker.html',
  'login.html',
  'onboarding.html',
  'portal-theme-studio.html',
  'quote-builder.html',
  'settings.html'
].forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('supabase-v2.js')) {
    assert(html.includes('supabase-v2.js?v=2026071402'), `${file} should load the fixed Supabase adapter`);
  }
  if (html.includes('save-coordinator.js')) {
    assert(html.includes('save-coordinator.js?v=2026071403'), `${file} should load the fixed save coordinator`);
  }
});

console.log('durable save version matching checks passed');
