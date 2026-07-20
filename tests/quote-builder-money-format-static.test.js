const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const invoiceViewerSource = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  source.includes('function qdFormatMoney(value, symbol, options)'),
  'Quote builder should centralize money formatting with thousand separators'
);

[
  "subtotalDisplay').textContent",
  "taxDisplay').textContent",
  "grandTotalDisplay').textContent",
  "stickyAmt.textContent",
  "stickySub.textContent",
  "stickyTax.textContent",
  "displayRateText = qdFormatMoney(displayRate",
  "displayTotalText = qdFormatMoney(displayTotal",
  "lineProfitText = qdFormatMoney(lineProfit",
  "roomProfitText = qdFormatMoney(roomProfit",
  "totalRevenueText = qdFormatMoney(totalRevenue",
  "totalMaterialCostText = qdFormatMoney(-totalMaterialCost",
  "totalProfitText = qdFormatMoney(totalProfit"
].forEach((snippet) => {
  assert(source.includes(snippet), snippet + ' should use qdFormatMoney');
});

[
  "_sym + subtotal.toFixed(2)",
  "_sym + tax.toFixed(2)",
  "_sym + total.toFixed(2)",
  "'$' + roomProfit.toFixed(2)",
  "'$' + totalRevenue.toFixed(2)",
  "'-$' + totalMaterialCost.toFixed(2)",
  "'$' + totalProfit.toFixed(2)"
].forEach((snippet) => {
  assert(!source.includes(snippet), snippet + ' should not bypass comma money formatting');
});

assert(
  /function formatMoney\(amount, currency\)[\s\S]*toLocaleString\('en-CA'/.test(invoiceViewerSource),
  'Invoice viewer formatMoney should also render thousand separators'
);

assert(
  invoiceViewerSource.includes("buttonHtml += '<i class=\"fas fa-credit-card me-2\"></i>Pay Invoice - ' + formatMoney(balanceCents / 100,"),
  'Invoice payment button should use formatted money with commas'
);

console.log('quote builder money format static test passed');
