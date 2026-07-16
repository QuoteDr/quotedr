const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('function viewerRoomMarkupFactor(room)'), 'viewer should centralize room markup calculation');
assert(source.includes('function viewerRoomMarkedAmount(room, amount)'), 'viewer should centralize marked-up room pricing');
assert(
  source.includes('return viewerNumber(amount) * viewerRoomMarkupFactor(room);'),
  'marked-up room pricing should multiply raw values by the room markup factor'
);
assert(
  source.includes('const roomMarkupFactor = viewerRoomMarkupFactor(room);'),
  'live quote totals should calculate the markup factor for each room'
);
assert(
  source.includes('subtotal += activeTotal * roomMarkupFactor;'),
  'live quote subtotals should include room markup'
);
assert(
  source.includes('upgradesTotal += (activeTotal - baseTotal) * roomMarkupFactor;'),
  'selected upgrade summaries should include room markup'
);
assert(
  source.includes('viewerRoomMarkedAmount(room, qvLineTotal(item))'),
  'rendered line, category, and room totals should include room markup'
);
assert(
  source.includes('viewerRoomMarkedAmount(room, qvLineRate(item))'),
  'rendered line rates should include room markup'
);
assert(
  source.includes('viewerRoomMarkedAmount(room, optionQuantity * viewerNumber(option.rate))'),
  'rendered item upgrade prices should include room markup'
);
assert(
  source.includes('viewerRoomMarkedAmount(room, optionQty * (parseFloat(option.rate) || 0))'),
  'rendered choice-group prices should include room markup'
);
assert(
  source.includes('qvDiscountDetailsHtml(item, room)'),
  'rendered discount details should receive the room markup context'
);

const helperStart = source.indexOf('function viewerRoomMarkupFactor(room)');
const helperEnd = source.indexOf('function viewerChangeOrderLineDelta', helperStart);
assert(helperStart !== -1 && helperEnd > helperStart, 'room markup helpers should be extractable for behavior checks');
const helperSource = source.slice(helperStart, helperEnd);
const helpers = new Function('viewerNumber', `${helperSource}\nreturn { viewerRoomMarkupFactor, viewerRoomMarkedAmount, viewerChangeOrderRoomMarkupFactor };`)(value => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

assert.strictEqual(helpers.viewerRoomMarkupFactor({ markup: 10 }), 1.1, '10% room markup should produce a 1.1 factor');
assert(Math.abs(helpers.viewerRoomMarkedAmount({ markup: 10 }, 100) - 110) < 0.0001, '$100 with 10% room markup should display and total as $110');
assert.strictEqual(helpers.viewerRoomMarkedAmount({}, 100), 100, 'rooms without markup should retain their original pricing');
assert.strictEqual(helpers.viewerChangeOrderRoomMarkupFactor({ markup: 10 }), 1.1, 'change orders should reuse the shared room markup factor');

console.log('quote viewer room markup static test passed');
