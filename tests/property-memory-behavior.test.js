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
    propertyMarkupAlwaysApply: { checked: false },
    propertyMarkupAutomaticState: { className: '', textContent: '' },
    propertyMemoryFormStatus: { className: '', textContent: '' }
  };
  const counters = { undo: 0, render: 0, session: 0, unsaved: 0, confirmations: [] };
  counters.toasts = [];
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
  context.showToast = function(message, type) { counters.toasts.push({ message, type }); };
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
  assert.strictEqual(empty.markupRule.alwaysApply, false, 'legacy records must keep automatic application off');
  const automaticRecord = test.normalizeRecord({
    markupRule: { percent: '14.5', alwaysApply: true }
  }, '123 Main Street', '123 main st');
  assert.strictEqual(automaticRecord.markupRule.alwaysApply, true);
  assert.strictEqual(automaticRecord.markupRule.percent, 14.5);

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

  context.rooms = [
    { id: 1, markup: 9, hideMarkup: false, items: [{ markup: 7 }] },
    { id: 2, markup: 0, items: [{ markup: 3 }] },
    { id: 3, hideMarkup: false, items: [{ markup: 4 }] }
  ];
  test.activateAutomaticMarkupRule({ markupRule: { percent: 25, alwaysApply: false } }, '123 main st', { applyNow: false });
  assert.strictEqual(api.applyAutomaticMarkupToUnmarkedRooms({ render: false, persist: false, undo: false }), 0, 'disabled automatic rules must not affect pricing');

  const autoAppliedCount = test.activateAutomaticMarkupRule({ markupRule: { percent: 14.5, alwaysApply: true } }, '123 main st', { applyNow: true, render: false, persist: false, undo: false });
  assert.strictEqual(autoAppliedCount, 1, 'automatic markup should only target rooms without a manual room markup');
  assert.deepStrictEqual(context.rooms.map(room => room.markup), [9, 0, 14.5], 'manual markups, including explicit zero, must be preserved');
  assert.deepStrictEqual(context.rooms.map(room => room.items[0].markup), [7, 3, 4], 'automatic room markup must not alter item markup');
  assert.strictEqual(context.rooms[0].hideMarkup, false, 'manual visibility should remain unchanged');
  assert.strictEqual(context.rooms[2].hideMarkup, false, 'existing visibility on an unmarked room should remain unchanged');
  assert(counters.toasts[0].message.includes('Existing manual room markups were kept.'));

  context.rooms.push({ id: 4, items: [] });
  assert.strictEqual(api.applyAutomaticMarkupToUnmarkedRooms({ render: false, persist: false, undo: false, announce: false }), 1, 'new unmarked rooms should inherit the active property rule');
  assert.strictEqual(context.rooms[3].markup, 14.5);
  assert.strictEqual(context.rooms[3].hideMarkup, true, 'automatic markup visibility should default to hidden');

  context.rooms = [{ id: 20, items: [] }];
  test.activateAutomaticMarkupRule({ markupRule: { percent: 14.5, alwaysApply: true } }, '123 main st', { applyNow: false });
  assert.strictEqual(api.applyAutomaticMarkupToUnmarkedRooms({ render: false, persist: false, undo: false }), 0, 'saving an enabled rule must not change rooms already in the current quote');
  context.rooms.push({ id: 21, items: [] });
  assert.strictEqual(api.applyAutomaticMarkupToUnmarkedRooms({ render: false, persist: false, undo: false, announce: false }), 1, 'future rooms should use the active saved rule');
  assert.strictEqual(context.rooms[0].markup, undefined);
  assert.strictEqual(context.rooms[1].markup, 14.5);

  console.log('property memory behavior tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
