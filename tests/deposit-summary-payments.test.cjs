const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../interactive-quote-viewer.html'), 'utf8');
const start = html.indexOf("            var depositSummary = document.getElementById('depositSummary');", html.indexOf('function updateTotal('));
const end = html.indexOf('            if (isChangeOrder)', start);
assert(start > 0 && end > start);
function render(paid, required = 11537745, total = 23075490, enabled = true) {
  const nodes = Object.fromEntries(['depositSummary','depositLabel','depositAmountDisplay','remainingBalanceDisplay'].map(id => [id, {style:{},textContent:''}]));
  vm.runInNewContext(html.slice(start, end), {
    document: {getElementById: id => nodes[id]}, total: total / 100,
    payable: {payableTotalCents: total, paidCents: paid, balanceDueCents: Math.max(0,total-paid)},
    resolveQuoteDepositTerms: () => ({deposit_required:enabled,kind:'percent',percent:50}),
    quoteRequiredDepositAmountCents: () => required, viewerMoney: n => n.toFixed(2)
  });
  return nodes;
}
test('recorded $230,000 covers deposit: hide original split while $754.90 remains', () => {
  assert.equal(render(23000000).depositSummary.style.display,'none');
});
test('partial deposit subtracts payments and splits only unpaid balance', () => {
  const n = render(10000000);
  assert.equal(n.depositSummary.style.display,'block');
  assert.equal(n.depositLabel.textContent,'Deposit still due (50%)');
  assert.equal(n.depositAmountDisplay.textContent,'15377.45');
  assert.equal(n.remainingBalanceDisplay.textContent,'115377.45');
});
test('unpaid, threshold paid, fully paid, disabled and odd cents', () => {
  assert.equal(render(0).depositLabel.textContent,'Deposit (50%)');
  assert.equal(render(11537745).depositSummary.style.display,'none');
  assert.equal(render(23075490).depositSummary.style.display,'none');
  assert.equal(render(0,11537745,23075490,false).depositSummary.style.display,'none');
  const n=render(1,51,101);
  assert.equal(n.depositAmountDisplay.textContent,'0.50');
  assert.equal(n.remainingBalanceDisplay.textContent,'0.50');
});
