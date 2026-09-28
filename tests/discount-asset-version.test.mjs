import fs from 'node:fs';
import assert from 'node:assert/strict';
import { assertDiscountAssetVersion } from '../scripts/build-public-artifact.mjs';

const source = fs.readFileSync('quote-discounts.js', 'utf8');
for (const file of ['dashboard.html', 'invoice-viewer.html', 'interactive-quote-viewer.html', 'quote-builder.html']) {
  const html = fs.readFileSync(file, 'utf8');
  assert.doesNotThrow(() => assertDiscountAssetVersion(source, html, file));
  assert.doesNotThrow(() => assertDiscountAssetVersion(source.replace(/\r?\n/g, '\r\n'), html, file));
  assert.throws(() => assertDiscountAssetVersion(source, html.replace(/quote-discounts\.js\?v=[a-f0-9]+/, 'quote-discounts.js?v=2026092101'), file));
  assert.throws(() => assertDiscountAssetVersion(source + '\n// next pricing release', html, file));
}
console.log('Pricing asset cache versions match; stale URLs and changed pricing code block release.');
