const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const match = source.match(/async function createInteractiveQuoteLink\(\) \{[\s\S]*?\r?\n        \}\r?\n\r?\n        async function previewInteractiveQuote/);
if (!match) throw new Error('createInteractiveQuoteLink should exist');

const functionSource = match[0].replace(/\r?\n\r?\n        async function previewInteractiveQuote$/, '');
let secureLinkDocumentId = null;
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
  saveQuoteForSharing: async () => ({
    state: 'cloud_saved',
    data: [{ id: 'saved-quote-id', updated_at: '2026-07-15T20:00:00.000Z' }],
    error: null
  }),
  createSecureClientShareLink: async (documentId) => {
    secureLinkDocumentId = documentId;
    return { url: 'https://quotedr.io/interactive-quote-viewer.html?id=saved-quote-id&token=test' };
  },
  console,
  JSON,
  Error,
  Array,
  Object
};

vm.createContext(context);
vm.runInContext(`var _quoteStyle = {}; ${functionSource}; this.createLink = createInteractiveQuoteLink;`, context);

(async () => {
  const url = await context.createLink();
  if (secureLinkDocumentId !== 'saved-quote-id') {
    throw new Error('secure link creation should receive the id from an array-shaped save acknowledgement');
  }
  if (context.window._supabaseQuoteId !== 'saved-quote-id') {
    throw new Error('the current quote should adopt the saved cloud id');
  }
  if (context.window._loadedQuoteData.supabaseId !== 'saved-quote-id') {
    throw new Error('the loaded quote snapshot should adopt the saved cloud id');
  }
  if (stored.ald_active_quote_id !== 'saved-quote-id') {
    throw new Error('the active quote id should be persisted locally');
  }
  if (!url.includes('token=test')) throw new Error('the secure client URL should be returned');
  console.log('quote link document id behavior test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
