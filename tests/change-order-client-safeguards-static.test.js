const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const decisions = fs.readFileSync('client-document-decisions.js', 'utf8');
const policy = fs.readFileSync('supabase/functions/_shared/client-document-policy.mjs', 'utf8');

assert(
  builder.includes("if (window._quoteDocumentType === 'change_order')") &&
    builder.includes("return { name: 'Deposit paid', amount: 0 }") &&
    builder.includes('paidCents: 0') &&
    builder.includes('payable.balanceDueCents = payable.payableTotalCents'),
  'Change Order approval math must ignore payments inherited from the parent project'
);

assert(
  builder.includes('id="quotePaymentPanel"') &&
    builder.includes("paymentPanel.style.display = isCo ? 'none' : ''") &&
    builder.includes("paymentRow.style.display = isCo ? 'none' : ''"),
  'Change Orders must hide the unrelated parent-project payment editor and restore it for normal quotes'
);

assert(
  storage.includes("isChangeOrder ? { name: 'Deposit paid', amount: 0 } : getQuotePaymentsReceived()") &&
    storage.includes("loadedDocumentType === 'change_order' ? null"),
  'saved and restored Change Orders must not persist or reload a parent-project deposit'
);

assert(
  viewer.includes('function getViewerPaymentsReceived()') &&
    viewer.includes("if (co && co.isChangeOrder(quoteData))") &&
    viewer.includes("return { name: 'Amount paid already', amount: viewerChangeOrderProjectPaidCents() / 100 }") &&
    viewer.includes('_documentPaymentState.projectPaidCents') &&
    viewer.includes('quoteData.change_order_payment_paid_cents'),
  'the client viewer must ignore stale inherited deposits while using authoritative project and Change Order payments'
);

assert(
  builder.includes("const CHANGE_ORDER_CUSTOM_HIGHLIGHT_KEYS = ['yellow', 'blue', 'purple']") &&
    builder.includes('What does this colour mean?') &&
    builder.includes('confirmChangeOrderHighlightLegend') &&
    viewer.includes('renderViewerChangeOrderCustomLegend') &&
    policy.includes('sanitizeChangeOrderHighlightLegend'),
  'manual Change Order highlights must use a described client legend without colliding with automatic status colours'
);

assert(
  builder.includes('Previously approved choices locked') &&
    builder.includes('Reopen Previously Approved Choices?') &&
    builder.includes('The client will be able to select a different option') &&
    viewer.includes('Previously approved selection — locked') &&
    viewer.includes('Reopened for a new client selection'),
  'the contractor must see the default lock and a clear warning before reopening prior choices'
);

assert(
  decisions.includes("isChangeOrder && item._coOriginal && item._coClientChoiceReopened !== true") &&
    policy.includes('inheritedChangeOrderChoiceLocked') &&
    policy.includes('contractor must explicitly reopen'),
  'both the minimal client payload and authoritative server merge must enforce Change Order choice locks'
);

console.log('change-order client safeguard static tests passed');
