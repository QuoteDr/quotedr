const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const quoteStorage = fs.readFileSync('quote-storage.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');

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

const context = { console, Date, JSON, Promise, String, Array, parseInt };
vm.createContext(context);
[
  'quoteStorageRecoveryQuoteFromOperation',
  'quoteStorageRecoveryCandidates'
].forEach(name => vm.runInContext(extractFunction(quoteStorage, name), context));

const older = {
  key: 'user|quote|older',
  operationId: 'operation-older',
  revision: 'revision-older',
  entityType: 'quote',
  entityId: '11111111-1111-1111-1111-111111111111',
  entityLabel: 'Older Deck',
  action: 'update',
  state: 'local_pending',
  localSavedAt: '2026-07-14T10:00:00.000Z',
  baseVersion: '2026-07-14T09:00:00.000Z',
  payload: { quoteTitle: 'Older Deck', quoteNumber: 'Q-1', rooms: [{ name: 'Deck', items: [] }] }
};
const newer = {
  ...older,
  key: 'user|quote|newer',
  operationId: 'operation-newer',
  revision: 'revision-newer',
  entityId: '22222222-2222-2222-2222-222222222222',
  entityLabel: 'Newest / Deck',
  localSavedAt: '2026-07-14T11:00:00.000Z',
  payload: { quoteTitle: 'Newest / Deck', quoteNumber: 'Q-2', rooms: [{ name: 'Main Deck', items: [{ description: 'Rail' }] }] }
};

const candidates = context.quoteStorageRecoveryCandidates({
  format: 'quotedr-recovery-v1',
  operations: [
    older,
    { entityType: 'client_database', payload: { clients: [] } },
    { ...newer, action: 'delete' },
    newer
  ]
});

assert.strictEqual(candidates.length, 2, 'only recoverable quote upserts should become quote files');
assert.strictEqual(candidates[0].quote.quoteTitle, 'Newest / Deck', 'the newest local quote should be offered first');
assert.strictEqual(candidates[0].quote.supabaseId, newer.entityId, 'the cloud quote identity should survive recovery');
assert.strictEqual(candidates[0].quote._serverUpdatedAt, newer.baseVersion, 'the loaded cloud base version should survive recovery');
assert.strictEqual(candidates[0].quote._quoteDrBackup.revision, 'revision-newer', 'the exported quote should identify its durable revision');
assert(Array.isArray(candidates[0].quote.rooms), 'the recovery export should remain a normal quote document');

assert(
  quoteStorage.includes("return title + ' - Recovery - ' + new Date().toISOString().slice(0, 10) + '.qdr'") &&
    quoteStorage.includes("title.replace(/[<>:\"/\\\\|?*"),
  'quote recovery exports should use a sanitized normal .qdr filename'
);

context.quoteStorageChooseRecoveryQuote = async values => values[0];
vm.runInContext(extractFunction(quoteStorage, 'quoteStorageResolveOpenedData'), context);

(async () => {
  const resolvedBundle = await context.quoteStorageResolveOpenedData({
    format: 'quotedr-recovery-v1',
    operations: [older, newer]
  });
  assert.strictEqual(resolvedBundle.fromRecovery, true, 'a recovery bundle should enter the recovery restore path');
  assert.strictEqual(resolvedBundle.data.quoteTitle, 'Newest / Deck', 'recovery bundle restore should use the selected quote');

  const resolvedQuote = await context.quoteStorageResolveOpenedData(candidates[0].quote);
  assert.strictEqual(resolvedQuote.fromRecovery, true, 'a directly exported .qdr recovery quote should retain recovery semantics');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

assert(
  quoteStorage.includes("input.accept = '.qdr,.aldquote,.json,application/json'") &&
    quoteStorage.includes("['.qdr', '.aldquote', '.json']") &&
    quoteStorage.includes('id="openLocalFileBtn"') &&
    !quoteStorage.includes('id="openLocalFileBtn" style="display:none;"'),
  'Open Local File should accept quote and recovery files on desktop and mobile'
);

assert(
  quoteStorage.includes('window.qdExportQuoteRecovery = quoteStorageExportRecoveryQuote') &&
    quoteStorage.includes("updateSaveStatus('pending', 'Backup opened on this device - syncing to cloud')") &&
    quoteStorage.includes('setTimeout(function() { doAutoSave(); }, 0)'),
  'opening a recovery quote should preserve the file and immediately retry cloud sync'
);

assert(
  coordinator.includes('var RECOVERY_GUIDANCE_ATTEMPTS = 3') &&
    coordinator.includes("scheduleRecoveryGuidance(current, { localFailed: false })") &&
    coordinator.includes("scheduleRecoveryGuidance(operation, { localFailed: true })") &&
    coordinator.includes('Cloud Save Needs Attention') &&
    coordinator.includes('File &gt; Open &gt; Open Local File') &&
    coordinator.includes('data-qd-guidance-export') &&
    coordinator.includes('data-qd-guidance-retry') &&
    coordinator.includes('data-qd-guidance-status'),
  'repeated cloud failures and local storage failures should show direct recovery guidance once'
);

assert(
  coordinator.includes('async function retryEmergencyRecovery()') &&
    coordinator.includes('await persistOperationAndSnapshot(operation, snapshot)') &&
    coordinator.includes('await retryPendingSaves();'),
  'Retry Now should be able to recover an operation that initially failed local persistence'
);

console.log('quote save recovery UX checks passed');
