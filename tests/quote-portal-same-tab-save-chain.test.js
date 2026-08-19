const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

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

function createContext(options = {}) {
  const v1 = '2026-07-19T14:00:00.000Z';
  const v2 = options.localVersion || '2026-07-19T14:01:00.000Z';
  const v3 = '2026-07-19T14:02:00.000Z';
  const calls = { saves: [], redirects: 0 };
  const elements = {
    clientName: { value: 'Live Client' },
    clientEmail: { value: 'live@example.test' },
    quoteNumber: { value: 'Q-100' },
    interactiveLinkInput: { value: '' },
    openViewerBtn: { href: '' }
  };
  const context = {
    console,
    Array,
    Date,
    Math,
    Object,
    Promise,
    String,
    URLSearchParams,
    setTimeout,
    document: { getElementById: id => elements[id] || null },
    getQuoteDividerLabels: () => ({ singular: 'Room', plural: 'Rooms' }),
    collectQuoteData: () => ({
      clientName: 'Live Client',
      clientEmail: 'live@example.test',
      quoteNumber: 'Q-100',
      supabaseId: 'quote-1',
      rooms: [{ name: 'Live room' }],
      grandTotal: 275,
      _editorInstanceId: 'same-tab',
      _serverUpdatedAt: v2,
      portal_visible: false
    }),
    confirmQuotePortalLockBeforePublish: async () => true,
    findBuilderPortalStableShare: () => ({ token: '', anchorId: '', createdAt: '' }),
    applyBuilderPortalStableShare: (data, share) => {
      if (share && share.token && share.anchorId) {
        data.portal_share_token = share.token;
        data.portal_share_anchor_id = share.anchorId;
      }
      return data;
    },
    updateLegacyInvoicePortalRows: async () => {},
    saveQuoteForSharing: async quote => {
      calls.saves.push(JSON.parse(JSON.stringify(quote)));
      if (options.conflict) {
        return { error: { code: '409', message: 'This quote was updated in another tab or device.' } };
      }
      return { state: 'cloud_saved', data: { id: 'quote-1', updated_at: v3 }, error: null };
    },
    createSecureClientShareLink: async () => options.shareFailure
      ? null
      : ({ id: 'share-1', token: 'token-1', url: 'https://example.test/client?token=token-1' }),
    builderPortalUrlFromStableShare: share => `https://example.test/p/test-company/${share.token}`,
    getClientPortalBaseUrl: () => 'https://example.test/client-portal.html',
    setQuoteUrlFromSecureShare: () => {},
    updateQuotePortalButton: () => {},
    armQuotePortalLockRedirect: () => { calls.redirects += 1; },
    makeInvoicePortalId: () => 'generated-portal',
    _escapeHtml: value => String(value)
  };
  context.window = context;
  context._supabaseQuoteId = 'quote-1';
  context._quoteServerUpdatedAt = v2;
  context._currentQuoteData = {
    clientName: 'Cached Client',
    quoteNumber: 'Q-100',
    supabaseId: 'quote-1',
    rooms: [{ name: 'Stale room' }],
    grandTotal: 100,
    _editorInstanceId: 'same-tab',
    _serverUpdatedAt: v1,
    style: { accent: '#123456' },
    portal_visible: false
  };
  context._loadedQuoteData = { _serverUpdatedAt: v2, portal_visible: false };
  vm.createContext(context);
  ['getCurrentQuoteDataForPortal', 'markQuoteForPortal', 'ensureQuotePortalUrl']
    .forEach(name => vm.runInContext(extractFunction(builder, name), context));
  return { context, calls, v1, v2, v3 };
}

(async function run() {
  const success = createContext();
  const portal = { id: 'portal-1', name: 'Client Portal', clientName: 'Live Client', clientEmail: 'live@example.test', pin: '1234' };
  const url = await success.context.ensureQuotePortalUrl(null, portal);

  assert.strictEqual(url, 'https://example.test/p/test-company/token-1');
  assert.strictEqual(success.calls.saves.length, 1, 'portal publishing should perform one quote save');
  assert.strictEqual(success.calls.saves[0]._serverUpdatedAt, success.v2, 'portal publishing should use the newest same-tab cloud acknowledgement');
  assert.strictEqual(success.calls.saves[0].rooms[0].name, 'Live room', 'portal publishing should use current builder contents instead of the old share snapshot');
  assert.deepStrictEqual(success.calls.saves[0].style, { accent: '#123456' }, 'share-only metadata should survive the fresh builder merge');
  assert.strictEqual(success.calls.saves[0].portal_visible, true);
  assert.strictEqual(success.context._currentQuoteData._serverUpdatedAt, success.v3, 'the successful portal save should become the next local cloud base');
  assert.strictEqual(success.context._quoteServerUpdatedAt, success.v3);
  assert.strictEqual(success.calls.redirects, 1, 'the builder should lock and redirect only after a confirmed portal save');

  const conflict = createContext({ localVersion: '2026-07-19T14:00:00.000Z', conflict: true });
  let rejected = null;
  try {
    await conflict.context.ensureQuotePortalUrl(null, portal);
  } catch (error) {
    rejected = error;
  }
  assert(rejected && String(rejected.code) === '409', 'a genuinely stale base should still surface the conflict');
  assert.strictEqual(conflict.calls.saves.length, 1, 'a conflict should not be silently retried or force-overwritten');
  assert.strictEqual(conflict.calls.redirects, 0, 'a failed portal save must not lock or redirect the builder');

  const shareFailure = createContext({ shareFailure: true });
  let shareError = null;
  try {
    await shareFailure.context.ensureQuotePortalUrl(null, portal);
  } catch (error) {
    shareError = error;
  }
  assert(shareError && /client portal link/i.test(shareError.message), 'a secure-link failure should remain visible to the caller');
  assert.strictEqual(shareFailure.calls.saves.length, 1);
  assert.strictEqual(shareFailure.calls.redirects, 1, 'once the portal save is confirmed, even a later secure-link failure must still eject the locked builder');

  console.log('quote portal same-tab save chain tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
