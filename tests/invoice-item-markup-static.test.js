const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(source.includes('function invoiceItemMarkupFactor(room, item)'), 'invoice viewer should support additional item markup');
assert(source.includes('invoiceLineTotal(item, room)'), 'invoice totals should receive room and item markup context');
assert(source.includes('invoiceLineRate(item, room)'), 'invoice rates should receive room and item markup context');
assert(source.includes('invoiceDiscountHtml(item, _iCurrency, room)'), 'invoice discount details should use marked-up values');

const helperStart = source.indexOf('function invoiceRoomMarkupFactor(room)');
const helperEnd = source.indexOf('function invoiceLineRate', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'invoice markup helpers should be extractable');
const helperSource = source.slice(helperStart, helperEnd);
const helpers = new Function(`${helperSource}\nreturn { invoiceRoomMarkupFactor, invoiceItemMarkupFactor, invoiceMarkedAmount };`)();

assert.strictEqual(helpers.invoiceRoomMarkupFactor({ markup: 10 }), 1.1);
assert.strictEqual(helpers.invoiceItemMarkupFactor({ markup: 10 }, {}), 1.1, 'invoice items should inherit room markup');
assert(Math.abs(helpers.invoiceItemMarkupFactor({ markup: 10 }, { markup: 30 }) - 1.4) < 0.0001, 'invoice item markup should add to the room');
assert.strictEqual(helpers.invoiceItemMarkupFactor({ markup: 10 }, { markup: 0 }), 1.1, 'invoice item zero markup should leave room markup intact');
assert(Math.abs(helpers.invoiceMarkedAmount({ markup: 10 }, { markup: 30 }, 100) - 140) < 0.0001);
assert.strictEqual(helpers.invoiceItemMarkupFactor({ markup: 10 }, { markup: 250 }), 3.6, 'invoice item markup should have no upper limit');
assert.strictEqual(helpers.invoiceMarkedAmount({ markup: 10 }, { markup: 250 }, 100), 360);

console.log('invoice item markup static test passed');
