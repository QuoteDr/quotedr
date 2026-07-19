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
vm.runInContext(extractFunction(supabase, 'qdDurableSaveTime', 'qdQuoteOperationEditTime'), supabaseContext);
vm.runInContext(extractFunction(supabase, 'qdQuoteOperationEditTime', 'qdQuoteCloudEditTime'), supabaseContext);
vm.runInContext(extractFunction(supabase, 'qdQuoteCloudEditTime', 'qdQuoteOperationIsSuperseded'), supabaseContext);
vm.runInContext(extractFunction(supabase, 'qdQuoteOperationIsSuperseded', 'qdQuoteMetadataRow'), supabaseContext);

assert.strictEqual(
  supabaseContext.qdDurableVersionsMatch('2026-07-14T11:10:59.123Z', '2026-07-14 11:10:59.123+00'),
  true,
  'Supabase timestamp formatting differences should still acknowledge the same save'
);

assert.strictEqual(
  supabaseContext.qdQuoteOperationIsSuperseded(
    { payload: { savedAt: '2026-07-14T10:00:00.000Z' }, forceConflictOverwrite: true },
    { updated_at: '2026-07-14T11:00:01.000Z', data: { _saveMeta: { clientEditedAt: '2026-07-14T11:00:00.000Z' } } }
  ),
  true,
  'an old queued quote must not overwrite newer cloud work, even if a legacy conflict choice remained on the operation'
);
assert.strictEqual(
  supabaseContext.qdQuoteOperationIsSuperseded(
    { payload: { _clientEditedAt: '2026-07-14T12:00:00.000Z' } },
    { updated_at: '2026-07-14T11:00:01.000Z', data: { _saveMeta: { clientEditedAt: '2026-07-14T11:00:00.000Z' } } }
  ),
  false,
  'a genuinely newer device edit should be allowed to update the cloud quote'
);
assert.strictEqual(
  supabaseContext.qdQuoteOperationIsSuperseded(
    {
      baseVersion: '2026-07-14T11:00:01.000Z',
      payload: { _clientEditedAt: '2026-07-14T10:59:00.000Z' }
    },
    { updated_at: '2026-07-14T11:00:01.000Z', data: { _saveMeta: { clientEditedAt: '2026-07-14T11:00:00.000Z' } } }
  ),
  false,
  'an edit based on the exact cloud version should not be rejected because a device clock is behind'
);
assert.strictEqual(
  supabaseContext.qdQuoteOperationIsSuperseded(
    {
      baseVersion: '2026-07-14T10:30:00.000Z',
      payload: { _clientEditedAt: '2026-07-14T10:59:00.000Z' }
    },
    { updated_at: '2026-07-14T11:00:01.000Z', data: { _saveMeta: { clientEditedAt: '2026-07-14T11:00:00.000Z' } } }
  ),
  true,
  'an edit based on an older cloud version must still yield to newer cloud work'
);
assert.strictEqual(
  supabaseContext.qdQuoteOperationIsSuperseded(
    { payload: {}, forceConflictOverwrite: true },
    { id: 'existing-cloud-quote', updated_at: '2026-07-14T11:00:01.000Z', data: {} }
  ),
  true,
  'a legacy retry with no freshness metadata must not overwrite an existing cloud quote'
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
  assert.strictEqual(explicitLocalChoice, null, 'an explicit local choice should bypass the generic non-quote conflict check');

  const quoteLastWriteWins = await coordinatorContext.checkConflict({
    ...operation,
    entityType: 'quote'
  }, {
    readVersion: async () => {
      throw new Error('Quote saves should not be blocked by another device timestamp');
    }
  });
  assert.strictEqual(quoteLastWriteWins, null, 'quote conflict decisions should be delegated to the atomic freshness-aware adapter');
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
  coordinator.includes("if (operation.entityType === 'quote') return null;") &&
    coordinator.includes('detail: { operation: operation, result: result, version: cloudVersion }') &&
    coordinator.includes('async function markSuperseded(operation, result)') &&
    supabase.includes("action === 'update' && target.table === 'quotes' && operation.entityType === 'quote'") &&
    supabase.includes("updateQuery.eq('updated_at', current.updated_at)") &&
    supabase.includes("target.requireCurrentQuoteBase === true") &&
    supabase.includes("conflictError.code = '409'"),
  'Quote saves should expose confirmed versions while atomically rejecting genuine stale-base edits'
);

const quoteStorage = fs.readFileSync('quote-storage.js', 'utf8');
assert(
  quoteStorage.includes("window.addEventListener('quotedr-save-acknowledged', applyQuoteCloudAcknowledgement)") &&
    quoteStorage.includes('window._quoteServerUpdatedAt = cloudVersion') &&
    quoteStorage.includes('window._currentQuoteData._serverUpdatedAt = cloudVersion'),
  'The quote builder and its cached sharing snapshot should adopt cloud versions acknowledged by recovery saves'
);

assert(
  supabase.includes('operationId: saveMeta && saveMeta.operationId'),
  'Cloud version reads should return the stable operation id so a coalesced save is not mistaken for another device'
);

assert(
  coordinator.includes('current.baseVersion = cloudVersion || current.baseVersion || null') &&
    coordinator.includes("return publicResult('local_pending', current, result, null)"),
  'A coalesced successor should be rebased when its preceding cloud write is acknowledged'
);

assert(
  coordinator.includes("await flush({ force: true });") &&
    coordinator.includes('Use My Version') &&
    coordinator.includes('Load Cloud Copy'),
  'Startup should retry pending work while genuine conflicts expose explicit resolution choices'
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
    const adapterVersion = html.match(/supabase-v2\.js\?v=(\d+)/);
    assert(adapterVersion && Number(adapterVersion[1]) >= 2026071503, `${file} should load the fixed Supabase adapter`);
  }
  if (html.includes('save-coordinator.js')) {
    const coordinatorVersion = html.match(/save-coordinator\.js\?v=(\d+)/);
    assert(coordinatorVersion && Number(coordinatorVersion[1]) >= 2026071502, `${file} should load the fixed save coordinator`);
  }
});

assert(
  Number((fs.readFileSync('quote-builder.html', 'utf8').match(/quote-storage\.js\?v=(\d+)/) || [])[1]) >= 2026071901,
  'Quote Builder should load the cloud acknowledgement listener immediately'
);

console.log('durable save version matching checks passed');
