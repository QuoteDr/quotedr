const fs = require('fs');
const path = require('path');

const invoiceViewer = fs.readFileSync(path.join(__dirname, '..', 'invoice-viewer.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(invoiceViewer.includes('id="invoiceStickyNav"'), 'invoice viewer should include the sticky navigation shell');
assert(invoiceViewer.includes('id="invoiceStickyNavToggle"'), 'sticky navigation should include an expandable toggle button');
assert(invoiceViewer.includes('id="invoiceStickyNavRooms"'), 'sticky navigation should include a room list container');
assert(invoiceViewer.includes('function updateInvoiceStickyNav'), 'invoice viewer should render sticky room navigation from invoice rooms');
assert(invoiceViewer.includes('function toggleInvoiceStickyNav'), 'invoice viewer should expose a sticky nav toggle');
assert(invoiceViewer.includes('function jumpToInvoiceTop'), 'sticky navigation should support jumping to the top');
assert(invoiceViewer.includes('function jumpToInvoiceBottom'), 'sticky navigation should support jumping to the bottom');
assert(invoiceViewer.includes('updateInvoiceStickyNav();'), 'invoice room locator updates should refresh sticky navigation');
assert(invoiceViewer.includes('.invoice-sticky-nav-panel'), 'sticky navigation should have panel styling');
assert(invoiceViewer.includes('@media print'), 'sticky navigation should be hidden from printed invoices');

console.log('invoice sticky navigation static test passed');
