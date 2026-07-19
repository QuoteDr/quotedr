const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');

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

function makeDocument() {
  const attributes = new Map();
  return {
    documentElement: {
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name) || null; }
    },
    getElementById(id) {
      return id === 'quoteNumber' ? { value: 'Q-100' } : null;
    }
  };
}

async function testConflictRecoveryAcknowledgementExit() {
  const removed = [];
  const clearedTimers = [];
  const discarded = [];
  let armed = 0;
  const context = {
    console,
    Object,
    String,
    document: makeDocument(),
    localStorage: {
      removeItem(key) { removed.push(key); }
    },
    clearTimeout(id) { clearedTimers.push(id); },
    armQuotePortalLockRedirect() { armed += 1; },
    quoteStorageRenderRemoteUpdateBanner() {},
    quoteStorageBroadcastCloudUpdate() {},
    quoteStorageEnsureRealtimeSubscription() {},
    quoteStorageHandleRemoteSignal() {},
    QuoteDrSave: {
      async discardPending(type, id, options) { discarded.push({ type, id, options }); }
    }
  };
  context.window = context;
  context._supabaseQuoteId = 'quote-1';
  context._loadedQuoteData = { clientName: 'Client', portal_visible: false };
  context._currentQuoteData = { clientName: 'Client', portal_visible: false };
  vm.createContext(context);
  vm.runInContext('var unsavedChanges = true; var _autoSaveTimer = 11; var autoSaveTimer = 12; var quoteStorageRemoteUpdate = { hasLocalEdits: true }; var quoteStorageRemotePromptOpen = true; var quoteStorageInstanceId = "tab-1";', context);
  ['quoteDataIsPortalLockedForBuilder', 'quoteStoragePortalExitActive', 'quoteStorageExitPortalLockedBuilder', 'applyQuoteCloudAcknowledgement']
    .forEach(name => vm.runInContext(extractFunction(storage, name), context));

  context.applyQuoteCloudAcknowledgement({
    detail: {
      operation: {
        entityType: 'quote',
        entityId: 'quote-1',
        action: 'update',
        payload: {
          supabaseId: 'quote-1',
          quoteNumber: 'Q-100',
          portal_visible: true,
          portal_id: 'portal-1',
          _editorInstanceId: 'tab-1'
        }
      },
      result: { data: { id: 'quote-1', updated_at: '2026-07-19T15:40:08.000Z' } },
      version: '2026-07-19T15:40:08.000Z'
    }
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(armed, 1, 'a conflict-recovery acknowledgement that published the quote should arm the builder exit');
  assert.strictEqual(context._quoteLockedAfterPortalPublish, true);
  assert.strictEqual(context._currentQuoteData.portal_visible, true);
  assert.strictEqual(context._loadedQuoteData.portal_visible, true);
  assert.strictEqual(context.unsavedChanges, false, 'the locked builder must not show an unload save prompt');
  assert.deepStrictEqual(clearedTimers, [11, 12], 'both autosave timers should be cancelled');
  assert.strictEqual(discarded.length, 1);
  assert.strictEqual(discarded[0].type, 'quote');
  assert.strictEqual(discarded[0].id, 'quote-1');
  assert.strictEqual(discarded[0].options.state, 'portal_locked');
  assert(removed.includes('ald_remote_conflict_quote:quote-1'), 'the resolved local conflict marker should be removed');
  assert.strictEqual(context.document.documentElement.getAttribute('data-quote-portal-locked'), 'true');
}

function createBuilderRedirectContext(options = {}) {
  const queued = [];
  const removed = [];
  const calls = { replace: 0, clearRestore: 0, clearedTimers: [] };
  const context = {
    Object,
    String,
    document: makeDocument(),
    localStorage: { removeItem(key) { removed.push(key); } },
    clearTimeout(id) { calls.clearedTimers.push(id); },
    setTimeout(fn) { queued.push(fn); return queued.length; },
    clearPortalLockedBuilderRestoreState() { calls.clearRestore += 1; },
    location: { replace(url) { calls.replace += 1; calls.url = url; } }
  };
  context.window = context;
  context._resumeQuoteEmailAfterPortal = options.resumeEmail === true;
  context._quotePortalPublishInProgress = options.publishInProgress === true;
  context._supabaseQuoteId = 'quote-1';
  vm.createContext(context);
  vm.runInContext('var unsavedChanges = true; var _autoSaveTimer = 21; var autoSaveTimer = 22;', context);
  ['redirectPortalLockedQuoteBuilderToDashboard', 'armQuotePortalLockRedirect', 'finishDeferredQuotePortalRedirect']
    .forEach(name => vm.runInContext(extractFunction(builder, name), context));
  return { context, queued, calls, removed };
}

function testRedirectCommitAndDeferral() {
  const direct = createBuilderRedirectContext();
  direct.context.armQuotePortalLockRedirect({ supabaseId: 'quote-1', portal_visible: true });
  assert.strictEqual(direct.context.unsavedChanges, false);
  assert.strictEqual(direct.queued.length, 1, 'an ordinary portal publish should schedule an immediate exit');
  direct.queued.shift()();
  assert.strictEqual(direct.calls.clearRestore, 1);
  assert.strictEqual(direct.calls.replace, 1);
  assert.strictEqual(direct.calls.url, 'dashboard.html');
  direct.context.redirectPortalLockedQuoteBuilderToDashboard();
  assert.strictEqual(direct.calls.replace, 1, 'the dashboard navigation should commit only once');

  const publishing = createBuilderRedirectContext({ publishInProgress: true });
  publishing.context.armQuotePortalLockRedirect({ supabaseId: 'quote-1', portal_visible: true });
  assert.strictEqual(publishing.context._quotePortalRedirectPending, true);
  assert.strictEqual(publishing.queued.length, 0, 'secure portal-link work should finish before navigation');

  const email = createBuilderRedirectContext({ resumeEmail: true });
  email.context.armQuotePortalLockRedirect({ supabaseId: 'quote-1', portal_visible: true });
  assert.strictEqual(email.context._quotePortalRedirectAfterEmail, true);
  assert.strictEqual(email.queued.length, 0, 'portal-assisted email should be allowed to finish before navigation');
  assert.strictEqual(email.context.finishDeferredQuotePortalRedirect(), true);
  assert.strictEqual(email.calls.replace, 1, 'even an email validation exit should finish the locked-builder redirect');
}

(async function run() {
  await testConflictRecoveryAcknowledgementExit();
  testRedirectCommitAndDeferral();
  console.log('quote portal publish exit behavior tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
