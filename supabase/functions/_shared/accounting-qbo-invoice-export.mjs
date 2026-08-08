import {
  accountingDocument,
  accountingStatusKey,
  escapeAccountingCsvCell,
  normalizeAccountingExportDate
} from './accounting-export.mjs';

export const QBO_INVOICE_CSV_HEADERS = Object.freeze([
  'Invoice Number',
  'Customer',
  'Invoice Date',
  'Due Date',
  'Product/Service',
  'Description',
  'Quantity',
  'Rate',
  'Item Amount',
  'Currency',
  'Item Tax Code'
]);

export const QBO_INVOICE_MAX_DOCUMENTS = 100;
export const QBO_INVOICE_MAX_ROWS = 1000;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value, max = 250) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function exactMap(value, maxEntries = 500) {
  const source = object(value);
  const mapped = {};
  for (const [from, to] of Object.entries(source).slice(0, maxEntries)) {
    const key = text(from);
    const target = text(to);
    if (key && target) mapped[key] = target;
  }
  return mapped;
}

export function normalizeQboInvoiceProfile(value) {
  const source = object(value);
  return {
    version: 1,
    name: text(source.name, 80) || 'QuickBooks Online invoice profile',
    allowCreateCustomers: source.allowCreateCustomers === true,
    customerMappings: exactMap(source.customerMappings),
    itemMappings: exactMap(source.itemMappings),
    taxMappings: exactMap(source.taxMappings),
    taxExemptCode: text(source.taxExemptCode, 120)
  };
}

function invoiceDueDate(row) {
  const data = object(row && row.data);
  const candidates = [
    data.dueDate,
    data.due_date,
    data.invoiceDueDate,
    data.invoice_due_date,
    data.paymentDueDate,
    data.payment_due_date
  ];
  for (const candidate of candidates) {
    const date = normalizeAccountingExportDate(candidate);
    if (date) return date;
  }
  return '';
}

function addReason(result, reason) {
  if (!result.reasons.includes(reason)) result.reasons.push(reason);
}

function lineIsDiscounted(line) {
  const quantity = Number(line.quantity);
  const rate = Number(line.unitSellingPrice);
  const total = Number(line.lineTotal);
  return !Number.isFinite(quantity) || !Number.isFinite(rate) || !Number.isFinite(total)
    || Math.abs((quantity * rate) - total) > 0.01;
}

function qboTaxCode(document, profile) {
  const taxable = Math.abs(Number(document.totals.taxAmount || 0)) > 0.004
    || Math.abs(Number(document.totals.taxRate || 0)) > 0.00001;
  if (!taxable) return profile.taxExemptCode;
  return profile.taxMappings[document.totals.taxLabel] || '';
}

function preflightOne(row, profile) {
  const document = accountingDocument(row);
  const status = accountingStatusKey(row);
  const result = {
    id: text(document.id, 80),
    invoiceNumber: document.number,
    customer: document.customer.name,
    date: document.date,
    dueDate: invoiceDueDate(row),
    currency: document.currency,
    total: money(document.totals.total),
    lineCount: document.lines.length,
    included: false,
    reasons: [],
    rows: []
  };

  if (document.type !== 'invoice') addReason(result, 'Only issued invoices can be exported to the QBO invoice file.');
  if (status !== 'invoice_issued') {
    if (status === 'invoice_partially_paid') addReason(result, 'Partially paid invoices need a separate payment workflow.');
    else if (status === 'invoice_paid') addReason(result, 'Paid invoices need a separate payment workflow.');
    else if (status === 'invoice_void') addReason(result, 'Voided or invalid invoices cannot be imported.');
    else addReason(result, 'The document is not an issued unpaid invoice.');
  }
  if (document.payment.key !== 'unpaid') {
    if (document.payment.key === 'reported_unconfirmed') addReason(result, 'A client-reported payment is not confirmed money.');
    else addReason(result, 'Only unpaid invoices can be exported.');
  }
  if (!document.number) addReason(result, 'Invoice number is missing.');
  if (!document.date) addReason(result, 'Invoice date is missing.');
  if (!result.dueDate) addReason(result, 'Due date is missing.');
  if (!document.customer.name) addReason(result, 'Customer is missing.');
  if (Number(document.totals.adjustment || 0) !== 0) addReason(result, 'Document adjustments are not supported by this QBO CSV.');
  if (!document.lines.length) addReason(result, 'The invoice has no exportable line items.');

  const mappedCustomer = profile.customerMappings[document.customer.name];
  if (document.customer.name && !mappedCustomer && !profile.allowCreateCustomers) {
    addReason(result, 'Customer has no exact saved QBO mapping.');
  }
  const taxCode = qboTaxCode(document, profile);
  if (!taxCode) {
    addReason(result, Math.abs(Number(document.totals.taxAmount || 0)) > 0.004
      ? 'Tax label has no configured QBO tax-code mapping.'
      : 'A QBO tax-exempt code is required for non-taxable invoices.');
  }

  for (const line of document.lines) {
    const description = text(line.description, 1000);
    const itemName = profile.itemMappings[description];
    if (!description) addReason(result, 'A line item description is missing.');
    if (!itemName) addReason(result, `Line item "${description || 'unnamed'}" has no exact saved QBO product/service mapping.`);
    if (Number(line.quantity) <= 0) addReason(result, `Line item "${description || 'unnamed'}" has an unsupported quantity.`);
    if (Number(line.lineTotal) < 0 || Number(line.unitSellingPrice) < 0) addReason(result, `Line item "${description || 'unnamed'}" has an unsupported negative amount.`);
    if (lineIsDiscounted(line)) addReason(result, `Line item "${description || 'unnamed'}" has a discount or amount that cannot be represented safely.`);
    result.rows.push([
      document.number,
      mappedCustomer || document.customer.name,
      document.date,
      result.dueDate,
      itemName || '',
      description,
      money(line.quantity),
      money(line.unitSellingPrice),
      money(line.lineTotal),
      document.currency,
      taxCode
    ]);
  }
  return result;
}

export function preflightQboInvoiceExport(rows, profileValue) {
  const profile = normalizeQboInvoiceProfile(profileValue);
  const documents = (Array.isArray(rows) ? rows : []).map((row) => preflightOne(row, profile));
  const numberCounts = new Map();
  for (const document of documents) {
    if (document.invoiceNumber) numberCounts.set(document.invoiceNumber, (numberCounts.get(document.invoiceNumber) || 0) + 1);
  }
  for (const document of documents) {
    if (document.invoiceNumber && numberCounts.get(document.invoiceNumber) > 1) {
      addReason(document, 'Invoice number appears more than once in this review.');
    }
    document.included = document.reasons.length === 0;
  }
  const included = documents.filter((document) => document.included);
  const excluded = documents.filter((document) => !document.included);
  return {
    profile,
    documents,
    included,
    excluded,
    totals: {
      includedInvoices: included.length,
      excludedInvoices: excluded.length,
      includedRows: included.reduce((sum, document) => sum + document.rows.length, 0),
      includedTotal: money(included.reduce((sum, document) => sum + document.total, 0))
    }
  };
}

export function buildQboInvoiceCsv(documents) {
  const selected = Array.isArray(documents) ? documents : [];
  if (selected.length > QBO_INVOICE_MAX_DOCUMENTS) {
    throw new Error(`Choose no more than ${QBO_INVOICE_MAX_DOCUMENTS} invoices.`);
  }
  if (selected.some((document) => !document || !document.included)) {
    throw new Error('Every selected invoice must pass the QBO preflight.');
  }
  const rows = selected.flatMap((document) => document.rows || []);
  if (rows.length > QBO_INVOICE_MAX_ROWS) {
    throw new Error(`Choose no more than ${QBO_INVOICE_MAX_ROWS} invoice rows.`);
  }
  const csvRows = [QBO_INVOICE_CSV_HEADERS, ...rows];
  return {
    documentCount: selected.length,
    lineCount: rows.length,
    csv: csvRows.map((row) => row.map((value, index) => escapeAccountingCsvCell(value, QBO_INVOICE_CSV_HEADERS[index])).join(',')).join('\r\n')
  };
}

export function qboInvoiceCsvFilename(date = new Date()) {
  return `quotedr-qbo-invoices-${date.toISOString().slice(0, 10)}.csv`;
}
