import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQboInvoiceCsv,
  preflightQboInvoiceExport,
  QBO_INVOICE_CSV_HEADERS
} from '../supabase/functions/_shared/accounting-qbo-invoice-export.mjs';

function invoice(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'owner-one',
    quote_number: 'INV-100',
    client_name: 'Customer A',
    quote_date: '2026-08-01',
    status: 'invoiced',
    type: 'invoice',
    total: 113,
    data: {
      documentType: 'invoice',
      invoiceDueDate: '2026-08-31',
      currency: 'CAD',
      taxEnabled: true,
      taxLabel: 'HST',
      taxRate: 0.13,
      taxAmount: 13,
      rooms: [{ name: 'Kitchen', items: [{ description: 'Paint walls', quantity: 1, unitType: 'job', rate: 100, total: 100 }] }]
    },
    ...overrides
  };
}

const profile = {
  name: 'Ontario QBO',
  customerMappings: { 'Customer A': 'Customer A QBO' },
  itemMappings: { 'Paint walls': 'Painting service' },
  taxMappings: { HST: 'HST (ON)' },
  taxExemptCode: 'ZERO'
};

test('builds a QBO-oriented CSV only from an exact mapped unpaid invoice', () => {
  const preflight = preflightQboInvoiceExport([invoice()], profile);
  assert.equal(preflight.totals.includedInvoices, 1);
  assert.equal(preflight.totals.includedRows, 1);
  assert.equal(preflight.documents[0].included, true);
  const built = buildQboInvoiceCsv(preflight.included);
  assert.equal(built.csv.split('\r\n')[0], QBO_INVOICE_CSV_HEADERS.map((header) => `"${header}"`).join(','));
  assert.match(built.csv, /"Customer A QBO"/);
  assert.match(built.csv, /"Painting service"/);
  assert.match(built.csv, /"HST \(ON\)"/);
});

test('rejects non-ledger document states and unconfirmed money', () => {
  const accepted = invoice({ status: 'accepted', type: 'quote', data: { ...invoice().data, documentType: 'quote', accepted_at: '2026-08-02' } });
  const partial = invoice({ id: '22222222-2222-4222-8222-222222222222', data: { ...invoice().data, paymentStatus: 'partially_paid', paymentsReceived: { amount: 10 } } });
  const reported = invoice({ id: '33333333-3333-4333-8333-333333333333', data: { ...invoice().data, manual_payment_reported: true } });
  const result = preflightQboInvoiceExport([accepted, partial, reported], profile);
  assert.equal(result.totals.includedInvoices, 0);
  assert.match(result.documents[0].reasons.join(' '), /Only issued invoices/);
  assert.match(result.documents[1].reasons.join(' '), /Partially paid/);
  assert.match(result.documents[2].reasons.join(' '), /not confirmed money/);
});

test('rejects missing exact mappings, missing due dates, adjustments, discounts, and unmapped tax', () => {
  const invalid = invoice({
    data: {
      ...invoice().data,
      invoiceDueDate: '',
      quoteAdjustment: { type: 'discount', basis: 'amount', amount: 2 },
      rooms: [{ name: 'Kitchen', items: [{ description: 'Paint walls', quantity: 1, unitType: 'job', rate: 100, total: 90 }] }]
    }
  });
  const result = preflightQboInvoiceExport([invalid], {
    ...profile,
    customerMappings: {},
    taxMappings: {}
  });
  const reasons = result.documents[0].reasons.join(' ');
  assert.match(reasons, /Due date is missing/);
  assert.match(reasons, /Document adjustments/);
  assert.match(reasons, /Customer has no exact saved QBO mapping/);
  assert.match(reasons, /tax-code mapping/);
  assert.match(reasons, /discount or amount/);
});

test('allows an explicit customer-create choice but still requires exact product and tax mappings', () => {
  const result = preflightQboInvoiceExport([invoice()], {
    ...profile,
    customerMappings: {},
    allowCreateCustomers: true
  });
  assert.equal(result.documents[0].included, true);
  assert.match(buildQboInvoiceCsv(result.included).csv, /"Customer A"/);
});

test('enforces invoice and line batch limits', () => {
  const preflight = preflightQboInvoiceExport([invoice()], profile);
  assert.throws(() => buildQboInvoiceCsv(Array.from({ length: 101 }, () => preflight.included[0])), /100 invoices/);
  const tooManyRows = { ...preflight.included[0], rows: Array.from({ length: 1001 }, () => preflight.included[0].rows[0]) };
  assert.throws(() => buildQboInvoiceCsv([tooManyRows]), /1000 invoice rows/);
});

test('formula-like customer and line text stays neutralized in the exported CSV', () => {
  const unsafe = invoice({
    client_name: '=Customer',
    data: { ...invoice().data, rooms: [{ name: 'Kitchen', items: [{ description: '=Paint', quantity: 1, unitType: 'job', rate: 100, total: 100 }] }] }
  });
  const result = preflightQboInvoiceExport([unsafe], {
    ...profile,
    customerMappings: { '=Customer': '=QBO Customer' },
    itemMappings: { '=Paint': '=QBO Item' }
  });
  const csv = buildQboInvoiceCsv(result.included).csv;
  assert.match(csv, /"'=QBO Customer"/);
  assert.match(csv, /"'=QBO Item"/);
  assert.match(csv, /"'=Paint"/);
});

test('never serializes costs, markup, suppliers, notes, provider data, or tokens', () => {
  const sensitive = invoice({
    data: {
      ...invoice().data,
      internalNotes: 'SECRET INTERNAL NOTE',
      payments: [{ provider: 'SECRET PROVIDER', stripe_payment_intent_id: 'SECRET PROVIDER ID' }],
      portal_token: 'SECRET TOKEN',
      rooms: [{ name: 'Kitchen', markup: 40, items: [{
        description: 'Paint walls', quantity: 1, unitType: 'job', rate: 100, total: 100,
        materialCost: 'SECRET COST', supplierUrl: 'SECRET SUPPLIER', notes: 'SECRET ITEM NOTE', profit: 'SECRET PROFIT'
      }] }]
    }
  });
  const csv = buildQboInvoiceCsv(preflightQboInvoiceExport([sensitive], profile).included).csv;
  ['SECRET INTERNAL NOTE', 'SECRET PROVIDER', 'SECRET PROVIDER ID', 'SECRET TOKEN', 'SECRET COST', 'SECRET SUPPLIER', 'SECRET ITEM NOTE', 'SECRET PROFIT']
    .forEach((secret) => assert.equal(csv.includes(secret), false, `must redact ${secret}`));
});
