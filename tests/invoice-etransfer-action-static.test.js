const fs = require('fs');
const assert = require('assert');

const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  invoice.includes("invoiceManualMethodMarkup('etransfer', 'E-transfer'"),
  'Invoice viewer should keep E-transfer visible as a manual payment option'
);

assert(
  invoice.includes('Send payment to <strong>'),
  'E-transfer instructions should show the configured recipient email when available'
);

assert(
  !invoice.includes('openEtransferPaymentHelper'),
  'E-transfer should not open a helper modal until a real gateway integration exists'
);

assert(
  !invoice.includes('Open online banking'),
  'Invoice viewer should not send clients to a generic online banking or Interac information page'
);

assert(
  invoice.includes('reportManualInvoicePayment') && invoice.includes("I've sent the e-transfer"),
  'E-transfer should let the client report that payment was sent for contractor confirmation'
);
