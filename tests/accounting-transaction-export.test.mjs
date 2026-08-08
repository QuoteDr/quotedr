import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNTING_EXPORT_HEADERS,
  accountingDocument,
  accountingStatusKey,
  buildAccountingCsv,
  escapeAccountingCsvCell,
  filterAccountingRows,
  neutralizeCsvFormula,
  normalizeAccountingExportDate
} from '../supabase/functions/_shared/accounting-export.mjs';

const acceptedQuote = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'owner-one',
  quote_number: 'Q-100',
  client_name: '=HYPERLINK("https://bad.example")',
  client_email: '+customer@example.com',
  client_phone: '@555-0100',
  client_address: '-12 Client Street',
  client_city: 'Burlington',
  quote_date: '2026-01-15',
  tax_rate: 0.13,
  tax_amount: 32.58,
  total: 283.23,
  status: 'accepted',
  type: 'quote',
  data: {
    documentType: 'quote',
    accepted_at: '2026-01-20T15:30:00.000Z',
    currency: 'CAD',
    taxEnabled: true,
    taxRate: 0.13,
    taxLabel: 'HST',
    quoteAdjustment: { name: 'SECRET MARKUP RULE', type: 'discount', basis: 'percent', percent: 10 },
    paymentsReceived: { name: 'Deposit paid', amount: 50 },
    paymentStatus: 'partially_paid',
    payments: [{
      payment_record_id: 'provider-record-secret',
      provider: 'SECRET PROVIDER',
      stripe_payment_intent_id: 'SECRET PAYMENT INTENT',
      amount_cents: 5000,
      paid_at: '2026-01-21T11:00:00.000Z'
    }],
    portal_token: 'SECRET PORTAL TOKEN',
    internalNotes: 'SECRET INTERNAL NOTE',
    rooms: [{
      name: 'Main floor',
      markup: 10,
      internalNotes: 'SECRET ROOM NOTE',
      items: [{
        description: '=SUM(1,1)',
        quantity: 2,
        unitType: 'ea',
        rate: 100,
        total: 200,
        materialCost: 'SECRET MATERIAL COST',
        supplierUrl: 'SECRET SUPPLIER URL',
        notes: 'SECRET ITEM NOTE'
      }, {
        description: 'Quoted "special"\nservice',
        quantity: 1,
        unitType: 'job',
        rate: 50,
        total: 45,
        discountType: 'percent',
        discountValue: 10,
        markup: 20,
        profit: 'SECRET PROFIT'
      }]
    }]
  }
};

const paidInvoice = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: 'owner-one',
  quote_number: 'Q-100-INV',
  client_name: 'Jane Client',
  quote_date: '2026-02-05',
  tax_amount: 13,
  total: 100,
  status: 'paid',
  data: {
    documentType: 'invoice',
    currency: 'CAD',
    taxEnabled: false,
    paymentStatus: 'paid',
    invoice_paid_at: '2026-02-08T16:00:00.000Z',
    rooms: [{
      name: 'Invoice work',
      items: [{ description: 'Final work', quantity: 1, unitType: 'job', rate: 100, total: 100 }]
    }]
  }
};

const voidInvoice = {
  ...paidInvoice,
  id: '33333333-3333-4333-8333-333333333333',
  quote_number: 'Q-VOID-INV',
  status: 'invoiced',
  data: {
    ...paidInvoice.data,
    paymentStatus: '',
    invoice_paid_at: '',
    document_validity: 'superseded'
  }
};

const reportedInvoice = {
  ...paidInvoice,
  id: '66666666-6666-4666-8666-666666666666',
  quote_number: 'Q-REPORTED-INV',
  status: 'invoiced',
  data: {
    ...paidInvoice.data,
    paymentStatus: '',
    invoice_paid_at: '',
    manual_payment_reported: true,
    invoice_acknowledged: true,
    invoice_acknowledged_at: '2026-02-06T13:00:00.000Z'
  }
};

const draftQuote = {
  ...acceptedQuote,
  id: '44444444-4444-4444-8444-444444444444',
  quote_number: 'Q-DRAFT',
  status: 'draft',
  data: { ...acceptedQuote.data }
};

const draftInvoice = {
  ...paidInvoice,
  id: '77777777-7777-4777-8777-777777777777',
  quote_number: 'Q-DRAFT-INV',
  status: 'draft',
  data: { ...paidInvoice.data, paymentStatus: '', invoice_paid_at: '' }
};

const declinedQuote = {
  ...acceptedQuote,
  id: '88888888-8888-4888-8888-888888888888',
  quote_number: 'Q-DECLINED',
  status: 'declined'
};

const changeOrder = {
  ...acceptedQuote,
  id: '55555555-5555-4555-8555-555555555555',
  quote_number: 'Q-100-CO-1',
  type: '',
  parent_quote_id: '99999999-9999-4999-8999-999999999999',
  change_order_number: 1,
  data: { ...acceptedQuote.data, documentType: '' }
};

test('formula-like text is neutralized while real negative numbers stay numeric', () => {
  for (const value of ['=1+1', '+cmd', '-cmd', '@SUM(A1:A2)', '   =1+1']) {
    assert.equal(neutralizeCsvFormula(value), "'" + value);
  }
  assert.equal(neutralizeCsvFormula('ordinary text'), 'ordinary text');
  assert.equal(escapeAccountingCsvCell(-27.85, 'Document Adjustment'), '"-27.85"');
  assert.equal(escapeAccountingCsvCell('=1+1', 'Line Item Description'), '"\'=1+1"');
  assert.equal(escapeAccountingCsvCell('A "quote"\nnext line'), '"A ""quote""\nnext line"');
});

test('accepted quote line math uses selling prices and reconciles tax and payments', () => {
  const document = accountingDocument(acceptedQuote);
  assert.equal(document.typeLabel, 'Accepted Quote');
  assert.equal(document.lines.length, 2);
  assert.deepEqual(document.lines[0], {
    section: 'Main floor',
    description: '=SUM(1,1)',
    quantity: 2,
    unit: 'ea',
    unitSellingPrice: 110,
    lineTotal: 220
  });
  assert.equal(document.lines[1].unitSellingPrice, 65);
  assert.equal(document.lines[1].lineTotal, 58.5);
  assert.equal(document.totals.subtotal, 278.5);
  assert.equal(document.totals.adjustment, -27.85);
  assert.equal(document.totals.taxAmount, 32.58);
  assert.equal(document.totals.total, 283.23);
  assert.equal(document.payment.label, 'Partially paid');
  assert.equal(document.totals.paymentsReceived, 50);
  assert.equal(document.totals.balanceDue, 233.23);
  assert.equal(document.acceptance.label, 'Accepted');
});

test('paid invoice status closes the balance even when a legacy amount is absent', () => {
  const document = accountingDocument(paidInvoice);
  assert.equal(document.status, 'Issued');
  assert.equal(document.acceptance.label, 'Not acknowledged');
  assert.equal(document.payment.label, 'Paid');
  assert.equal(document.totals.total, 100);
  assert.equal(document.totals.paymentsReceived, 100);
  assert.equal(document.totals.balanceDue, 0);
  assert.equal(accountingStatusKey(paidInvoice), 'invoice_paid');
  assert.equal(accountingStatusKey(voidInvoice), 'invoice_void');
});

test('an unconfirmed client payment report is not counted as received money', () => {
  const document = accountingDocument(reportedInvoice);
  assert.equal(document.acceptance.label, 'Acknowledged');
  assert.equal(document.payment.label, 'Payment reported - unconfirmed');
  assert.equal(document.totals.paymentsReceived, 0);
  assert.equal(document.totals.balanceDue, 100);
  assert.equal(accountingStatusKey(reportedInvoice), 'invoice_issued');
});

test('date and status filters admit only eligible accepted quotes and issued invoices', () => {
  const rows = [acceptedQuote, paidInvoice, voidInvoice, draftQuote, draftInvoice, declinedQuote, changeOrder];
  const defaultRows = filterAccountingRows(rows, { fromDate: '2026-01-01', toDate: '2026-12-31' });
  assert.deepEqual(defaultRows.map((row) => row.id), [acceptedQuote.id, paidInvoice.id]);

  const withVoid = filterAccountingRows(rows, {
    fromDate: '2026-02-01',
    toDate: '2026-02-28',
    statuses: ['invoice_void']
  });
  assert.deepEqual(withVoid.map((row) => row.id), [voidInvoice.id]);
  assert.equal(normalizeAccountingExportDate('2026-02-28T12:00:00Z'), '2026-02-28');
  assert.equal(normalizeAccountingExportDate('2026-02-31'), '');
});

test('CSV includes documented fields once per document and redacts sensitive source data', () => {
  const built = buildAccountingCsv([acceptedQuote, paidInvoice]);
  assert.equal(built.documentCount, 2);
  assert.equal(built.lineCount, 3);
  assert.equal(built.csv.split('\r\n')[0], ACCOUNTING_EXPORT_HEADERS.map((header) => `"${header}"`).join(','));
  assert.match(built.csv, /"'=HYPERLINK\(""https:\/\/bad\.example""\)"/);
  assert.match(built.csv, /"'=SUM\(1,1\)"/);
  assert.match(built.csv, /"'\+customer@example\.com"/);
  assert.match(built.csv, /"Quoted ""special""\nservice"/);

  for (const secret of [
    'SECRET MARKUP RULE',
    'SECRET PROVIDER',
    'SECRET PAYMENT INTENT',
    'SECRET PORTAL TOKEN',
    'SECRET INTERNAL NOTE',
    'SECRET ROOM NOTE',
    'SECRET MATERIAL COST',
    'SECRET SUPPLIER URL',
    'SECRET ITEM NOTE',
    'SECRET PROFIT',
    'provider-record-secret'
  ]) {
    assert.equal(built.csv.includes(secret), false, `CSV must redact ${secret}`);
  }

  const quoteRows = built.csv.split('\r\n').filter((line) => line.includes('Q-100') && !line.includes('Q-100-INV'));
  assert.equal(quoteRows.length, 2);
  assert.match(quoteRows[0], /"283\.23"/);
  assert.equal(quoteRows[1].includes('"283.23"'), false, 'document total should appear only on the first line');
});
