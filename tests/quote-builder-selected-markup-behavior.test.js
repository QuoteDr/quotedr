const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const markupStart = source.indexOf('function quoteItemOwnMarkupPercent');
const markupEnd = source.indexOf('function isMetricMeasurement', markupStart);
const bulkStart = source.indexOf('const quoteBuilderLineItemDragKeys');
const bulkEnd = source.indexOf('async function createChoiceGroupFromRoomItems', bulkStart);

assert(markupStart >= 0 && markupEnd > markupStart, 'item markup helpers should be extractable');
assert(bulkStart >= 0 && bulkEnd > bulkStart, 'bulk item helpers should be extractable');

const counters = { undo: 0, render: 0, totals: 0, save: 0, unsaved: 0, alerts: 0 };
const context = {
  console,
  rooms: [],
  selectedIndexes: [],
  promptValue: null,
  document: {
    body: { classList: { remove() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (!selector.includes('.choice-group-select') || !selector.includes(':checked')) return [];
      return context.selectedIndexes.map((index) => ({ dataset: { itemIndex: String(index) } }));
    },
  },
  window: { _quoteDocumentType: 'quote' },
  qdPrompt: async () => context.promptValue,
  qdAlert: async () => { counters.alerts += 1; },
  qdConfirm: async () => true,
  qdTemplateEscapeHtml(value) { return String(value); },
  quoteBuilderSafeIconClass(value) { return String(value); },
  getQuoteDividerLabels() { return { singular: 'Room', singularLower: 'room' }; },
  _pushUndo() { counters.undo += 1; },
  renderRooms() { counters.render += 1; },
  calculateTotals() { counters.totals += 1; },
  saveSessionQuote() { counters.save += 1; },
  markUnsaved() { counters.unsaved += 1; },
  showToast() {},
};

vm.createContext(context);
vm.runInContext(source.slice(markupStart, markupEnd), context);
vm.runInContext(source.slice(bulkStart, bulkEnd), context);

function resetCounters() {
  Object.keys(counters).forEach((key) => { counters[key] = 0; });
}

async function run() {
  context.rooms = [{
    id: 1,
    name: 'Kitchen',
    markup: 10,
    items: [{ description: 'First' }, { description: 'Second' }, { description: 'Third' }],
  }];
  context.selectedIndexes = [0, 2];
  context.promptValue = '25';

  await context.applyMarkupToSelectedRoomItems(1);

  assert.strictEqual(context.rooms[0].items[0].markup, 25);
  assert.strictEqual(context.rooms[0].items[1].markup, undefined, 'unselected items should not be changed');
  assert.strictEqual(context.rooms[0].items[2].markup, 25);
  assert.strictEqual(context.quoteItemMarkupFactor(context.rooms[0], context.rooms[0].items[0]), 1.35, 'item markup should add to room markup');
  assert.strictEqual(context.quoteItemMarkupFactor(context.rooms[0], context.rooms[0].items[1]), 1.1);
  assert.strictEqual(context.quoteItemMarkupFactor({ markup: 10 }, { markup: 10 }), 1.2, '10% room plus 10% item should equal 20% total markup');
  assert.strictEqual(context.quoteItemMarkedAmount({ markup: 10 }, { markup: 10 }, 150), 180, '$150 with 10% room plus 10% item markup should total $180');
  assert(context.quoteItemMarkupBadgeHtml({ markup: 10, hideMarkup: true }, { markup: 10 }).includes('20% markup &middot; hidden from client'), '10% room plus 10% item should display as 20% total markup');
  const clickableBadge = context.quoteItemMarkupBadgeHtml({ id: 1, markup: 10, hideMarkup: true }, { markup: 10 }, 2);
  assert(clickableBadge.includes('role="button"') && clickableBadge.includes('tabindex="0"') && clickableBadge.includes('applyMarkupToRoomItem(1, 2)'), 'rendered item badges should open the single-item markup action by mouse or keyboard');
  assert(context.quoteItemMarkupBadgeHtml(context.rooms[0], context.rooms[0].items[0]).includes('35% markup &middot; hidden from client'), 'combined markup badge should show the total and hidden state');
  assert(context.quoteItemMarkupBadgeHtml(Object.assign({}, context.rooms[0], { hideMarkup: false }), context.rooms[0].items[0]).includes('35% markup &middot; shown to client'), 'combined markup badge should show the client-visible state');
  assert(context.quoteItemMarkupBadgeHtml({ markup: 10, hideMarkup: true }, {}).includes('10% markup &middot; hidden from client'), 'room-only markup should use the same badge');
  assert.strictEqual(context.quoteItemMarkupBadgeHtml({ markup: 0 }, {}), '', 'zero total markup should not render a badge');
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1, alerts: 0 });

  resetCounters();
  context.selectedIndexes = [0];
  context.promptValue = '0';
  await context.applyMarkupToSelectedRoomItems(1);
  assert.strictEqual(context.rooms[0].items[0].markup, 0, 'zero should mean no additional item markup');
  assert.strictEqual(context.quoteItemMarkupFactor(context.rooms[0], context.rooms[0].items[0]), 1.1, 'room markup should still apply when item markup is zero');

  resetCounters();
  context.promptValue = '';
  await context.applyMarkupToSelectedRoomItems(1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(context.rooms[0].items[0], 'markup'), false, 'blank should remove the additional item markup');
  assert.strictEqual(context.quoteItemMarkupFactor(context.rooms[0], context.rooms[0].items[0]), 1.1, 'cleared items should retain room markup');

  resetCounters();
  context.selectedIndexes = [0, 2];
  context.promptValue = '250';
  await context.applyMarkupToRoomItem(1, 1);
  assert.strictEqual(context.rooms[0].items[1].markup, 250, 'the badge shortcut should allow markup above 100%');
  assert.strictEqual(context.rooms[0].items[2].markup, 25, 'the badge shortcut must not change other selected items');
  assert.strictEqual(context.quoteItemMarkupFactor(context.rooms[0], context.rooms[0].items[1]), 3.6, '250% item plus 10% room should produce 260% total markup');
  assert.deepStrictEqual(counters, { undo: 1, render: 1, totals: 1, save: 1, unsaved: 1, alerts: 0 });

  resetCounters();
  context.promptValue = '-1';
  await context.applyMarkupToRoomItem(1, 1);
  assert.strictEqual(counters.alerts, 1, 'negative markup should explain that a non-negative percentage is required');
  assert.strictEqual(counters.undo, 0, 'invalid markup should not create undo state');
  assert.strictEqual(counters.render, 0, 'invalid markup should not mutate or rerender the quote');
}

run().then(() => console.log('quote builder selected markup behavior test passed'));
