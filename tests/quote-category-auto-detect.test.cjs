const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('quote-builder.html','utf8');
const start = html.indexOf('        var CAT_ICONS =');
const end = html.indexOf('];', start) + 2;
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end),ctx);
const functionStart = html.indexOf('        function detectQuoteCategoryIcon(');
const functionEnd = html.indexOf('        function autoDetectQuoteCategoryIcon()',functionStart);
vm.runInContext(html.slice(functionStart,functionEnd),ctx);
for (const name of ['Flooring','DRYWALL','Electrical','Framing','Painting']) {
  const icon = ctx.detectQuoteCategoryIcon(name);
  assert.ok(icon, name + ' should match an icon');
  assert.ok(ctx.CAT_ICONS.some(choice => choice.fa === icon));
}
assert.equal(ctx.detectQuoteCategoryIcon('Unrecognised special scope xyz'),null);
assert.match(html,/if \(!await qdConfirm\('You are about to auto-detect icons/);
assert.match(html,/quoteCategoryUpdateStored'\).checked = false/);
console.log('Category auto detection and quote-only defaults passed');
