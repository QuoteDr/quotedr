import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  annotateQuoteReferences,
  authenticatedClient,
  loadAccountFieldAccess,
  loadAccountContext,
  requireAccountPermission,
  serviceClient,
  type AccountAuthorization
} from '../_shared/account-authorization.ts';
import {
  ACCOUNT_FIELD,
  accountFieldCanRead,
  accountFieldCanWrite,
  mergeClientFieldAccess,
  mergeQuoteFieldAccess,
  mergeRestrictedQuoteUpdate,
  removeTeamDataReferences,
  sanitizeBusinessProfile,
  sanitizeClientRow,
  sanitizeQuoteRow,
  sanitizeSavedItemRow,
  sanitizeTemplateRow,
  stripRestrictedWriteFields
} from '../_shared/account-data-policy.mjs';
import {
  accountingExportFilename,
  accountingSummary,
  buildAccountingCsv,
  filterAccountingRows,
  normalizeAccountingExportDate,
  normalizeAccountingExportFilters
} from '../_shared/accounting-export.mjs';
import {
  AccountRolePolicyError,
  accountRoleRpcFailure,
  assertAccountRoleOwner,
  normalizeAccountRoleSave
} from '../_shared/account-role-policy.mjs';
import {
  buildQboInvoiceCsv,
  normalizeQboInvoiceProfile,
  preflightQboInvoiceExport,
  qboInvoiceCsvFilename,
  QBO_INVOICE_MAX_DOCUMENTS,
  QBO_INVOICE_MAX_ROWS
} from '../_shared/accounting-qbo-invoice-export.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function supportId() {
  return crypto.randomUUID().split('-')[0].toUpperCase();
}

function cleanText(value: unknown, max = 200) {
  return String(value || '').trim().slice(0, max);
}

async function hasPermission(auth: AccountAuthorization, permissionKey: string) {
  const { data, error } = await auth.userClient.rpc('quotedr_authorize_account', {
    p_account_id: auth.accountId,
    p_permission_key: permissionKey
  });
  return !error && (Array.isArray(data) ? data.length > 0 : data != null);
}

function accountError(error: unknown) {
  if (error instanceof AccountAccessError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  const id = supportId();
  console.error('team-account error', { supportId: id, message: (error as Error)?.message });
  return json({ error: 'The account request could not be completed.', code: 'request_failed', supportId: id }, 500);
}

const quoteColumns = new Set([
  'id', 'quote_number', 'client_name', 'client_address', 'client_city',
  'client_phone', 'client_email', 'project_description', 'quote_date',
  'valid_until', 'subtotal', 'tax_rate', 'tax_amount', 'total', 'status',
  'notes', 'type', 'parent_quote_id', 'change_order_number', 'data'
]);

const accountingExportSelect = [
  'id', 'quote_number', 'client_name', 'client_address', 'client_city',
  'client_phone', 'client_email', 'quote_date', 'subtotal', 'tax_rate',
  'tax_amount', 'total', 'status', 'type', 'parent_quote_id',
  'change_order_number', 'data', 'created_at', 'updated_at'
].join(',');
const accountingExportLimit = 500;
const accountingExportSourceLimit = 2001;
const qboInvoiceProfileKey = 'accounting_qbo_invoice_csv_profile_v1';
const qboInvoiceSourceLimit = 1001;

const defaultDocumentNumberingSettings = Object.freeze({
  version: 1,
  companyCode: '',
  companyCodePosition: 'suffix',
  formatStyle: 'document_first',
  yearStyle: 'four_digit',
  clientPadding: 4,
  sequencePadding: 3,
  documentCodes: Object.freeze({ quote: 'Q', invoice: 'I', change_order: 'CO', revision: 'R' })
});

function numberingRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && Array.isArray(value) === false
    ? value as Record<string, unknown>
    : {};
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function normalizeDocumentNumberingSettings(value: unknown) {
  const source = numberingRecord(value);
  const companyCode = cleanText(source.companyCode, 40).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const companyCodePosition = ['prefix', 'suffix', 'none'].includes(String(source.companyCodePosition || '').toLowerCase())
    ? String(source.companyCodePosition).toLowerCase()
    : defaultDocumentNumberingSettings.companyCodePosition;
  const formatStyle = String(source.formatStyle || '').toLowerCase() === 'client_first'
    ? 'client_first'
    : defaultDocumentNumberingSettings.formatStyle;
  const yearStyle = ['four_digit', 'two_digit', 'none'].includes(String(source.yearStyle || '').toLowerCase())
    ? String(source.yearStyle).toLowerCase()
    : defaultDocumentNumberingSettings.yearStyle;
  return {
    version: 1,
    companyCode,
    companyCodePosition: companyCode ? companyCodePosition : 'none',
    formatStyle,
    yearStyle,
    clientPadding: boundedInteger(source.clientPadding, 4, 2, 8),
    sequencePadding: boundedInteger(source.sequencePadding, 3, 2, 8),
    documentCodes: { ...defaultDocumentNumberingSettings.documentCodes }
  };
}

const accountPlanFeatures: Record<string, string[]> = {
  basic: [
    'quotes', 'invoices', 'clients', 'templates', 'custom_branding',
    'stripe_payments', 'client_quote_viewer', 'cross_device_sync'
  ],
  pro: [
    'quotes', 'invoices', 'clients', 'templates', 'custom_branding',
    'stripe_payments', 'client_quote_viewer', 'cross_device_sync',
    'ai_voice_quote', 'ai_assistant', 'smart_import', 'quote_import',
    'ai_refine', 'writing_suggestions', 'quote_completeness_review',
    'ikea_quoter', 'job_tracker', 'labor_tracker', 'floor_plan_scanner',
    'quote_upsells', 'full_resolution_photos', 'profit_tracking',
    'payment_reminders', 'quickbooks', 'bank_card_sync'
  ]
};

function pickAllowed(source: Record<string, unknown>, allowed: Set<string>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (allowed.has(key)) output[key] = value;
  }
  return output;
}

async function quoteView(
  auth: AccountAuthorization,
  row: Record<string, unknown>,
  canReadPricing: boolean,
  fieldAccess: Record<string, 'read' | 'write'>
) {
  const annotated = await annotateQuoteReferences(auth.accountId, row);
  return sanitizeQuoteRow(annotated, { canReadPricing, fieldAccess });
}

async function listQuotes(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.QUOTES_READ);
  const admin = serviceClient();
  const limit = Math.min(500, Math.max(1, Number(body.limit) || 250));
  const result = await admin
    .from('quotes')
    .select('*')
    .eq('user_id', auth.ownerUserId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) throw result.error;
  const canReadPricing = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  const rows = [];
  for (const row of result.data || []) rows.push(await quoteView(auth, row, canReadPricing, fieldAccess));
  return json({ data: rows });
}

async function requireAccountingExportOwner(req: Request, accountId: unknown) {
  const context = await loadAccountContext(req);
  const requestedAccountId = cleanText(accountId, 80);
  const ownedAccounts = context.accounts.filter((account: Record<string, unknown>) => {
    return account.ownerUserId === context.user.id;
  });
  if (!requestedAccountId) {
    if (context.accounts.length > 0 && ownedAccounts.length === 0) {
      throw new AccountAccessError('Accounting exports are available only to the account owner.', 403, 'owner_required');
    }
    return {
      accountId: ownedAccounts[0] && ownedAccounts[0].accountId || null,
      ownerUserId: context.user.id,
      user: context.user
    };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedAccountId)) {
    throw new AccountAccessError('Choose an account', 400, 'account_required');
  }
  const selected = context.accounts.find((account: Record<string, unknown>) => {
    return account.accountId === requestedAccountId;
  }) as Record<string, unknown> | undefined;
  if (!selected || selected.ownerUserId !== context.user.id) {
    throw new AccountAccessError('Accounting exports are available only to the account owner.', 403, 'owner_required');
  }
  return {
    accountId: requestedAccountId,
    ownerUserId: context.user.id,
    user: context.user
  };
}

function accountingExportFilters(body: Record<string, unknown>) {
  const raw = body.filters && typeof body.filters === 'object'
    ? body.filters as Record<string, unknown>
    : {};
  const rawFrom = cleanText(raw.fromDate, 20);
  const rawTo = cleanText(raw.toDate, 20);
  const fromDate = normalizeAccountingExportDate(rawFrom);
  const toDate = normalizeAccountingExportDate(rawTo);
  if ((rawFrom && !fromDate) || (rawTo && !toDate)) {
    throw new AccountAccessError('Use valid accounting export dates.', 400, 'invalid_date');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new AccountAccessError('The start date must be on or before the end date.', 400, 'invalid_date_range');
  }
  const filters = normalizeAccountingExportFilters({ ...raw, fromDate, toDate });
  if (!filters.statuses.length) {
    throw new AccountAccessError('Choose at least one document status.', 400, 'status_required');
  }
  return filters;
}

function accountingExportDocumentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.map((entry) => cleanText(entry, 80)).filter(Boolean))];
  if (ids.length > accountingExportLimit) {
    throw new AccountAccessError(`Choose no more than ${accountingExportLimit} documents at once.`, 400, 'too_many_documents');
  }
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new AccountAccessError('One or more selected documents are invalid.', 400, 'invalid_document');
  }
  return ids;
}

async function accountingExport(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const owner = await requireAccountingExportOwner(req, accountId);
  const filters = accountingExportFilters(body);
  const mode = cleanText(body.mode, 20) === 'csv' ? 'csv' : 'list';
  const documentIds = accountingExportDocumentIds(body.documentIds);
  if (mode === 'csv' && documentIds.length === 0) {
    throw new AccountAccessError('Choose at least one document to export.', 400, 'document_required');
  }

  let query = serviceClient()
    .from('quotes')
    .select(accountingExportSelect)
    .eq('user_id', owner.ownerUserId)
    .neq('quote_number', '__ITEMS_BACKUP__');
  if (filters.fromDate) query = query.gte('quote_date', filters.fromDate);
  if (filters.toDate) query = query.lte('quote_date', filters.toDate);
  if (mode === 'csv') query = query.in('id', documentIds);

  const result = await query
    .order('quote_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(mode === 'csv' ? documentIds.length : accountingExportSourceLimit);
  if (result.error) throw result.error;
  if (mode === 'csv' && (result.data || []).length !== documentIds.length) {
    throw new AccountAccessError('One or more selected documents are unavailable.', 404, 'document_unavailable');
  }

  const eligible = filterAccountingRows(result.data || [], filters);
  if (mode === 'list') {
    const selected = eligible.slice(0, accountingExportLimit);
    return json({
      data: {
        documents: selected.map(accountingSummary),
        truncated: eligible.length > accountingExportLimit || (result.data || []).length >= accountingExportSourceLimit,
        limit: accountingExportLimit
      }
    });
  }
  if (eligible.length !== documentIds.length) {
    throw new AccountAccessError('A selected document no longer matches the export filters.', 409, 'document_filter_changed');
  }
  const built = buildAccountingCsv(eligible);
  return json({
    data: {
      csv: built.csv,
      filename: accountingExportFilename(),
      documentCount: built.documentCount,
      lineCount: built.lineCount
    }
  });
}

async function loadQboInvoiceProfile(ownerUserId: string) {
  const result = await serviceClient()
    .from('user_data')
    .select('value')
    .eq('user_id', ownerUserId)
    .eq('key', qboInvoiceProfileKey)
    .maybeSingle();
  if (result.error) throw result.error;
  return normalizeQboInvoiceProfile(result.data && result.data.value);
}

async function qboInvoiceProfile(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const owner = await requireAccountingExportOwner(req, accountId);
  const mode = cleanText(body.mode, 20);
  if (mode === 'save') {
    const profile = normalizeQboInvoiceProfile(body.profile);
    const saved = await serviceClient()
      .from('user_data')
      .upsert({ user_id: owner.ownerUserId, key: qboInvoiceProfileKey, value: profile }, { onConflict: 'user_id,key' });
    if (saved.error) throw saved.error;
    return json({ data: { profile } });
  }
  return json({ data: { profile: await loadQboInvoiceProfile(owner.ownerUserId) } });
}

function qboInvoiceDateFilters(body: Record<string, unknown>) {
  const raw = body.filters && typeof body.filters === 'object'
    ? body.filters as Record<string, unknown>
    : {};
  const rawFrom = cleanText(raw.fromDate, 20);
  const rawTo = cleanText(raw.toDate, 20);
  const fromDate = normalizeAccountingExportDate(rawFrom);
  const toDate = normalizeAccountingExportDate(rawTo);
  if ((rawFrom && !fromDate) || (rawTo && !toDate)) {
    throw new AccountAccessError('Use valid QBO export dates.', 400, 'invalid_date');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new AccountAccessError('The start date must be on or before the end date.', 400, 'invalid_date_range');
  }
  return { fromDate, toDate };
}

function qboInvoiceDocumentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.map((entry) => cleanText(entry, 80)).filter(Boolean))];
  if (ids.length > QBO_INVOICE_MAX_DOCUMENTS) {
    throw new AccountAccessError(`Choose no more than ${QBO_INVOICE_MAX_DOCUMENTS} QBO invoices at once.`, 400, 'too_many_documents');
  }
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new AccountAccessError('One or more selected invoices are invalid.', 400, 'invalid_document');
  }
  return ids;
}

async function qboInvoiceRows(ownerUserId: string, filters: { fromDate: string; toDate: string }, documentIds: string[]) {
  let query = serviceClient()
    .from('quotes')
    .select(accountingExportSelect)
    .eq('user_id', ownerUserId)
    .neq('quote_number', '__ITEMS_BACKUP__');
  if (filters.fromDate) query = query.gte('quote_date', filters.fromDate);
  if (filters.toDate) query = query.lte('quote_date', filters.toDate);
  if (documentIds.length) query = query.in('id', documentIds);
  const result = await query
    .order('quote_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(documentIds.length || qboInvoiceSourceLimit);
  if (result.error) throw result.error;
  if (documentIds.length && (result.data || []).length !== documentIds.length) {
    throw new AccountAccessError('One or more selected invoices are unavailable.', 404, 'document_unavailable');
  }
  return { rows: result.data || [], truncated: !documentIds.length && (result.data || []).length >= qboInvoiceSourceLimit };
}

async function qboInvoiceExport(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const owner = await requireAccountingExportOwner(req, accountId);
  const mode = cleanText(body.mode, 20) === 'csv' ? 'csv' : 'preflight';
  const filters = qboInvoiceDateFilters(body);
  const documentIds = qboInvoiceDocumentIds(body.documentIds);
  if (mode === 'csv' && !documentIds.length) {
    throw new AccountAccessError('Choose at least one QBO-ready invoice.', 400, 'document_required');
  }
  const [profile, source] = await Promise.all([
    loadQboInvoiceProfile(owner.ownerUserId),
    qboInvoiceRows(owner.ownerUserId, filters, documentIds)
  ]);
  const preflight = preflightQboInvoiceExport(source.rows, profile);
  if (mode === 'preflight') {
    return json({
      data: {
        profile: preflight.profile,
        documents: preflight.documents.map(({ rows, ...document }) => document),
        totals: preflight.totals,
        limits: { invoices: QBO_INVOICE_MAX_DOCUMENTS, rows: QBO_INVOICE_MAX_ROWS },
        truncated: source.truncated
      }
    });
  }
  const selected = preflight.documents.filter((document) => documentIds.includes(document.id));
  if (selected.length !== documentIds.length || selected.some((document) => !document.included)) {
    throw new AccountAccessError('Every selected invoice must pass the current QBO preflight.', 409, 'qbo_preflight_failed');
  }
  let built;
  try {
    built = buildQboInvoiceCsv(selected);
  } catch (error) {
    throw new AccountAccessError((error as Error).message, 400, 'qbo_batch_invalid');
  }
  return json({
    data: {
      csv: built.csv,
      filename: qboInvoiceCsvFilename(),
      documentCount: built.documentCount,
      lineCount: built.lineCount,
      profile: preflight.profile.name,
      total: preflight.totals.includedTotal
    }
  });
}

async function getQuote(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.QUOTES_READ);
  const quoteId = cleanText(body.quoteId, 80);
  if (!quoteId) throw new AccountAccessError('Quote is required', 400, 'quote_required');
  const result = await serviceClient()
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('user_id', auth.ownerUserId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AccountAccessError('Quote not found', 404, 'not_found');
  const canReadPricing = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  return json({ data: await quoteView(auth, result.data, canReadPricing, fieldAccess) });
}

async function getBusiness(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.BUSINESS_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  const admin = serviceClient();
  const stored = await admin
    .from('user_data')
    .select('value')
    .eq('user_id', auth.ownerUserId)
    .eq('key', 'business_profile')
    .maybeSingle();
  if (stored.error) throw stored.error;
  if (stored.data && stored.data.value) {
    return json({ data: sanitizeBusinessProfile(stored.data.value, { fieldAccess }) });
  }
  const result = await admin
    .from('business_profiles')
    .select('business_name,owner_name,address,city,province,postal_code,phone,email,hst_number,logo_url')
    .eq('user_id', auth.ownerUserId)
    .maybeSingle();
  if (result.error) throw result.error;
  return json({ data: result.data ? sanitizeBusinessProfile(result.data, { fieldAccess }) : null });
}

async function getDocumentNumberingSettings(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.ACCOUNT_READ);
  const result = await serviceClient()
    .from('accounts')
    .select('document_numbering_settings')
    .eq('id', auth.accountId)
    .single();
  if (result.error) throw result.error;
  const stored = numberingRecord(result.data && result.data.document_numbering_settings);
  return json({
    data: {
      settings: normalizeDocumentNumberingSettings(stored),
      configured: Object.keys(stored).length > 0
    }
  });
}

async function saveDocumentNumberingSettings(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.SETTINGS_MANAGE);
  const settings = normalizeDocumentNumberingSettings(body.settings);
  const admin = serviceClient();
  const result = await admin
    .from('accounts')
    .update({ document_numbering_settings: settings, updated_at: new Date().toISOString() })
    .eq('id', auth.accountId)
    .select('document_numbering_settings')
    .single();
  if (result.error) throw result.error;
  const audit = await admin.from('account_audit_events').insert({
    account_id: auth.accountId,
    actor_user_id: auth.user.id,
    event_type: 'settings.document_numbering.updated',
    target_type: 'account',
    target_id: auth.accountId,
    details: { settings }
  });
  if (audit.error) console.warn('Document numbering settings audit failed:', audit.error.message);
  return json({ data: { settings, configured: true } });
}

async function resolveNumberingClient(
  req: Request,
  auth: AccountAuthorization,
  body: Record<string, unknown>
) {
  const source = numberingRecord(body.client);
  const clientId = cleanText(source.id || source.clientId, 80);
  const clientName = cleanText(source.name || body.clientName, 300);
  const admin = serviceClient();
  let existing = null;
  if (clientId) {
    const lookup = await admin
      .from('clients')
      .select('id,name,client_number,phone,email,address,city')
      .eq('id', clientId)
      .eq('user_id', auth.ownerUserId)
      .maybeSingle();
    if (lookup.error) throw lookup.error;
    existing = lookup.data;
  }
  if (!existing && clientName) {
    const lookup = await admin
      .from('clients')
      .select('id,name,client_number,phone,email,address,city')
      .eq('user_id', auth.ownerUserId)
      .eq('name', clientName)
      .maybeSingle();
    if (lookup.error) throw lookup.error;
    existing = lookup.data;
  }
  if (existing) return existing;
  if (!clientName) throw new AccountAccessError('Choose or create a client first', 400, 'client_required');

  await requireAccountPermission(req, auth.accountId, ACCOUNT_PERMISSION.CLIENTS_MANAGE);
  const created = await admin
    .from('clients')
    .upsert({
      user_id: auth.ownerUserId,
      name: clientName,
      phone: cleanText(source.phone, 80),
      email: cleanText(source.email, 320),
      address: cleanText(source.address, 500),
      city: cleanText(source.city, 200),
      notes: '',
      crm: {},
      created_by_user_id: auth.user.id,
      updated_by_user_id: auth.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,name' })
    .select('id,name,client_number,phone,email,address,city')
    .single();
  if (created.error) throw created.error;
  return created.data;
}

async function reserveDocumentNumber(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.QUOTES_CREATE);
  const documentType = cleanText(body.documentType, 40).toLowerCase();
  if (!['quote', 'invoice', 'change_order', 'revision'].includes(documentType)) {
    throw new AccountAccessError('Choose a supported document type', 400, 'document_type_invalid');
  }
  const client = await resolveNumberingClient(req, auth, body);
  const requestedYear = Number.parseInt(String(body.documentYear || ''), 10);
  const documentYear = Number.isFinite(requestedYear) && requestedYear >= 2000 && requestedYear <= 9999
    ? requestedYear
    : new Date().getUTCFullYear();
  const result = await serviceClient().rpc('quotedr_reserve_document_number', {
    p_account_id: auth.accountId,
    p_document_type: documentType,
    p_client_id: client.id,
    p_actor_user_id: auth.user.id,
    p_document_year: documentYear
  });
  if (result.error) throw result.error;
  const reservation = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!reservation || !reservation.document_number) {
    throw new AccountAccessError('Document number could not be reserved', 500, 'number_reservation_failed');
  }
  return json({
    data: {
      documentNumber: reservation.document_number,
      client: {
        id: client.id,
        name: client.name,
        clientNumber: reservation.client_number
      },
      clientNumber: reservation.client_number,
      sequence: reservation.sequence_value,
      settings: reservation.numbering_settings
    }
  });
}

async function ensureNumberingClient(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.CLIENTS_MANAGE);
  const client = await resolveNumberingClient(req, auth, body);
  return json({
    data: {
      client: {
        id: client.id,
        name: client.name,
        clientNumber: client.client_number
      },
      clientNumber: client.client_number
    }
  });
}

async function getLogo(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.BUSINESS_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  if (!accountFieldCanRead(fieldAccess, ACCOUNT_FIELD.BUSINESS_LOGO)) return json({ data: null });
  const result = await serviceClient()
    .from('user_data')
    .select('value')
    .eq('user_id', auth.ownerUserId)
    .eq('key', 'company_logo')
    .maybeSingle();
  if (result.error) throw result.error;
  const value = result.data && result.data.value as Record<string, unknown> | null;
  return json({ data: value && typeof value.logo === 'string' ? value.logo : null });
}

async function getPaymentSettings(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.PAYMENTS_READ);
  const result = await serviceClient()
    .from('user_data')
    .select('value')
    .eq('user_id', auth.ownerUserId)
    .eq('key', 'payment_settings')
    .maybeSingle();
  if (result.error) throw result.error;
  return json({ data: result.data && result.data.value || null });
}

async function getEntitlements(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.ACCOUNT_READ);
  const admin = serviceClient();
  const result = await admin
    .from('user_data')
    .select('value')
    .eq('user_id', auth.ownerUserId)
    .eq('key', 'subscription_status')
    .maybeSingle();
  if (result.error) throw result.error;
  const subscription = result.data && result.data.value as Record<string, unknown> | null;
  const active = subscription && ['active', 'trialing'].includes(String(subscription.status || '').toLowerCase());
  const passResult = await admin
    .from('birthday_reward_claims')
    .select('id')
    .eq('user_id', auth.ownerUserId)
    .eq('reward_type', 'standard_pro_week')
    .eq('status', 'active')
    .lte('benefit_starts_at', new Date().toISOString())
    .gt('benefit_ends_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (passResult.error) throw passResult.error;
  const birthdayProPass = !!passResult.data;
  const plan = (active && String(subscription && subscription.plan || '').toLowerCase() === 'pro') || birthdayProPass ? 'pro' : 'basic';
  const features = new Set(accountPlanFeatures[plan] || accountPlanFeatures.basic);
  if (!await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_READ)) features.delete('profit_tracking');
  if (!await hasPermission(auth, ACCOUNT_PERMISSION.PAYMENTS_READ)) {
    features.delete('stripe_payments');
    features.delete('payment_reminders');
  }
  if (!await hasPermission(auth, ACCOUNT_PERMISSION.INTEGRATIONS_MANAGE)) {
    features.delete('quickbooks');
    features.delete('bank_card_sync');
  }
  if (!await hasPermission(auth, ACCOUNT_PERMISSION.LABOR_READ)) features.delete('labor_tracker');
  return json({ data: { features: [...features] } });
}

async function existingQuote(admin: ReturnType<typeof serviceClient>, ownerUserId: string, quoteId: string) {
  const result = await admin
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('user_id', ownerUserId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function quoteIsClientFacing(row: Record<string, unknown> | null) {
  if (!row) return false;
  const status = String(row.status || '').trim().toLowerCase();
  if (status && status !== 'draft') return true;
  if (row.public_share_token_hash != null || row.share_token != null || row.portal_token != null) return true;
  const data = row.data && typeof row.data === 'object'
    ? row.data as Record<string, unknown>
    : {};
  const dataStatus = String(data.status || '').trim().toLowerCase();
  if (dataStatus && dataStatus !== 'draft') return true;
  return data.portal_visible === true
    || data.share_token != null
    || data.shareToken != null
    || data.portal_token != null
    || data.portalToken != null
    || data.portal_share_token != null
    || data.public_share_token_hash != null
    || data.safe_pdf_share != null;
}

async function saveQuote(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const requestedAction = body.operation === 'insert' ? 'insert' : 'update';
  const permission = requestedAction === 'insert'
    ? ACCOUNT_PERMISSION.QUOTES_CREATE
    : ACCOUNT_PERMISSION.QUOTES_UPDATE;
  const auth = await requireAccountPermission(req, accountId, permission);
  const fieldAccess = await loadAccountFieldAccess(auth);
  const admin = serviceClient();
  const submitted = body.values && typeof body.values === 'object'
    ? body.values as Record<string, unknown>
    : {};
  let quoteId = cleanText(body.quoteId || submitted.id, 80);
  let original = quoteId ? await existingQuote(admin, auth.ownerUserId, quoteId) : null;

  if (!original && requestedAction === 'insert' && submitted.quote_number && body.forceNew !== true) {
    const duplicate = await admin
      .from('quotes')
      .select('*')
      .eq('user_id', auth.ownerUserId)
      .eq('quote_number', submitted.quote_number)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (duplicate.error) throw duplicate.error;
    original = duplicate.data && duplicate.data[0] || null;
    quoteId = original && original.id || '';
    if (original) await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.QUOTES_UPDATE);
  }

  if (requestedAction === 'update' && !original) {
    throw new AccountAccessError('Quote not found', 404, 'not_found');
  }

  if (original && original.data && original.data.portal_visible === true) {
    throw new AccountAccessError('Remove this quote from the client portal before editing it.', 409, 'portal_locked');
  }
  const expectedUpdatedAt = cleanText(body.baseVersion, 80);
  if (original && expectedUpdatedAt && expectedUpdatedAt !== original.updated_at) {
    throw new AccountAccessError('This quote changed in another session. Reload before saving.', 409, 'stale_quote');
  }

  const canManagePricing = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_MANAGE);
  const canSendQuotes = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_SEND);
  if (!canSendQuotes && quoteIsClientFacing(original)) {
    throw new AccountAccessError('The account owner must return this document to an unshared draft before it can be edited.', 409, 'finalized_quote');
  }
  let values: Record<string, unknown>;
  if (canManagePricing) {
    const annotated = original ? await annotateQuoteReferences(auth.accountId, original) : {};
    values = pickAllowed(removeTeamDataReferences(
      mergeQuoteFieldAccess(annotated, submitted, { fieldAccess })
    ), quoteColumns);
  } else if (original) {
    const annotated = await annotateQuoteReferences(auth.accountId, original);
    try {
      values = pickAllowed(
        mergeRestrictedQuoteUpdate(annotated, { ...annotated, ...submitted }, { fieldAccess }),
        quoteColumns
      );
    } catch (error) {
      if ((error as { code?: string })?.code === 'stale_team_reference') {
        throw new AccountAccessError('This quote changed or your editing session expired. Reload before saving.', 409, 'stale_quote');
      }
      throw error;
    }
  } else {
    values = pickAllowed(removeTeamDataReferences(
      mergeQuoteFieldAccess({}, stripRestrictedWriteFields(submitted), { fieldAccess })
    ), quoteColumns);
    const profileResult = await admin
      .from('user_data')
      .select('value')
      .eq('user_id', auth.ownerUserId)
      .eq('key', 'business_profile')
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    if (profileResult.data && profileResult.data.value && values.data && typeof values.data === 'object') {
      const profile = stripRestrictedWriteFields(profileResult.data.value);
      values.data = {
        ...(values.data as Record<string, unknown>),
        businessProfile: profile,
        hiddenProfileFields: Array.isArray(profile.hidden_profile_fields) ? profile.hidden_profile_fields : []
      };
    }
  }
  if (!canSendQuotes) {
    values.status = original && original.status || 'draft';
    if (values.data && typeof values.data === 'object') {
      const originalData = original && original.data && typeof original.data === 'object'
        ? original.data as Record<string, unknown>
        : {};
      values.data = {
        ...(values.data as Record<string, unknown>),
        status: originalData.status || original && original.status || 'draft'
      };
    }
  }
  delete values.id;
  values.user_id = auth.ownerUserId;
  values.updated_by_user_id = auth.user.id;
  values.updated_at = new Date().toISOString();

  let result;
  if (original) {
    let updateQuery = admin
      .from('quotes')
      .update(values)
      .eq('id', quoteId)
      .eq('user_id', auth.ownerUserId);
    if (expectedUpdatedAt) updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
    result = await updateQuery.select('*').maybeSingle();
    if (!result.error && !result.data) {
      throw new AccountAccessError('This quote changed in another session. Reload before saving.', 409, 'stale_quote');
    }
  } else {
    values.created_by_user_id = auth.user.id;
    values.created_at = new Date().toISOString();
    result = await admin.from('quotes').insert(values).select('*').single();
  }
  if (result.error) throw result.error;
  const canReadPricing = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_READ);
  return json({ data: await quoteView(auth, result.data, canReadPricing, fieldAccess) });
}

async function deleteQuote(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.QUOTES_DELETE);
  const quoteId = cleanText(body.quoteId, 80);
  const result = await serviceClient()
    .from('quotes')
    .delete()
    .eq('id', quoteId)
    .eq('user_id', auth.ownerUserId)
    .select('id')
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AccountAccessError('Quote not found', 404, 'not_found');
  return json({ data: result.data });
}

async function listItems(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.ITEMS_READ);
  const result = await serviceClient()
    .from('items')
    .select('*')
    .eq('user_id', auth.ownerUserId)
    .order('updated_at', { ascending: false });
  if (result.error) throw result.error;
  const canReadPricing = await hasPermission(auth, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  return json({
    data: (result.data || []).map((row: Record<string, unknown>) => sanitizeSavedItemRow(row, {
      canReadPricing,
      fieldAccess
    }))
  });
}

async function listTemplates(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEMPLATES_READ);
  const result = await serviceClient()
    .from('templates')
    .select('*')
    .eq('user_id', auth.ownerUserId)
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  const canReadPricing = await hasPermission(auth, ACCOUNT_PERMISSION.QUOTES_PRICING_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  return json({
    data: (result.data || []).map((row: Record<string, unknown>) => sanitizeTemplateRow(row, {
      canReadPricing,
      fieldAccess
    }))
  });
}

async function listClients(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.CLIENTS_READ);
  const fieldAccess = await loadAccountFieldAccess(auth);
  const result = await serviceClient()
    .from('clients')
    .select('*')
    .eq('user_id', auth.ownerUserId)
    .order('name', { ascending: true });
  if (result.error) throw result.error;
  return json({
    data: (result.data || []).map((row: Record<string, unknown>) => sanitizeClientRow(row, { fieldAccess }))
  });
}

const clientColumns = new Set([
  'id', 'name', 'phone', 'email', 'address', 'city', 'province',
  'postal_code', 'notes', 'crm'
]);

async function saveClient(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.CLIENTS_MANAGE);
  const fieldAccess = await loadAccountFieldAccess(auth);
  const source = body.values && typeof body.values === 'object'
    ? body.values as Record<string, unknown>
    : {};
  const clientId = cleanText(body.clientId || source.id, 80);
  const admin = serviceClient();
  let existing: Record<string, unknown> | null = null;
  if (clientId) {
    const current = await admin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('user_id', auth.ownerUserId)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new AccountAccessError('Client not found', 404, 'not_found');
    existing = current.data;
  } else if (!accountFieldCanWrite(fieldAccess, ACCOUNT_FIELD.CLIENT_NAME)) {
    throw new AccountAccessError('This role cannot create client names.', 403, 'field_permission_denied');
  }
  const values = pickAllowed(
    mergeClientFieldAccess(existing || {}, source, { fieldAccess }),
    clientColumns
  );
  delete values.id;
  if (!clientId && !cleanText(values.name, 300)) {
    throw new AccountAccessError('Client name is required', 400, 'client_name_required');
  }
  values.user_id = auth.ownerUserId;
  values.updated_by_user_id = auth.user.id;
  values.updated_at = new Date().toISOString();
  let result;
  if (clientId) {
    result = await admin
      .from('clients')
      .update(values)
      .eq('id', clientId)
      .eq('user_id', auth.ownerUserId)
      .select('*')
      .single();
  } else {
    values.created_by_user_id = auth.user.id;
    result = await admin
      .from('clients')
      .upsert(values, { onConflict: 'user_id,name' })
      .select('*')
      .single();
  }
  if (result.error) throw result.error;
  return json({ data: sanitizeClientRow(result.data, { fieldAccess }) });
}

async function replaceClients(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.CLIENTS_MANAGE);
  const fieldAccess = await loadAccountFieldAccess(auth);
  if (!accountFieldCanWrite(fieldAccess, ACCOUNT_FIELD.CLIENT_NAME)) {
    throw new AccountAccessError(
      'Bulk client sync requires edit access to client names.',
      403,
      'field_permission_denied'
    );
  }
  const canDeleteClients = await hasPermission(auth, ACCOUNT_PERMISSION.CLIENTS_DELETE);
  const incoming = Array.isArray(body.values) ? body.values.slice(0, 2000) : [];
  const now = new Date().toISOString();
  const admin = serviceClient();
  const current = await admin
    .from('clients')
    .select('*')
    .eq('user_id', auth.ownerUserId);
  if (current.error) throw current.error;
  const currentById = new Map((current.data || []).map((row: Record<string, unknown>) => [String(row.id || ''), row]));
  const currentByName = new Map((current.data || []).map((row: Record<string, unknown>) => [String(row.name || ''), row]));
  const rows = incoming.map((source: Record<string, unknown>) => {
    const existing = currentById.get(String(source.id || ''))
      || currentByName.get(String(source.name || ''))
      || null;
    const values = pickAllowed(
      mergeClientFieldAccess(existing || {}, source, { fieldAccess }),
      clientColumns
    );
    delete values.id;
    values.user_id = auth.ownerUserId;
    values.created_by_user_id = existing && existing.created_by_user_id || auth.user.id;
    values.updated_by_user_id = auth.user.id;
    values.updated_at = now;
    return values;
  }).filter((row: Record<string, unknown>) => cleanText(row.name, 300).length > 0);
  let saved: Record<string, unknown>[] = [];
  if (rows.length > 0) {
    const upsert = await admin
      .from('clients')
      .upsert(rows, { onConflict: 'user_id,name' })
      .select('*');
    if (upsert.error) throw upsert.error;
    saved = upsert.data || [];
  }
  const keep = new Set(rows.map((row: Record<string, unknown>) => String(row.name || '')));
  const staleIds = (current.data || [])
    .filter((row: Record<string, unknown>) => keep.has(String(row.name || '')) === false)
    .map((row: Record<string, unknown>) => row.id);
  if (canDeleteClients && staleIds.length > 0) {
    const removed = await admin
      .from('clients')
      .delete()
      .eq('user_id', auth.ownerUserId)
      .in('id', staleIds);
    if (removed.error) throw removed.error;
  }
  return json({ data: saved.map((row) => sanitizeClientRow(row, { fieldAccess })) });
}

async function listRoles(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_READ);
  const result = await serviceClient()
    .from('account_roles')
    .select('id,account_id,role_key,name,description,is_system,is_assignable,archived_at,account_role_permissions(permission_key),account_role_fields(field_key,access_level)')
    .or('account_id.is.null,account_id.eq.' + auth.accountId)
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (result.error) throw result.error;
  return json({
    data: (result.data || []).map((role: Record<string, unknown>) => ({
      id: role.id,
      key: role.role_key,
      name: role.name,
      description: role.description,
      system: role.is_system === true,
      assignable: role.is_assignable === true,
      permissions: Array.isArray(role.account_role_permissions)
        ? role.account_role_permissions.map((entry: Record<string, unknown>) => entry.permission_key)
        : [],
      fields: Object.fromEntries(
        (Array.isArray(role.account_role_fields) ? role.account_role_fields : [])
          .map((entry: Record<string, unknown>) => [entry.field_key, entry.access_level])
          .filter((entry: unknown[]) => typeof entry[0] === 'string' && ['read', 'write'].includes(String(entry[1])))
      )
    }))
  });
}

async function requireRoleManagementOwner(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.ROLES_MANAGE);
  try {
    assertAccountRoleOwner(auth.user.id, auth.ownerUserId);
  } catch (error) {
    if (error instanceof AccountRolePolicyError) {
      throw new AccountAccessError(error.message, error.status, error.code);
    }
    throw error;
  }
  return auth;
}

async function getRoleCatalog(req: Request, accountId: unknown) {
  await requireRoleManagementOwner(req, accountId);
  const admin = serviceClient();
  const [permissions, dependencies, fields] = await Promise.all([
    admin
      .from('account_permissions')
      .select('permission_key,name,description,category,sensitive,assignable_to_custom,sort_order')
      .order('sort_order', { ascending: true }),
    admin
      .from('account_permission_dependencies')
      .select('permission_key,required_permission_key'),
    admin
      .from('account_fields')
      .select('field_key,name,description,category,sensitive,supports_write,read_permission_key,write_permission_key,sort_order')
      .order('sort_order', { ascending: true })
  ]);
  if (permissions.error) throw permissions.error;
  if (dependencies.error) throw dependencies.error;
  if (fields.error) throw fields.error;
  const requiredByPermission = new Map<string, string[]>();
  for (const dependency of dependencies.data || []) {
    const key = String(dependency.permission_key || '');
    const required = String(dependency.required_permission_key || '');
    if (!key || !required) continue;
    if (!requiredByPermission.has(key)) requiredByPermission.set(key, []);
    requiredByPermission.get(key)?.push(required);
  }
  return json({
    data: {
      permissions: (permissions.data || []).map((permission: Record<string, unknown>) => ({
        key: permission.permission_key,
        name: permission.name,
        description: permission.description,
        category: permission.category,
        sensitive: permission.sensitive === true,
        customRoleAllowed: permission.assignable_to_custom !== false,
        requires: requiredByPermission.get(String(permission.permission_key || '')) || []
      })),
      fields: (fields.data || []).map((field: Record<string, unknown>) => ({
        key: field.field_key,
        name: field.name,
        description: field.description,
        category: field.category,
        sensitive: field.sensitive === true,
        supportsWrite: field.supports_write === true,
        readPermission: field.read_permission_key,
        writePermission: field.write_permission_key
      }))
    }
  });
}

function roleRpcError(error: { code?: string; message?: string }) {
  const failure = accountRoleRpcFailure(error);
  return failure
    ? new AccountAccessError(failure.message, failure.status, failure.code)
    : null;
}

async function saveRole(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireRoleManagementOwner(req, accountId);
  let role;
  try {
    role = normalizeAccountRoleSave(body);
  } catch (error) {
    if (error instanceof AccountRolePolicyError) {
      throw new AccountAccessError(error.message, error.status, error.code);
    }
    throw error;
  }
  const { data, error } = await auth.userClient.rpc('quotedr_save_account_role', {
    p_account_id: auth.accountId,
    p_role_id: role.roleId,
    p_name: role.name,
    p_description: role.description,
    p_permission_keys: role.permissionKeys,
    p_field_access: role.fieldAccess
  });
  if (error) {
    const safeError = roleRpcError(error);
    if (safeError) throw safeError;
    throw error;
  }
  return json({ data: { id: data } });
}

async function archiveRole(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireRoleManagementOwner(req, accountId);
  const roleId = cleanText(body.roleId, 80);
  if (!roleId) throw new AccountAccessError('Role is required', 400, 'role_required');
  const { error } = await auth.userClient.rpc('quotedr_archive_account_role', {
    p_account_id: auth.accountId,
    p_role_id: roleId
  });
  if (error) {
    const safeError = roleRpcError(error);
    if (safeError) throw safeError;
    throw error;
  }
  return json({ data: { id: roleId, archived: true } });
}

async function listTeam(req: Request, accountId: unknown) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_READ);
  const admin = serviceClient();
  const membersResult = await admin
    .from('account_memberships')
    .select('id,user_id,status,created_at,account_roles(id,role_key,name)')
    .eq('account_id', auth.accountId)
    .order('created_at', { ascending: true });
  if (membersResult.error) throw membersResult.error;
  const members = [];
  for (const member of membersResult.data || []) {
    const userResult = await admin.auth.admin.getUserById(member.user_id);
    members.push({
      id: member.id,
      userId: member.user_id,
      email: userResult.data.user && userResult.data.user.email || '',
      status: member.status,
      createdAt: member.created_at,
      isOwner: member.user_id === auth.ownerUserId,
      role: member.account_roles
    });
  }
  const invitations = await admin
    .from('account_invitations')
    .select('id,email,role_id,expires_at,accepted_at,revoked_at,created_at')
    .eq('account_id', auth.accountId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (invitations.error) throw invitations.error;
  return json({ data: { members, invitations: invitations.data || [] } });
}

function randomInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return '\\x' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function invitationBaseUrl(value: unknown) {
  try {
    const requested = new URL(String(value || 'https://quotedr.io'));
    const production = requested.protocol === 'https:'
      && ['quotedr.io', 'www.quotedr.io'].includes(requested.hostname);
    const local = requested.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(requested.hostname);
    return production || local ? requested.origin : 'https://quotedr.io';
  } catch (_) {
    return 'https://quotedr.io';
  }
}

async function inviteMember(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_MANAGE);
  const email = cleanText(body.email, 320).toLowerCase();
  const roleId = cleanText(body.roleId, 80);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) === false) {
    throw new AccountAccessError('Enter a valid email address', 400, 'invalid_email');
  }
  const admin = serviceClient();
  const roleResult = await admin
    .from('account_roles')
    .select('id,name')
    .eq('id', roleId)
    .eq('is_assignable', true)
    .or('account_id.is.null,account_id.eq.' + auth.accountId)
    .maybeSingle();
  if (roleResult.error) throw roleResult.error;
  if (!roleResult.data) throw new AccountAccessError('Choose an assignable role', 400, 'invalid_role');

  const previousInvitations = await admin
    .from('account_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', auth.accountId)
    .eq('normalized_email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);
  if (previousInvitations.error) throw previousInvitations.error;

  const token = randomInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const inserted = await admin
    .from('account_invitations')
    .insert({
      account_id: auth.accountId,
      email,
      role_id: roleId,
      token_hash: await tokenHash(token),
      expires_at: expiresAt,
      invited_by_user_id: auth.user.id
    })
    .select('id,email,role_id,expires_at,created_at')
    .single();
  if (inserted.error) throw inserted.error;

  const inviteUrl = invitationBaseUrl(body.appOrigin)
    + '/team-invite.html?token=' + encodeURIComponent(token);
  const delivery = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: { quotedr_team_invite: true, quotedr_invitation_id: inserted.data.id }
  });
  if (delivery.error) {
    console.warn('team invitation email not sent', {
      accountId: auth.accountId,
      invitationId: inserted.data.id,
      reason: delivery.error.code || 'delivery_failed'
    });
  }
  await admin.from('account_audit_events').insert({
    account_id: auth.accountId,
    actor_user_id: auth.user.id,
    event_type: 'team.invitation.created',
    target_type: 'invitation',
    target_id: inserted.data.id,
    details: { roleId }
  });
  return json({
    data: {
      invitation: inserted.data,
      role: roleResult.data,
      inviteUrl,
      emailDelivery: delivery.error ? 'copy_link' : 'sent'
    }
  }, 201);
}

async function revokeInvitation(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_MANAGE);
  const invitationId = cleanText(body.invitationId, 80);
  const admin = serviceClient();
  const result = await admin
    .from('account_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('account_id', auth.accountId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AccountAccessError('Invitation not found', 404, 'not_found');
  await admin.from('account_audit_events').insert({
    account_id: auth.accountId,
    actor_user_id: auth.user.id,
    event_type: 'team.invitation.revoked',
    target_type: 'invitation',
    target_id: invitationId
  });
  return json({ data: result.data });
}

async function updateMember(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_MANAGE);
  const memberId = cleanText(body.memberId, 80);
  const roleId = cleanText(body.roleId, 80);
  const status = body.status === 'suspended' ? 'suspended' : 'active';
  const admin = serviceClient();
  const current = await admin
    .from('account_memberships')
    .select('id,user_id,role_id,status')
    .eq('id', memberId)
    .eq('account_id', auth.accountId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new AccountAccessError('Team member not found', 404, 'not_found');
  if (current.data.user_id === auth.ownerUserId) {
    throw new AccountAccessError('The account owner cannot be suspended or reassigned', 409, 'owner_protected');
  }
  const role = await admin
    .from('account_roles')
    .select('id')
    .eq('id', roleId)
    .eq('is_assignable', true)
    .or('account_id.is.null,account_id.eq.' + auth.accountId)
    .maybeSingle();
  if (role.error) throw role.error;
  if (!role.data) throw new AccountAccessError('Choose an assignable role', 400, 'invalid_role');
  const result = await admin
    .from('account_memberships')
    .update({ role_id: roleId, status, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('account_id', auth.accountId)
    .select('id,user_id,role_id,status,updated_at')
    .single();
  if (result.error) throw result.error;
  await admin.from('account_audit_events').insert({
    account_id: auth.accountId,
    actor_user_id: auth.user.id,
    event_type: 'team.membership.updated',
    target_type: 'membership',
    target_id: memberId,
    details: { roleId, status }
  });
  return json({ data: result.data });
}

async function removeMember(req: Request, accountId: unknown, body: Record<string, unknown>) {
  const auth = await requireAccountPermission(req, accountId, ACCOUNT_PERMISSION.TEAM_MANAGE);
  const memberId = cleanText(body.memberId, 80);
  const admin = serviceClient();
  const current = await admin
    .from('account_memberships')
    .select('id,user_id')
    .eq('id', memberId)
    .eq('account_id', auth.accountId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new AccountAccessError('Team member not found', 404, 'not_found');
  if (current.data.user_id === auth.ownerUserId) {
    throw new AccountAccessError('The account owner cannot be removed', 409, 'owner_protected');
  }
  const result = await admin
    .from('account_memberships')
    .delete()
    .eq('id', memberId)
    .eq('account_id', auth.accountId)
    .select('id')
    .single();
  if (result.error) throw result.error;
  await admin.from('account_audit_events').insert({
    account_id: auth.accountId,
    actor_user_id: auth.user.id,
    event_type: 'team.membership.removed',
    target_type: 'membership',
    target_id: memberId,
    details: { removedUserId: current.data.user_id }
  });
  return json({ data: result.data });
}

async function acceptInvitation(req: Request, body: Record<string, unknown>) {
  const token = cleanText(body.token, 500);
  const { client } = await authenticatedClient(req);
  const result = await client.rpc('quotedr_accept_team_invitation', { p_token: token });
  if (result.error) {
    throw new AccountAccessError('This invitation is invalid, expired, or belongs to another email.', 400, 'invalid_invitation');
  }
  const context = await loadAccountContext(req);
  return json({ data: result.data, accounts: context.accounts });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 80);
    const accountId = body.accountId;
    if (action === 'context') {
      const context = await loadAccountContext(req);
      return json({
        data: {
          user: { id: context.user.id, email: context.user.email || '' },
          accounts: context.accounts
        }
      });
    }
    if (action === 'invitation.accept') return await acceptInvitation(req, body);
    if (action === 'roles.list') return await listRoles(req, accountId);
    if (action === 'roles.catalog') return await getRoleCatalog(req, accountId);
    if (action === 'roles.save') return await saveRole(req, accountId, body);
    if (action === 'roles.archive') return await archiveRole(req, accountId, body);
    if (action === 'team.list') return await listTeam(req, accountId);
    if (action === 'team.invite') return await inviteMember(req, accountId, body);
    if (action === 'team.invitation.revoke') return await revokeInvitation(req, accountId, body);
    if (action === 'team.member.update') return await updateMember(req, accountId, body);
    if (action === 'team.member.remove') return await removeMember(req, accountId, body);
    if (action === 'business.get') return await getBusiness(req, accountId);
    if (action === 'business.logo') return await getLogo(req, accountId);
    if (action === 'numbering.get') return await getDocumentNumberingSettings(req, accountId);
    if (action === 'numbering.save') return await saveDocumentNumberingSettings(req, accountId, body);
    if (action === 'numbering.client') return await ensureNumberingClient(req, accountId, body);
    if (action === 'numbering.reserve') return await reserveDocumentNumber(req, accountId, body);
    if (action === 'payments.get') return await getPaymentSettings(req, accountId);
    if (action === 'entitlements.get') return await getEntitlements(req, accountId);
    if (action === 'accounting.export') return await accountingExport(req, accountId, body);
    if (action === 'accounting.qbo_invoice_profile') return await qboInvoiceProfile(req, accountId, body);
    if (action === 'accounting.qbo_invoice_export') return await qboInvoiceExport(req, accountId, body);
    if (action === 'quotes.list') return await listQuotes(req, accountId, body);
    if (action === 'quotes.get') return await getQuote(req, accountId, body);
    if (action === 'quotes.save') return await saveQuote(req, accountId, body);
    if (action === 'quotes.delete') return await deleteQuote(req, accountId, body);
    if (action === 'items.list') return await listItems(req, accountId);
    if (action === 'clients.list') return await listClients(req, accountId);
    if (action === 'clients.save') return await saveClient(req, accountId, body);
    if (action === 'clients.replace') return await replaceClients(req, accountId, body);
    if (action === 'templates.list') return await listTemplates(req, accountId);
    return json({ error: 'Unknown account action', code: 'unknown_action' }, 400);
  } catch (error) {
    return accountError(error);
  }
});
