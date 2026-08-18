const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  builder.includes('id="quoteAdjustmentName"') &&
  builder.includes('id="quoteAdjustmentType"') &&
  builder.includes('id="quoteAdjustmentBasis"') &&
  builder.includes('id="quoteAdjustmentPercent"') &&
  builder.includes('id="quoteAdjustmentUnit"'),
  'Builder should include quote-level named adjustment controls with percent/amount mode'
);

assert(
  builder.includes('function getQuoteClientAdjustment()') &&
  builder.includes('function calculateQuoteAdjustmentAmount(subtotal)') &&
  builder.includes('function updateQuoteAdjustmentFromInputs()') &&
  builder.includes('function updateQuoteAdjustmentBasisUI()'),
  'Builder should calculate and update a named client-visible quote adjustment in percent or amount mode'
);

assert(
  builder.includes("basis: basis") &&
    builder.includes("amount: basis === 'amount' ? value : 0") &&
    builder.includes("adjustment.basis === 'amount'"),
  'Builder should persist whether the adjustment is percent or fixed amount and calculate fixed amounts'
);

assert(
  builder.includes('id="quoteAdjustmentRow"') &&
  builder.includes('id="quoteAdjustmentLabelDisplay"') &&
  builder.includes('id="quoteAdjustmentDisplay"'),
  'Builder totals should show the adjustment as its own row'
);

assert(
  builder.includes('const taxableSubtotal = subtotal + adjustmentAmount;') &&
  builder.includes('adjustment: adjustmentAmount') &&
  builder.includes('taxRate: _taxRate'),
  'Builder should calculate enabled tax after the client-visible adjustment'
);

assert(
  storage.includes('quoteAdjustment: getQuoteClientAdjustment()') &&
  storage.includes('setQuoteClientAdjustment(data.quoteAdjustment || data.clientAdjustment || null);'),
  'Quote storage should persist and hydrate the quote adjustment'
);

assert(
  builder.includes('quoteAdjustment: getQuoteClientAdjustment()'),
  'Invoice data should include the quote adjustment'
);

assert(
  viewer.includes('function getViewerQuoteAdjustment()') &&
  viewer.includes('id="quoteAdjustmentTotalDisplay"') &&
  viewer.includes('var adjustmentAmount = calculateViewerQuoteAdjustmentAmount(subtotal);') &&
  viewer.includes('adjustment: adjustmentAmount') &&
  viewer.includes("adjustment.basis === 'amount'"),
  'Interactive quote viewer should render and total percent or amount quote adjustments'
);

assert(
  invoice.includes('function getInvoiceQuoteAdjustment()') &&
  invoice.includes('id="invoiceAdjustmentRow"') &&
  invoice.includes('const taxableSubtotal = subtotal + adjustmentAmount;') &&
  invoice.includes("adjustment.basis === 'amount'"),
  'Invoice viewer should render and total percent or amount quote adjustments'
);
