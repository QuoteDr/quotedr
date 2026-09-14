const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'quote-import.js'), 'utf8');
let choice = 'cancel', saves = 0, proceeded = 0, prompts = 0;
let library = {};
let checked = [{ dataset: { index: '0' } }];
const context = {
  _quoteImportState: { parsed: { quote: { rooms: [{}] }, savedItemCandidates: [{ category: 'Doors', name: 'Install door' }] }, requiresReviewAcknowledgement: false },
  document: { getElementById: () => null, querySelectorAll: () => checked, querySelector: () => null },
  localStorage: { getItem: () => JSON.stringify(library) }, asArray: x => Array.isArray(x) ? x : [],
  askToSaveImportCandidates: async () => { prompts++; return choice; },
  saveQuoteImportCandidates: async () => { saves++; },
  deepClone: x => { proceeded++; throw new Error('Reached quote application'); },
};
vm.createContext(context);
for (const name of ['selectedUnsavedImportCandidates', 'applyImportedQuote']) {
  const start = source.search(new RegExp('    (?:async )?function ' + name + '\\('));
  vm.runInContext(source.slice(start, source.indexOf('\n    }', start) + 6), context);
}
(async () => {
  await context.applyImportedQuote();
  assert.equal(proceeded, 0); assert.equal(saves, 0);
  choice = 'continue';
  await assert.rejects(context.applyImportedQuote(), /Reached quote application/);
  assert.equal(saves, 0);
  choice = 'save';
  await assert.rejects(context.applyImportedQuote(), /Reached quote application/);
  assert.equal(saves, 1);
  library = { Doors: [{ name: 'INSTALL DOOR' }] };
  assert.equal(context.selectedUnsavedImportCandidates().length, 0);
  await assert.rejects(context.applyImportedQuote(), /Reached quote application/);
  assert.equal(prompts, 3, 'already saved selections do not prompt again');
  checked = [];
  assert.equal(context.selectedUnsavedImportCandidates().length, 0);
  console.log('Import save reminder choice and duplicate tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
