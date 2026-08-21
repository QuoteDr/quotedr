const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const readiness = require(path.join(root, 'quote-portal-readiness.js'));
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

const quote = {
  rooms: [{
    name: 'Deck',
    items: [
      { description: 'Included free item', quantity: 1, rate: 0, total: 0 },
      { description: 'Unselected add-on', optional: true, optionalSelectedByDefault: false, quantity: 1, rate: 500, total: 500 },
      { description: 'Selected add-on', optional: true, optionalSelectedByDefault: true, quantity: 1, rate: 0, total: 0 },
      { description: 'Client-selected add-on', optional: true, optionalSelectedByDefault: false, _optionalSelected: true, total: 0 },
      { description: 'Price TBD item', priceTbd: true, total: 0 },
      { description: 'Removed item', _removed: true, total: 0 },
      { description: 'Credit', total: -50 },
      { description: 'Priced work', quantity: 2, rate: 100, total: 200 },
      { description: 'Legacy flat-rate work', rate: 100 }
    ]
  }]
};

assert.deepStrictEqual(
  readiness.findZeroPricedItems(quote).map((finding) => finding.itemName),
  ['Included free item', 'Selected add-on', 'Client-selected add-on'],
  'portal warning should flag only included zero-priced work'
);
assert(!readiness.zeroPriceWarningMessage(readiness.findZeroPricedItems(quote)).includes('Unselected add-on'));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

(async () => {
  let prompts = 0;
  assert.strictEqual(await readiness.confirmZeroPricedItems({ rooms: [] }, async () => { prompts += 1; return true; }), true);
  assert.strictEqual(prompts, 0, 'clean quotes should not prompt');
  assert.strictEqual(await readiness.confirmZeroPricedItems(quote, async (_message, options) => {
    prompts += 1;
    assert.strictEqual(options.title, 'Zero-Priced Items Found');
    assert.strictEqual(options.okText, 'Send Anyway');
    assert.strictEqual(options.cancelText, 'Go Back & Review');
    return false;
  }), false, 'review action should stop portal publication');

  const content = { innerHTML: '' };
  const context = {
    document: { getElementById: (id) => id === 'profitReportContent' ? content : null },
    rooms: [{ name: 'Deck', items: [
      { description: 'Base work', quantity: 1, total: 100, materialCost: 30 },
      { description: 'Not added', optional: true, optionalSelectedByDefault: false, quantity: 1, total: 999, materialCost: 400 },
      { description: 'Zero quantity', quantity: 0, total: 0, materialCost: 999 }
    ] }],
    quoteOptionalItemIncludedByDefault: (item) => !item.optional || item.optionalSelectedByDefault !== false,
    quoteItemMarkedAmount: (_room, _item, amount) => amount,
    itemChargedTotal: (item) => item.total,
    qdFormatMoney: (amount) => `$${Number(amount).toFixed(2)}`
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(builder, 'updateProfitReport'), context);
  context.updateProfitReport();
  assert(content.innerHTML.includes('$100.00'), 'profit revenue should include selected/default work');
  assert(content.innerHTML.includes('$70.00'), 'profit should use only included material costs');
  assert(!content.innerHTML.includes('$1099.00'), 'profit revenue must exclude unselected optional add-ons');

  assert(builder.includes('confirmQuotePortalZeroPricedItems(quoteData)'), 'builder portal publication should run the zero-price guard');
  assert(dashboard.includes('confirmDashboardPortalZeroPricedItems(target)'), 'dashboard portal assignment should run the zero-price guard');
  assert(builder.includes('The zero-price safety check is unavailable') && dashboard.includes('The zero-price safety check is unavailable'), 'missing readiness code should fail closed instead of silently publishing');
  assert(builder.includes('Not included</span></td>'), 'line profit details should identify unselected optional items as excluded');
  const builderPublish = builder.slice(builder.indexOf('async function ensureQuotePortalUrl'), builder.indexOf('async function finishQuotePortalAssignment'));
  assert(builderPublish.indexOf('confirmQuotePortalZeroPricedItems(quoteData)') < builderPublish.indexOf('markQuoteForPortal(quoteData, portal)'), 'builder warning must run before portal state is mutated');
  const dashboardAssign = dashboard.slice(dashboard.indexOf('async function assignQuoteToPortal'), dashboard.indexOf('async function createPortalForQuote'));
  assert(dashboardAssign.indexOf('confirmDashboardPortalZeroPricedItems(target)') < dashboardAssign.indexOf('qdDurableQuoteRowUpdate'), 'dashboard warning must run before portal rows are mutated');

  console.log('quote profit and portal readiness checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
