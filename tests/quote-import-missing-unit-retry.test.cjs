const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const field = { value: 'ea' };
const context = { window: {}, console, document: { getElementById: id => id === 'quoteImportMissingUnit' ? field : null } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'quote-import.js'), 'utf8'), context);
const importer = context.window.QuoteDrQuoteImport;
for (const label of ['', 'ea', 'Flatrate', 'ls']) {
  field.value = label;
  const parsed = importer.normalizeImportedQuote({ rooms: [{ name: 'Room', items: [
    { description: 'Install cabinet', quantity: 2, rate: 100, total: 200 },
    { description: 'Explicit lump sum', unit: 'ls', quantity: 1, rate: 300 },
    { description: 'Explicit each', unit: 'ea', quantity: 3, rate: 10 },
  ] }] });
  const items = parsed.quote.rooms[0].items;
  assert.equal(items[0].unitType, label);
  assert.equal(items[0].unitWasMissing, true);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].total, 200);
  assert.equal(items[1].unitType, 'ls');
  assert.equal(items[1].unitWasMissing, false);
  assert.equal(items[2].unitType, 'ea');
  const candidates = importer.mergeSavedItemCandidates(parsed.quote, []);
  assert.equal(candidates[0].unitType, label);
  assert.equal(candidates[0].unitWasMissing, true);
  const rooms = importer.prepareRoomsForBuilder(parsed.quote.rooms, 0);
  assert.equal(rooms[0].items[0].unitType, label);
  assert.equal('unitWasMissing' in rooms[0].items[0], false);
}
const edge = fs.readFileSync(path.join(root, 'supabase/functions/quote-import/index.ts'), 'utf8');
const retry = edge.slice(edge.indexOf('async function fetchQuoteImportWithRetry'), edge.indexOf('const corsHeaders'))
  .replace('url: string, options: RequestInit): Promise<Response>', 'url, options)');
(async () => {
  for (const status of [200, 400, 401, 429, 500, 502, 503, 504]) {
    let calls = 0;
    let waits = 0;
    const ctx = { fetch: async () => { calls++; return { status, body: { cancel: async () => {} } }; }, setTimeout: fn => { waits++; fn(); } };
    vm.createContext(ctx);
    vm.runInContext(retry, ctx);
    await ctx.fetchQuoteImportWithRetry('https://example.test', {});
    const retriable = [500, 502, 503, 504].includes(status);
    assert.equal(calls, retriable ? 2 : 1);
    assert.equal(waits, retriable ? 1 : 0);
  }
  console.log('Missing-unit labels, builder/library preservation and bounded retry tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
