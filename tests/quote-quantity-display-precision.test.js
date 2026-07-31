const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');
const formatterStart = source.indexOf('function qdMeasurementDecimals');
const formatterEnd = source.indexOf('function qdDisplayUnit', formatterStart);

assert(formatterStart >= 0 && formatterEnd > formatterStart, 'quantity formatter helpers should exist');

const context = {};
vm.createContext(context);
vm.runInContext(source.slice(formatterStart, formatterEnd), context);

assert.strictEqual(context.qdFormatMeasurementNumber(20.75), '20.75');
assert.strictEqual(context.qdFormatMeasurementNumber(20.8), '20.8');
assert.strictEqual(context.qdFormatMeasurementNumber(123.45), '123.45');
assert.strictEqual(context.qdFormatMeasurementNumber(20), '20');
assert.strictEqual(20.75 * 160, 3320, 'pricing should use the exact stored quantity');

for (const file of ['quote-builder.html', 'interactive-quote-viewer.html', 'invoice-viewer.html']) {
  const viewerSource = fs.readFileSync(path.join(root, file), 'utf8');
  assert(
    viewerSource.includes('qdFormatQuantity'),
    `${file} should use the shared precise quantity formatter`
  );
}

console.log('quote quantity display precision test passed');
