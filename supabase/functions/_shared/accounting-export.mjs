const DEFAULT_STATUS_FILTERS = Object.freeze([
  'accepted_quote',
  'invoice_issued',
  'invoice_partially_paid',
  'invoice_paid'
]);

export const ACCOUNTING_EXPORT_STATUS_FILTERS = Object.freeze([
  ...DEFAULT_STATUS_FILTERS,
  'invoice_void'
]);

export const ACCOUNTING_EXPORT_HEADERS = Object.freeze([
  'Document Type',
  'Document Number',
  'Document Date',
  'Document Status',
  'Acceptance Status',
  'Accepted / Acknowledged At',
  'Payment Status',
  'Paid At',
  'Customer Name',
  'Customer Email',
  'Customer Phone',
  'Customer Address',
  'Line Number',
  'Section',
  'Line Item Description',
  'Quantity',
  'Unit',
  'Unit Selling Price',
  'Line Total',
  'Currency',
  'Document Subtotal',
  'Document Adjustment',
  'Tax Label',
  'Tax Rate (%)',
  'Tax Amount',
  'Document Total',
  'Payments Received',
  'Balance Due'
]);

const MONEY_HEADERS = new Set([
  'Unit Selling Price',
  'Line Total',
  'Document Subtotal',
  'Document Adjustment',
  'Tax Amount',
  'Document Total',
  'Payments Received',
  'Balance Due'
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(number(value, 0) * 100) / 100;
}

function lower(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizeAccountingExportDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : '';
}

function isoTimestamp(value) {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function rowData(row) {
  return object(row && row.data);
}

function rowStatus(row) {
  const data = rowData(row);
  return lower((row && row.status) || data.status || '');
}

export function accountingDocumentType(row) {
  const data = rowData(row);
  const explicit = lower((row && row.type) || data.documentType || data.type || data._type || '');
  const status = rowStatus(row);
  const numberValue = text((row && row.quote_number) || data.quoteNumber || data.invoiceNumber);
  const hasChangeOrderReference = !!(
    (row && (row.parent_quote_id || row.change_order_number))
    || data.parentQuoteId
    || data.parent_quote_id
    || data.changeOrderNumber
    || data.change_order_number
  );
  if (explicit === 'change_order' || explicit === 'changeorder' || hasChangeOrderReference) return 'change_order';
  if (explicit === 'invoice' || ['invoiced', 'paid', 'voided'].includes(status) || /-INV$/i.test(numberValue)) return 'invoice';
  return 'quote';
}

function documentIsInvalid(row) {
  const data = rowData(row);
  const status = rowStatus(row);
  const validity = lower(data.document_validity || data.documentValidity || '');
  return ['voided', 'invalid', 'superseded'].includes(status)
    || ['voided', 'invalid', 'superseded'].includes(validity)
    || data.invalidated === true;
}

function quoteIsAccepted(row) {
  const data = rowData(row);
  const status = rowStatus(row);
  if (['draft', 'sent', 'viewed', 'declined'].includes(status)) return false;
  return ['accepted', 'approved'].includes(status)
    || data.accepted === true
    || data.approved === true
    || !!(data.accepted_at || data.approved_at || data.signed_at);
}

function invoiceIsIssued(row) {
  const data = rowData(row);
  const status = rowStatus(row);
  return documentIsInvalid(row)
    || ['invoiced', 'issued', 'sent', 'paid', 'voided'].includes(status)
    || data.invoice_issued === true
    || !!(data.invoice_issued_at || data.issued_at || data.issuedAt);
}

function invoiceIsAcknowledged(row) {
  const data = rowData(row);
  return data.invoice_acknowledged === true
    || !!(data.invoice_acknowledged_at || data.signed_at || data.accepted_at);
}

function documentDate(row) {
  const data = rowData(row);
  const candidates = accountingDocumentType(row) === 'invoice'
    ? [data.invoiceDate, data.invoice_date, data.issuedAt, data.issued_at, row && row.quote_date, row && row.created_at, data.savedAt]
    : [data.quoteDate, data.quote_date, row && row.quote_date, data.savedAt, row && row.created_at];
  for (const candidate of candidates) {
    const normalized = normalizeAccountingExportDate(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function documentNumber(row) {
  const data = rowData(row);
  return text((row && row.quote_number) || data.invoiceNumber || data.quoteNumber || data.documentNumber);
}

function customerAddress(row) {
  const data = rowData(row);
  const address = text(data.projectAddress || data.clientAddress || (row && row.client_address));
  const city = text(data.clientCity || (row && row.client_city));
  if (!address) return city;
  if (!city || address.toLowerCase().includes(city.toLowerCase())) return address;
  return `${address}, ${city}`;
}

function customer(row) {
  const data = rowData(row);
  return {
    name: text((row && row.client_name) || data.clientName || data.portal_client_name),
    email: text((row && row.client_email) || data.clientEmail || data.email || data.client_email || data.portal_client_email),
    phone: text((row && row.client_phone) || data.clientPhone || data.phone || data.client_phone),
    address: customerAddress(row)
  };
}

function priceIsTbd(item) {
  const mode = lower(item && item.pricingMode);
  return !!item && (item.priceTbd === true || ['tbd', 'price_tbd', 'to_be_determined'].includes(mode));
}

function quantity(item) {
  return Math.max(0, number(item && item.quantity, 0));
}

function hasMutatedUpgradeRate(item) {
  return !!item && (
    item._baseRate !== undefined
    || item._baseTotal !== undefined
    || item._baseUnitType !== undefined
  );
}

function upgradeType(item) {
  const upgrade = object(item && item.upgrade);
  const raw = lower(upgrade.type || upgrade.upgradeType || upgrade.mode);
  return ['add_on', 'addon', 'addition'].includes(raw) ? 'add_on' : 'replacement';
}

function activeRate(item) {
  if (!item || priceIsTbd(item)) return 0;
  const base = Math.max(0, number(item.rate !== undefined ? item.rate : item.price, 0));
  const upgrade = object(item.upgrade);
  if (item.upgraded && Object.keys(upgrade).length && upgrade.rate !== undefined) {
    if (hasMutatedUpgradeRate(item)) return base;
    const upgradeRate = Math.max(0, number(upgrade.rate, 0));
    return upgradeType(item) === 'add_on' ? base + upgradeRate : upgradeRate;
  }
  return base;
}

function originalLineTotal(item) {
  if (!item || priceIsTbd(item)) return 0;
  const upgrade = object(item.upgrade);
  if (item.upgraded && Object.keys(upgrade).length && !hasMutatedUpgradeRate(item) && upgrade.total !== undefined && upgrade.total !== null && upgrade.total !== '') {
    return roundMoney(Math.max(0, number(upgrade.total, 0)));
  }
  return roundMoney(quantity(item) * activeRate(item));
}

function discountAmount(item) {
  const original = originalLineTotal(item);
  if (!item || original <= 0) return 0;
  const type = lower(item.discountType || 'none');
  const value = Math.max(0, number(item.discountValue, 0));
  const amount = type === 'amount' ? value : (type === 'percent' ? original * value / 100 : 0);
  return roundMoney(Math.min(original, Math.max(0, amount)));
}

function chargedLineTotal(item) {
  if (!item || priceIsTbd(item)) return 0;
  const discount = discountAmount(item);
  if (discount > 0) return roundMoney(originalLineTotal(item) - discount);
  if (item.total !== undefined && item.total !== null && item.total !== '' && Number.isFinite(Number(item.total))) {
    return roundMoney(number(item.total, 0));
  }
  return originalLineTotal(item);
}

function markupFactor(room, item) {
  const roomMarkup = Math.max(0, Math.min(100, number(room && room.markup, 0)));
  let itemMarkup = 0;
  if (item && Object.prototype.hasOwnProperty.call(item, 'markup') && item.markup !== '' && item.markup !== null && item.markup !== undefined) {
    itemMarkup = Math.max(0, number(item.markup, 0));
  }
  return 1 + (roomMarkup + itemMarkup) / 100;
}

function lineDescription(item) {
  const upgrade = object(item && item.upgrade);
  if (item && item.upgraded && text(upgrade.name)) return text(upgrade.name);
  return text(item && (item.description || item.name || item.serviceName)) || 'Line item';
}

function itemIsIncluded(item) {
  if (!item || item._removed === true) return false;
  if (item.optional === true && item._optionalSelected === false) return false;
  return true;
}

export function accountingLineItems(row) {
  const data = rowData(row);
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  const lines = [];
  for (const room of rooms) {
    const items = Array.isArray(room && room.items) ? room.items : [];
    for (const item of items) {
      if (!itemIsIncluded(item)) continue;
      const factor = markupFactor(room, item);
      lines.push({
        section: text(room && (room.name || room.title)),
        description: lineDescription(item),
        quantity: quantity(item),
        unit: text(item && (item.unitType || item.unit)),
        unitSellingPrice: roundMoney(activeRate(item) * factor),
        lineTotal: roundMoney(chargedLineTotal(item) * factor)
      });
    }
  }
  return lines;
}

function adjustmentAmount(data, subtotal) {
  const adjustment = object(data.quoteAdjustment || data.clientAdjustment);
  if (!Object.keys(adjustment).length) return 0;
  const basisValue = lower(adjustment.basis || adjustment.mode);
  const basis = basisValue === 'amount' || (adjustment.amount && !adjustment.percent)
    ? 'amount'
    : 'percent';
  const raw = basis === 'amount'
    ? Math.max(0, number(adjustment.amount !== undefined ? adjustment.amount : adjustment.value, 0))
    : Math.max(0, number(subtotal, 0)) * Math.max(0, number(adjustment.percent, 0)) / 100;
  return roundMoney(lower(adjustment.type) === 'discount' ? -raw : raw);
}

function normalizedTaxRate(row) {
  const data = rowData(row);
  let rate = number(data.taxRate !== undefined ? data.taxRate : (data.tax_rate !== undefined ? data.tax_rate : row && row.tax_rate), 0.13);
  if (rate > 1) rate /= 100;
  return Math.max(0, rate);
}

function rawRecordedPaymentAmount(row) {
  const data = rowData(row);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const paidEntries = payments.reduce((sum, payment) => {
    if (!payment || !payment.paid_at) return sum;
    if (Number.isFinite(Number(payment.amount_cents))) return sum + Math.max(0, number(payment.amount_cents, 0)) / 100;
    return sum + Math.max(0, number(payment.amount, 0));
  }, 0);
  const received = object(data.paymentsReceived || data.paymentReceived);
  const aggregate = Math.max(0, number(received.amount !== undefined ? received.amount : received.value, 0));
  return roundMoney(Math.max(paidEntries, aggregate));
}

function storedDocumentTotal(row) {
  const data = rowData(row);
  const acceptedCents = number(data.accepted_total_cents, 0);
  if (accountingDocumentType(row) === 'quote' && acceptedCents > 0) return roundMoney(acceptedCents / 100);
  const candidates = [data.documentTotal, data.grossTotal, data.grandTotal, data.total, row && row.total];
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate))) {
      return roundMoney(number(candidate, 0));
    }
  }
  return 0;
}

function taxIsEnabled(row, taxableSubtotal, recordedPayment) {
  const data = rowData(row);
  if (data.taxEnabled === false || data.tax_enabled === false) return false;
  if (data.taxEnabled === true || data.tax_enabled === true) return true;
  const explicitTax = number(data.taxAmount !== undefined ? data.taxAmount : data.tax_amount, NaN);
  if (Number.isFinite(explicitTax)) return Math.abs(explicitTax) > 0.004;
  const rowTax = number(row && row.tax_amount, NaN);
  if (Number.isFinite(rowTax) && Math.abs(rowTax) > 0.004) return true;
  const rate = normalizedTaxRate(row);
  if (rate <= 0) return false;
  const stored = storedDocumentTotal(row);
  if (stored > 0) {
    const possibleGrossTotals = [stored, roundMoney(stored + recordedPayment)];
    const untaxed = roundMoney(taxableSubtotal);
    const taxed = roundMoney(taxableSubtotal + taxableSubtotal * rate);
    if (possibleGrossTotals.some((value) => Math.abs(value - untaxed) <= 0.02)) return false;
    if (possibleGrossTotals.some((value) => Math.abs(value - taxed) <= 0.02)) return true;
  }
  return true;
}

function latestTimestamp(values) {
  const parsed = values
    .map(isoTimestamp)
    .filter(Boolean)
    .sort();
  return parsed.length ? parsed[parsed.length - 1] : '';
}

function paymentState(row, documentTotal) {
  const data = rowData(row);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const status = rowStatus(row);
  const explicit = lower(data.paymentStatus || data.payment_status || '');
  const fullPayment = payments.some((payment) => {
    const type = lower(payment && payment.type);
    return !!(payment && payment.paid_at) && ['invoice', 'full', 'final', 'balance', 'invoice_full', 'full_payment'].includes(type);
  });
  let paidAmount = rawRecordedPaymentAmount(row);
  const paid = status === 'paid'
    || explicit === 'paid'
    || data.invoice_paid === true
    || fullPayment
    || (documentTotal > 0 && paidAmount >= documentTotal - 0.005);
  if (paid && documentTotal > 0 && paidAmount < documentTotal) paidAmount = documentTotal;
  const partial = !paid && (paidAmount > 0 || ['partially_paid', 'secured'].includes(explicit) || data.deposit_paid === true);
  const reported = !paid && !partial && data.manual_payment_reported === true;
  const paidAt = latestTimestamp([
    data.invoice_paid_at,
    data.payment_paid_at,
    data.lastPaymentAt,
    data.deposit_paid_at,
    ...payments.filter((payment) => payment && payment.paid_at).map((payment) => payment.paid_at)
  ]);
  return {
    key: paid ? 'paid' : (partial ? 'partially_paid' : (reported ? 'reported_unconfirmed' : 'unpaid')),
    label: paid ? 'Paid' : (partial ? 'Partially paid' : (reported ? 'Payment reported - unconfirmed' : 'Unpaid')),
    paidAt,
    amount: roundMoney(paidAmount),
    balanceDue: paid ? 0 : roundMoney(Math.max(documentTotal - paidAmount, 0))
  };
}

function documentTotals(row, lines) {
  const data = rowData(row);
  const lineSubtotal = roundMoney(lines.reduce((sum, line) => sum + number(line.lineTotal, 0), 0));
  const fallbackSubtotal = number(data.subtotal !== undefined ? data.subtotal : row && row.subtotal, 0);
  const subtotal = lines.length ? lineSubtotal : roundMoney(fallbackSubtotal);
  const adjustment = adjustmentAmount(data, subtotal);
  const taxableSubtotal = roundMoney(subtotal + adjustment);
  const recordedPayment = rawRecordedPaymentAmount(row);
  const rate = normalizedTaxRate(row);
  const enabled = taxIsEnabled(row, taxableSubtotal, recordedPayment);
  const explicitTax = number(data.taxAmount !== undefined ? data.taxAmount : data.tax_amount, NaN);
  const rowTax = number(row && row.tax_amount, NaN);
  let tax = enabled ? roundMoney(taxableSubtotal * rate) : 0;
  if (enabled && Number.isFinite(explicitTax)) tax = roundMoney(explicitTax);
  else if (enabled && Number.isFinite(rowTax) && Math.abs(rowTax) > 0.004) tax = roundMoney(rowTax);
  let total = roundMoney(taxableSubtotal + tax);
  const stored = storedDocumentTotal(row);
  if (!lines.length && stored > 0) total = stored;
  else if (stored > 0 && Math.abs(stored - total) <= 0.02) total = stored;
  const payment = paymentState(row, total);
  return {
    subtotal,
    adjustment,
    taxLabel: text(data.taxLabel || data.tax_label) || 'Tax',
    taxRate: enabled ? rate : 0,
    taxAmount: tax,
    total,
    paymentsReceived: payment.amount,
    balanceDue: payment.balanceDue,
    payment
  };
}

function acceptanceState(row) {
  const data = rowData(row);
  if (accountingDocumentType(row) === 'quote') {
    return {
      label: quoteIsAccepted(row) ? 'Accepted' : 'Not accepted',
      at: latestTimestamp([data.accepted_at, data.approved_at, data.signed_at, data.terms_accepted_at])
    };
  }
  return {
    label: invoiceIsAcknowledged(row) ? 'Acknowledged' : 'Not acknowledged',
    at: latestTimestamp([data.invoice_acknowledged_at, data.signed_at, data.accepted_at, data.terms_accepted_at])
  };
}

export function accountingStatusKey(row) {
  const type = accountingDocumentType(row);
  if (type === 'quote') return quoteIsAccepted(row) ? 'accepted_quote' : '';
  if (type !== 'invoice') return '';
  if (documentIsInvalid(row)) return 'invoice_void';
  if (!invoiceIsIssued(row)) return '';
  const total = documentTotals(row, accountingLineItems(row));
  if (total.payment.key === 'paid') return 'invoice_paid';
  if (total.payment.key === 'partially_paid') return 'invoice_partially_paid';
  return 'invoice_issued';
}

export function accountingDocument(row) {
  const type = accountingDocumentType(row);
  const lines = accountingLineItems(row);
  const totals = documentTotals(row, lines);
  const acceptance = acceptanceState(row);
  const customerData = customer(row);
  const invalid = documentIsInvalid(row);
  return {
    id: text(row && row.id),
    type,
    typeLabel: type === 'invoice' ? 'Invoice' : 'Accepted Quote',
    number: documentNumber(row),
    date: documentDate(row),
    status: type === 'invoice' ? (invalid ? 'Voided / invalid' : 'Issued') : 'Accepted',
    acceptance,
    payment: totals.payment,
    customer: customerData,
    currency: (/^[A-Z]{3}$/.test(text(rowData(row).currency).toUpperCase()) ? text(rowData(row).currency).toUpperCase() : 'CAD'),
    lines,
    totals
  };
}

export function accountingSummary(row) {
  const document = accountingDocument(row);
  return {
    id: document.id,
    type: document.type,
    typeLabel: document.typeLabel,
    number: document.number,
    date: document.date,
    status: document.status,
    paymentStatus: document.payment.label,
    customerName: document.customer.name,
    total: document.totals.total,
    currency: document.currency,
    statusKey: accountingStatusKey(row)
  };
}

export function normalizeAccountingExportFilters(filters) {
  const source = object(filters);
  const requested = Array.isArray(source.statuses) ? source.statuses.map(lower) : DEFAULT_STATUS_FILTERS.slice();
  const statuses = [...new Set(requested.filter((status) => ACCOUNTING_EXPORT_STATUS_FILTERS.includes(status)))];
  return {
    fromDate: normalizeAccountingExportDate(source.fromDate),
    toDate: normalizeAccountingExportDate(source.toDate),
    statuses
  };
}

export function filterAccountingRows(rows, filters) {
  const normalized = normalizeAccountingExportFilters(filters);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const statusKey = accountingStatusKey(row);
    if (!statusKey || !normalized.statuses.includes(statusKey)) return false;
    const date = documentDate(row);
    if (normalized.fromDate && (!date || date < normalized.fromDate)) return false;
    if (normalized.toDate && (!date || date > normalized.toDate)) return false;
    return true;
  });
}

export function neutralizeCsvFormula(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return /^[\u0000-\u0020]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

function formatNumericCell(value, header) {
  if (!Number.isFinite(value)) return '';
  if (MONEY_HEADERS.has(header)) return value.toFixed(2);
  if (header === 'Tax Rate (%)') return value.toFixed(4);
  if (header === 'Line Number') return String(Math.trunc(value));
  return String(Math.round(value * 1000000) / 1000000);
}

export function escapeAccountingCsvCell(value, header = '') {
  const formatted = typeof value === 'number'
    ? formatNumericCell(value, header)
    : neutralizeCsvFormula(value);
  return `"${String(formatted).replace(/"/g, '""')}"`;
}

function csvRowsForDocument(document) {
  const lines = document.lines.length ? document.lines : [{ section: '', description: '', quantity: null, unit: '', unitSellingPrice: null, lineTotal: null }];
  return lines.map((line, index) => {
    const first = index === 0;
    return [
      document.typeLabel,
      document.number,
      document.date,
      document.status,
      document.acceptance.label,
      document.acceptance.at,
      document.payment.label,
      document.payment.paidAt,
      document.customer.name,
      document.customer.email,
      document.customer.phone,
      document.customer.address,
      index + 1,
      line.section,
      line.description,
      line.quantity,
      line.unit,
      line.unitSellingPrice,
      line.lineTotal,
      document.currency,
      first ? document.totals.subtotal : null,
      first ? document.totals.adjustment : null,
      first ? document.totals.taxLabel : '',
      first ? document.totals.taxRate * 100 : null,
      first ? document.totals.taxAmount : null,
      first ? document.totals.total : null,
      first ? document.totals.paymentsReceived : null,
      first ? document.totals.balanceDue : null
    ];
  });
}

export function buildAccountingCsv(rows) {
  const documents = (Array.isArray(rows) ? rows : [])
    .map(accountingDocument)
    .sort((left, right) => `${left.date}|${left.number}|${left.id}`.localeCompare(`${right.date}|${right.number}|${right.id}`));
  const csvRows = [ACCOUNTING_EXPORT_HEADERS.slice()];
  for (const document of documents) csvRows.push(...csvRowsForDocument(document));
  const csv = csvRows.map((row) => row.map((value, index) => escapeAccountingCsvCell(value, ACCOUNTING_EXPORT_HEADERS[index])).join(',')).join('\r\n');
  return {
    csv,
    documents,
    documentCount: documents.length,
    lineCount: csvRows.length - 1
  };
}

export function accountingExportFilename(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  const day = Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `quotedr-accounting-transactions-${day}.csv`;
}
