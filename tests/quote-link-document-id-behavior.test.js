const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const match = source.match(/async function saveQuoteForPortalSharing\(\) \{[\s\S]*?\r?\n        \}\r?\n\r?\n        function getQuoteAdminPreviewUrl/);
if (!match) throw new Error('saveQuoteForPortalSharing should exist');

const functionSource = match[0].replace(/\r?\n\r?\n        function getQuoteAdminPreviewUrl$/, '');
let secureLinkCalls = 0;
let saveOptions = null;
const stored = {};
const context = {
  window: {
    location: { href: 'http://127.0.0.1:8143/quote-builder.html' },
    _supabaseQuoteId: null,
    _loadedQuoteData: { existing: true }
  },
  document: { getElementById: () => null },
  localStorage: { setItem: (key, value) => { stored[key] = value; } },
  readQuoteStyleFromControls: () => ({ accent: '#123456' }),
  syncQuoteStyleGlobal: () => {},
  saveQuoteStyleDefaults: async () => {},
  collectQuoteData: () => ({ quoteNumber: 'Q-100', type: 'quote', rooms: [] }),
  buildQuotePaymentTerms: () => ({ version: 2, deposit_required: true, kind: 'percent', percent: 50 }),
  quoteDepositDueCents: () => 0,
  saveQuoteForSharing: async (_quoteData, options) => {
    saveOptions = options;
    return ({
    state: 'cloud_saved',
    data: [{ id: 'saved-quote-id', updated_at: '2026-07-15T20:00:00.000Z' }],
    error: null
    });
  },
  createSecureClientShareLink: async () => { secureLinkCalls += 1; throw new Error('standalone token should not be requested'); },
  console,
  JSON,
  Error,
  Array,
  Object
};

vm.createContext(context);
vm.runInContext(`var _quoteStyle = {}; ${functionSource}; this.saveForPortal = saveQuoteForPortalSharing;`, context);

(async () => {
  const savedQuote = await context.saveForPortal();
  if (secureLinkCalls !== 0) throw new Error('saving for portal assignment should not mint a standalone token');
  if (!saveOptions || saveOptions.markShared !== false) throw new Error('preparing the portal picker should preserve draft status');
  if (context.window._supabaseQuoteId !== 'saved-quote-id') {
    throw new Error('the current quote should adopt the saved cloud id');
  }
  if (context.window._loadedQuoteData.supabaseId !== 'saved-quote-id') {
    throw new Error('the loaded quote snapshot should adopt the saved cloud id');
  }
  if (stored.ald_active_quote_id !== 'saved-quote-id') {
    throw new Error('the active quote id should be persisted locally');
  }
  if (savedQuote.supabaseId !== 'saved-quote-id') throw new Error('the saved quote should be returned for portal assignment');
  console.log('quote link document id behavior test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
