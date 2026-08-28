const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const supabaseV2 = fs.readFileSync('supabase-v2.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  builder.includes('id="quotePaymentName"') &&
  builder.includes('id="quotePaymentAmount"') &&
  builder.includes('id="quotePaymentRow"') &&
  builder.includes('id="quotePaymentDisplay"') &&
  builder.includes('id="quoteTotalFinalLabel"'),
  'Builder should include client-visible payment received controls, row, and balance label'
);

assert(
  builder.includes('function getQuotePaymentsReceived()') &&
  builder.includes('function setQuotePaymentsReceived(payment)') &&
  builder.includes('function calculateQuotePaymentsReceivedAmount(total)') &&
  builder.includes('function updateQuotePaymentsReceivedFromInputs()'),
  'Builder should collect, hydrate, calculate, and update payments received'
);

assert(
  builder.includes('paid: getQuotePaymentsReceived().amount || 0') &&
  builder.includes('const balanceDue = QuoteDrPayableTotal.fromCents(payable.balanceDueCents);') &&
  builder.includes("finalLabelEl.textContent = paymentReceivedAmount > 0 ? 'Balance Due' : 'Total';"),
  'Builder should subtract payments after tax and relabel the final total as Balance Due'
);

assert(
  storage.includes("paymentsReceived: isChangeOrder ? { name: 'Deposit paid', amount: 0 } : getQuotePaymentsReceived()") &&
  storage.includes("setQuotePaymentsReceived(loadedDocumentType === 'change_order' ? null : (data.paymentsReceived || data.paymentReceived || null));"),
  'Quote storage should persist and hydrate payments received'
);

assert(
  supabaseV2.includes('paymentsReceived: quoteData.paymentsReceived || quoteData.paymentReceived || null'),
  'Supabase quote save payload should preserve payments received inside quote data'
);

assert(
  storage.includes('data._paymentBalanceDueFallback = row.total;') &&
  builder.includes('window._quotePaymentFallbackBalanceDue') &&
  builder.includes("name: 'Deposit paid'"),
  'Builder should infer missing payment metadata from a lower saved cloud balance for quotes saved before this field existed'
);

assert(
  builder.includes('paymentsReceived: getQuotePaymentsReceived()'),
  'Generated quote and invoice data should include payments received'
);

assert(
  viewer.includes('function getViewerPaymentsReceived()') &&
  viewer.includes('id="quotePaymentTotalDisplay"') &&
  viewer.includes('paid: getViewerPaymentsReceived().amount || 0') &&
  viewer.includes('var balanceDue = QuoteDrPayableTotal.fromCents(payable.balanceDueCents);'),
  'Interactive quote viewer should render payments received and show balance due'
);

assert(
  invoice.includes('function getInvoicePaymentsReceived()') &&
  invoice.includes('id="invoicePaymentReceivedRow"') &&
  invoice.includes('id="invoiceBalanceLabel"') &&
  invoice.includes('paid: getInvoicePaymentsReceived().amount || 0') &&
  invoice.includes('const balanceDue = QuoteDrPayableTotal.fromCents(payable.balanceDueCents);'),
  'Invoice viewer should render payments received and use balance due for final/payment helpers'
);
