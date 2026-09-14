const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'quote-builder.html'), 'utf8');
const start = html.indexOf('        const _undoStack = []');
const end = html.indexOf("        document.addEventListener('keydown'", start);
let current = { rooms: [{ name: 'Imported' }], quoteTitle: 'Imported title' };
const before = { rooms: [{ name: 'Original' }], quoteTitle: 'Original title' };
let confirmed = false, applied = 0, alerts = 0, dirty = 0;
const context = { window: { _supabaseQuoteId: null }, document: { getElementById: () => null, querySelectorAll: () => [] },
  collectQuoteData: () => current, qdConfirm: async () => confirmed, qdAlert: () => { alerts++; },
  applyQuoteData: data => { applied++; current = data; }, markUnsaved: () => { dirty++; } };
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
(async () => {
  context.window.recordQuoteImportUndo(before);
  await context.undoLastAction();
  assert.equal(applied, 0, 'cancelling preserves the import and undo entry');
  confirmed = true;
  await context.undoLastAction();
  assert.equal(applied, 1);
  assert.equal(current.quoteTitle, 'Original title');
  assert.equal(current.rooms[0].name, 'Original');
  assert.equal(dirty, 1);
  assert.equal(context.window._supabaseQuoteId, null, 'undo does not reattach to an old saved document');
  context.window.recordQuoteImportUndo(before);
  current = { ...current, quoteTitle: 'Newer edit' };
  await context.undoLastAction();
  assert.equal(applied, 1, 'newer edits cannot be overwritten');
  assert.equal(alerts, 1);
  assert.match(html, /document.activeElement.isContentEditable/);
  assert.match(html, /dialog\[open\], \.modal.show/);
  console.log('Import undo confirmation, restoration and stale-snapshot guards passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
