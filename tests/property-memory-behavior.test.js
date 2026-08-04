const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'property-memory.js'), 'utf8');

function makeContext() {
  const fields = {
    propertyMarkupApplyConfirm: { checked: false },
    propertyMarkupPercent: { value: '12.5' },
    propertyMarkupApplyBtn: { disabled: true },
    propertyMarkupCurrentState: { textContent: '' },
    propertyMemoryFormStatus: { className: '', textContent: '' }
  };
  const counters = { undo: 0, render: 0, session: 0, unsaved: 0, confirmations: [] };
  const context = {
    window: { confirm: () => true },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) { return fields[id] || null; }
    },
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    console,
    setTimeout,
    clearTimeout,
    Date,
    encodeURIComponent,
    isFinite,
    rooms: [
      { id: 1, markup: 5, hideMarkup: false, items: [{ markup: 7 }] },
      { id: 2, markup: 20, items: [{ markup: 3 }] }
    ],
    _pushUndo() { counters.undo += 1; },
    renderRooms() { counters.render += 1; },
    saveSessionQuote() { counters.session += 1; },
    markUnsaved() { counters.unsaved += 1; },
    async qdConfirm(message) { counters.confirmations.push(message); return true; }
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, fields, counters, api: context.window.QuoteDrPropertyMemory };
}

async function run() {
  const { context, fields, counters, api } = makeContext();
  const test = api.__test;

  assert.strictEqual(
    test.normalizeAddress(' 123 Main Street, Toronto, ON '),
    '123 main st toronto on',
    'street suffixes, punctuation, case, and whitespace should normalize consistently'
  );
  assert.strictEqual(
    test.normalizeAddress('55 King Avenue # 4'),
    '55 king ave unit 4',
    'unit identifiers should remain part of the normalized property address'
  );
  assert.strictEqual(test.storageKey('123 main st'), 'property_memory:123%20main%20st');
  assert.strictEqual(test.localKey('123 main st'), 'ald_property_memory:123%20main%20st');

  const empty = test.normalizeRecord({}, '123 Main Street', '123 main st');
  assert.strictEqual(test.hasMeaningfulData(empty), false, 'address metadata alone should not show the Saved badge');
  assert.strictEqual(test.hasMeaningfulData({ generalSiteNotes: 'Use rear entrance' }), true);
  assert.strictEqual(test.hasMeaningfulData({ propertyContacts: { manager: { name: 'Alex' } } }), true);
  assert.strictEqual(test.hasMeaningfulData({ markupRule: { percent: 0 } }), true, 'an explicit zero-percent rule is still saved property information');
  assert.strictEqual(test.normalizeMarkupPercent('17.25'), 17.25);
  assert.strictEqual(test.normalizeMarkupPercent(180), 100);
  assert.strictEqual(test.normalizeMarkupPercent(-5), 0);
  assert.strictEqual(test.normalizeMarkupPercent(''), null);

  const normalized = test.normalizeRecord({
    clientName: 'Must not be copied',
    generalSiteNotes: '  Protect hardwood  ',
    propertyContacts: { tenant: { name: ' Jamie ', email: ' tenant@example.com ' } },
    markupRule: { percent: '8.5', note: ' constrained access ' }
  }, '123 Main Street', '123 main st');
  assert.strictEqual(normalized.generalSiteNotes, 'Protect hardwood');
  assert.strictEqual(normalized.propertyContacts.tenant.name, 'Jamie');
  assert.strictEqual(normalized.markupRule.percent, 8.5);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, 'clientName'), false, 'personal client fields must not enter property memory');

  await api.applyMarkupToQuote();
  assert.deepStrictEqual(context.rooms.map(room => room.markup), [5, 20], 'unchecked markup must never affect the quote');
  assert.strictEqual(counters.confirmations.length, 0, 'unchecked markup must not even open the confirmation');

  fields.propertyMarkupApplyConfirm.checked = true;
  await api.applyMarkupToQuote();
  assert.deepStrictEqual(context.rooms.map(room => room.markup), [12.5, 12.5]);
  assert.deepStrictEqual(context.rooms.map(room => room.items[0].markup), [7, 3], 'property markup must preserve individual item markup');
  assert.strictEqual(context.rooms[0].hideMarkup, false, 'existing client visibility settings should be preserved');
  assert.strictEqual(context.rooms[1].hideMarkup, true, 'new room markup visibility should default to hidden');
  assert.strictEqual(counters.undo, 1);
  assert.strictEqual(counters.render, 1);
  assert.strictEqual(counters.session, 1);
  assert.strictEqual(counters.unsaved, 1);
  assert(counters.confirmations[0].includes('replaces existing room markup percentages'));
  assert.strictEqual(fields.propertyMarkupApplyConfirm.checked, false, 'the opt-in control must reset after applying');

  console.log('property memory behavior tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
