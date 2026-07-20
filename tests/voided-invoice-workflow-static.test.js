const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const portal = fs.readFileSync('client-portal.html', 'utf8');
const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');
const stripe = fs.readFileSync('supabase/functions/document-payment/index.ts', 'utf8');
const legacyStripe = fs.readFileSync('supabase/functions/stripe-deposit/index.ts', 'utf8');

assert(
  dashboard.includes('function invalidateInvoice(quoteId)') &&
    dashboard.includes('Mark Invoice No Longer Valid') &&
    dashboard.includes("data.document_validity = 'voided'") &&
    dashboard.includes('function restoreInvalidInvoice(quoteId)'),
  'Dashboard should provide reversible invoice invalidation controls'
);

const invalidateBlock = dashboard.slice(
  dashboard.indexOf('async function invalidateInvoice(quoteId)'),
  dashboard.indexOf('async function restoreInvalidInvoice(quoteId)')
);
assert(
  !invalidateBlock.includes('portal_visible = false') &&
    !invalidateBlock.includes("status: 'voided'"),
  'Invalidating an invoice must preserve portal visibility and avoid requiring a new database status'
);

assert(
  dashboard.includes("{ status: 'voided', label: 'No Longer Valid'") &&
    dashboard.includes('<option value="voided">Invalid / Voided</option>') &&
    dashboard.includes('This invoice remains in the client portal for reference only and cannot be paid.'),
  'Dashboard should visibly distinguish voided invoices in list, filter, and kanban views'
);

assert(
  portal.includes('function documentIsInvalid(quote)') &&
    portal.includes("title: 'No Longer Valid'") &&
    portal.includes('This invoice is no longer valid.') &&
    portal.includes("if (documentIsInvalid(quote)) return false;"),
  'Client portal should retain invalid invoices while removing them from active/completed actions'
);

assert(
  invoice.includes('id="invoiceInvalidNotice"') &&
    invoice.includes('function invoiceIsInvalid()') &&
    invoice.includes('Reference Total (No Longer Valid)') &&
    invoice.includes("alert('This invoice is no longer valid and cannot accept payment.')"),
  'Invoice viewer should display an invalid warning and block payment controls'
);

assert(
  stripe.includes('function isInvalid(row: QuoteRow)') &&
    stripe.includes('status === "voided"') &&
    stripe.includes('This document is no longer valid and cannot accept payment.'),
  'Secure document checkout should reject voided or superseded invoices server-side'
);

assert(
  legacyStripe.includes('legacy_payment_endpoint_retired') &&
    !legacyStripe.includes('body.amount'),
  'The legacy amount-trusting Stripe deposit endpoint should remain retired'
);

console.log('voided invoice workflow static test passed');
