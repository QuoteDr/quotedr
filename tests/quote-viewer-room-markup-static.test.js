const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('function viewerRoomMarkupFactor(room)'), 'viewer should centralize room markup calculation');
assert(source.includes('function viewerRoomMarkedAmount(room, amount)'), 'viewer should centralize marked-up room pricing');
assert(source.includes('function viewerItemMarkupFactor(room, item)'), 'viewer should support additional item markup');
assert(source.includes('function viewerItemMarkedAmount(room, item, amount)'), 'viewer should centralize marked-up item pricing');
assert(
  source.includes('return viewerNumber(amount) * viewerRoomMarkupFactor(room);'),
  'marked-up room pricing should multiply raw values by the room markup factor'
);
assert(
  source.includes('function viewerRoomPayableComponents(room)'),
  'live quote totals should centralize the room payable components'
);
assert(
  source.includes('var totalCents = Math.round(viewerItemMarkedAmount(room, item, qvLineTotal(item)) * 100);'),
  'live quote subtotals should include combined room and item markup'
);
assert(
  source.includes('var baseCents = Math.round(viewerItemMarkedAmount(room, item, qvBaseLineTotal(item)) * 100);') &&
    source.includes('components.upgradeCents += totalCents - baseCents;'),
  'selected upgrade summaries should include effective item markup'
);
assert(
  source.includes('viewerItemMarkedAmount(room, item, qvLineTotal(item))'),
  'rendered line, category, and room totals should include effective item markup'
);
assert(
  source.includes('viewerItemMarkedAmount(room, item, qvLineRate(item))'),
  'rendered line rates should include effective item markup'
);
assert(
  source.includes('viewerItemMarkedAmount(room, item, optionQuantity * viewerNumber(option.rate))'),
  'rendered item upgrade prices should include effective item markup'
);
assert(
  source.includes('viewerItemMarkedAmount(room, item, optionQty * (parseFloat(option.rate) || 0))'),
  'rendered choice-group prices should include effective item markup'
);
assert(
  source.includes('qvDiscountDetailsHtml(item, room)'),
  'rendered discount details should receive the room markup context'
);

const helperStart = source.indexOf('function viewerRoomMarkupFactor(room)');
const helperEnd = source.indexOf('function viewerChangeOrderLineDelta', helperStart);
assert(helperStart !== -1 && helperEnd > helperStart, 'room markup helpers should be extractable for behavior checks');
const helperSource = source.slice(helperStart, helperEnd);
const helpers = new Function('viewerNumber', `${helperSource}\nreturn { viewerRoomMarkupFactor, viewerRoomMarkedAmount, viewerItemMarkupFactor, viewerItemMarkedAmount, viewerChangeOrderRoomMarkupFactor };`)(value => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

assert.strictEqual(helpers.viewerRoomMarkupFactor({ markup: 10 }), 1.1, '10% room markup should produce a 1.1 factor');
assert(Math.abs(helpers.viewerRoomMarkedAmount({ markup: 10 }, 100) - 110) < 0.0001, '$100 with 10% room markup should display and total as $110');
assert.strictEqual(helpers.viewerRoomMarkedAmount({}, 100), 100, 'rooms without markup should retain their original pricing');
assert.strictEqual(helpers.viewerChangeOrderRoomMarkupFactor({ markup: 10 }), 1.1, 'change orders should reuse the shared room markup factor');
assert.strictEqual(helpers.viewerItemMarkupFactor({ markup: 10 }, {}), 1.1, 'items without additional markup should retain room markup');
assert.strictEqual(helpers.viewerItemMarkupFactor({ markup: 10 }, { markup: 25 }), 1.35, 'item markup should add to room markup');
assert.strictEqual(helpers.viewerItemMarkupFactor({ markup: 10 }, { markup: 0 }), 1.1, 'an explicit zero item markup should leave room markup intact');
assert.strictEqual(helpers.viewerItemMarkedAmount({ markup: 10 }, { markup: 25 }, 100), 135, 'item-marked amounts should use the combined markup');
assert.strictEqual(helpers.viewerChangeOrderRoomMarkupFactor({ markup: 10 }, { markup: 25 }), 1.35, 'change orders should respect combined markup');
assert.strictEqual(helpers.viewerItemMarkupFactor({ markup: 10 }, { markup: 250 }), 3.6, 'client quotes should preserve item markup above 100%');
assert.strictEqual(helpers.viewerItemMarkedAmount({ markup: 10 }, { markup: 250 }, 100), 360, 'client quote totals should include unlimited item markup');

console.log('quote viewer room markup static test passed');
