const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = { window: {}, document: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'quote-import.js'), 'utf8'), context);
const importer = context.window.QuoteDrQuoteImport;
const parsed = importer.normalizeImportedQuote({ rooms: [{ name: 'Bedroom', items: [
  { description: 'Install doors', itemDescription: 'Supply solid-core slabs.\nHang, balance and fit floor guides.', notes: 'Install doors', rate: 600 },
  { description: 'Paint walls', displayDescription: 'Two coats. Excludes ceiling.', notes: 'Patch existing holes.', rate: 200 },
  { description: 'Remove trim', displayDescription: 'Remove trim', notes: 'Remove trim', rate: 50 },
] }] });
for (const quote of [parsed, importer.normalizeImportedQuote(parsed)]) {
  const items = quote.quote.rooms[0].items;
  assert.equal(items[0].itemDescription, 'Supply solid-core slabs.\nHang, balance and fit floor guides.');
  assert.equal(items[1].itemDescription, 'Two coats. Excludes ceiling.\nPatch existing holes.');
  assert.equal(items[2].itemDescription, '');
  assert.equal(items[0].notes, '');
  const applied = importer.prepareRoomsForBuilder(quote.quote.rooms, 0);
  assert.equal(applied[0].items[0].itemDescription, items[0].itemDescription);
  assert.equal(applied[0].items[2].itemDescription, '');
  const saved = importer.extractSavedItemCandidates(quote.quote);
  assert.equal(saved[0].description, items[0].itemDescription);
  assert.equal(saved[2].description, '');
}
const edge = fs.readFileSync(path.join(root, 'supabase/functions/quote-import/index.ts'), 'utf8');
assert.match(edge, /"itemDescription": "Full supporting scope description/);
assert.match(edge, /wrapped lines and continuation paragraphs/);
console.log('Import description preservation tests passed');
