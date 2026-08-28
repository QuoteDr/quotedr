import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  calculateRecordedPaymentState,
  canonicalDocumentTotalCents,
  legacyUnlinkedPaidCents,
} from "../_shared/document-payment-accounting.mjs";
import {
  PAYMENT_EVIDENCE_BUCKET,
  PAYMENT_EVIDENCE_NOTICE_VERSION,
  PAYMENT_EVIDENCE_SIGNED_URL_SECONDS,
  paymentEvidenceByteSize,
  paymentEvidenceContentMatches,
  paymentEvidenceExtension,
  paymentEvidenceFilename,
  paymentEvidenceMimeType,
  safePaymentEvidence,
} from "../_shared/payment-evidence-policy.mjs";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  requireAccountPermissionWithDefault,
} from "../_shared/account-authorization.ts";
import { isProductionClientPortalUrl } from "../_shared/client-portal-url.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QuoteRow = {
  id: string;
  user_id: string;
  quote_number?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  status?: string | null;
  type?: string | null;
  total?: number | string | null;
  grand_total?: number | string | null;
  data?: Record<string, any> | null;
  public_share_token_hash?: string | null;
  parent_quote_id?: string | null;
  change_order_number?: number | null;
};

class PaymentError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "payment_request_invalid") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function supportId() {
  return crypto.randomUUID().split("-")[0].toUpperCase();
}

function normalizeId(value: unknown) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function cleanText(value: unknown, max = 300) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rowData(row: QuoteRow) {
  return row.data && typeof row.data === "object" ? row.data : {};
}

function quoteEmail(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_client_email || data.clientEmail || data.email || data.client_email || row.client_email || "").trim().toLowerCase();
}

function quoteName(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_client_name || row.client_name || data.clientName || data.client_name || "").trim().toLowerCase();
}

function portalId(row: QuoteRow) {
  return String(rowData(row).portal_id || "").trim();
}

function portalVisible(row: QuoteRow) {
  return rowData(row).portal_visible === true;
}

function portalAnchorAvailable(row: QuoteRow) {
  return portalVisible(row) || (rowData(row).portal_anchor_only === true && !!portalId(row));
}

function samePortalGroup(anchor: QuoteRow, target: QuoteRow) {
  if (!anchor || !target || anchor.user_id !== target.user_id) return false;
  const anchorPortalId = portalId(anchor);
  if (anchorPortalId) return portalId(target) === anchorPortalId || target.id === anchor.id;
  const anchorEmail = quoteEmail(anchor);
  const anchorName = quoteName(anchor);
  const targetEmail = quoteEmail(target);
  const targetName = quoteName(target);
  if (anchorEmail) return targetEmail === anchorEmail || targetName === anchorEmail;
  if (anchorName) return targetName === anchorName;
  return target.id === anchor.id;
}

function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new PaymentError("Payments are temporarily unavailable", 503, "service_unavailable");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function fetchQuote(admin: any, documentId: string) {
  const { data, error } = await admin.from("quotes").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  return data as QuoteRow | null;
}

async function assertDocumentAccess(admin: any, body: Record<string, any>) {
  const documentId = normalizeId(body.documentId || body.quoteId || body.invoiceId || body.id);
  const token = String(body.token || "").trim();
  const portalAnchorId = normalizeId(body.portalAnchorId || body.portal_anchor);
  if (!documentId || !token) throw new PaymentError("This payment link is incomplete. Ask the contractor to resend it.", 401, "secure_token_required");

  const target = await fetchQuote(admin, documentId);
  if (!target) throw new PaymentError("Document not found", 404, "document_not_found");
  const tokenHash = await sha256Hex(token);
  if (portalVisible(target) && target.public_share_token_hash === tokenHash) return { target, token, portalAnchorId };

  if (portalAnchorId && portalAnchorId !== documentId) {
    const anchor = await fetchQuote(admin, portalAnchorId);
    if (
      anchor &&
      portalAnchorAvailable(anchor) &&
      anchor.public_share_token_hash === tokenHash &&
      samePortalGroup(anchor, target) &&
      (target.id === anchor.id || portalVisible(target))
    ) return { target, token, portalAnchorId };
  }
  throw new PaymentError("This secure payment link is invalid or expired.", 401, "secure_token_invalid");
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ") || !SUPABASE_ANON_KEY) return null;
  const token = authorization.slice(7).trim();
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function paymentSettings(admin: any, userId: string) {
  const [{ data: settingsRow }, { data: connectionRow }] = await Promise.all([
    admin.from("user_data").select("value").eq("user_id", userId).eq("key", "payment_settings").maybeSingle(),
    admin.from("stripe_connected_accounts").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  return { settings: settingsRow?.value || {}, connection: connectionRow || null };
}

function cardPaymentEnabledForDocument(row: QuoteRow, settings: Record<string, any>) {
  if (settings.stripe_enabled !== true) return false;
  const data = rowData(row);
  const decision = data.card_payment || data.cardPayment;
  if (
    decision &&
    typeof decision === "object" &&
    Number(decision.version || 0) >= 1 &&
    typeof decision.enabled === "boolean"
  ) return decision.enabled === true;
  // Documents shared before Card Payment Rules keep the prior account-wide behavior.
  return true;
}

function isInvoice(row: QuoteRow) {
  const data = rowData(row);
  const type = String(row.type || data.documentType || data.type || "").toLowerCase();
  return type.includes("invoice") || ["invoiced", "paid", "voided"].includes(String(row.status || "").toLowerCase());
}

function isChangeOrder(row: QuoteRow) {
  const data = rowData(row);
  const type = String(row.type || data.documentType || data.type || "").toLowerCase();
  return type === "change_order" || type === "change order";
}

function changeOrderParentId(row: QuoteRow) {
  const data = rowData(row);
  return normalizeId(row.parent_quote_id || data.parentQuoteId || data.parent_quote_id);
}

function changeOrderContinuePayment(row: QuoteRow) {
  const data = rowData(row);
  const raw = data.changeOrderContinuePayment || data.change_order_continue_payment;
  if (!raw || typeof raw !== "object" || Number(raw.version || 0) < 1) {
    return { version: 1, required: false, amountCents: 0 };
  }
  const amountCents = Math.max(0, Math.round(Number(raw.amount_cents || raw.amountCents || 0)));
  return { version: 1, required: raw.required === true && amountCents > 0, amountCents };
}

function rowSequence(row: QuoteRow) {
  const data = rowData(row);
  return Number(row.change_order_number ?? data.changeOrderNumber ?? data.change_order_number ?? 0) || 0;
}

async function changeOrderProjectPaymentContext(admin: any, row: QuoteRow) {
  const parentId = changeOrderParentId(row);
  if (!parentId) {
    return { updatedProjectTotalCents: documentTotalCents(row), projectPaidCents: 0, projectBalanceDueCents: documentTotalCents(row) };
  }
  const [parentResult, siblingResult] = await Promise.all([
    admin.from("quotes").select("*").eq("id", parentId).eq("user_id", row.user_id).maybeSingle(),
    admin.from("quotes").select("*").eq("parent_quote_id", parentId).eq("user_id", row.user_id),
  ]);
  if (parentResult.error) throw parentResult.error;
  if (siblingResult.error) throw siblingResult.error;
  const parent = parentResult.data as QuoteRow | null;
  const siblings = (siblingResult.data as QuoteRow[] || []).filter(isChangeOrder);
  const currentSequence = rowSequence(row) || Number.MAX_SAFE_INTEGER;
  const previousApproved = siblings.filter((candidate) => candidate.id !== row.id
    && String(candidate.status || rowData(candidate).status || "").toLowerCase() === "approved"
    && rowSequence(candidate) < currentSequence);
  const updatedProjectTotalCents = documentTotalCents(parent || row)
    + previousApproved.reduce((sum, candidate) => sum + documentTotalCents(candidate), 0)
    + documentTotalCents(row);
  const projectRows = [parent, ...siblings].filter(Boolean) as QuoteRow[];
  const projectIds = projectRows.map((candidate) => candidate.id);
  let projectPaidCents = projectRows.reduce((sum, candidate) => sum + legacyUnlinkedPaidCents(candidate), 0);
  if (projectIds.length) {
    const { data: records, error } = await admin
      .from("payment_records")
      .select("amount_cents")
      .in("quote_id", projectIds)
      .in("status", ["paid", "confirmed"]);
    if (error) throw error;
    projectPaidCents += (records || []).reduce((sum, record) => sum + Math.max(0, Math.round(Number(record.amount_cents || 0))), 0);
  }
  return {
    updatedProjectTotalCents,
    projectPaidCents,
    projectBalanceDueCents: Math.max(0, updatedProjectTotalCents - projectPaidCents),
  };
}

function isInvalid(row: QuoteRow) {
  const data = rowData(row);
  const status = String(row.status || data.status || "").toLowerCase();
  const validity = String(data.document_validity || data.documentValidity || "").toLowerCase();
  return status === "voided" || ["voided", "invalid", "superseded"].includes(validity);
}

function isAccepted(row: QuoteRow) {
  const data = rowData(row);
  const status = String(row.status || data.status || "").toLowerCase();
  return ["accepted", "approved", "invoiced", "paid"].includes(status) || !!(data.signed_at || data.approved_at || data.accepted_at);
}

function documentTotalCents(row: QuoteRow) {
  return canonicalDocumentTotalCents(row);
}

function currencyFor(row: QuoteRow) {
  const value = String(rowData(row).currency || "CAD").toLowerCase();
  return ["cad", "usd", "eur", "gbp", "aud", "nzd"].includes(value) ? value : "cad";
}

function resolveDepositTerms(row: QuoteRow, settings: Record<string, any>) {
  const data = rowData(row);
  const explicit = data.payment_terms || data.paymentTerms;
  if (explicit && typeof explicit === "object" && Number(explicit.version || 0) >= 2) {
    const required = explicit.deposit_required !== false && explicit.kind !== "none";
    const explicitFixedCents = Math.max(0, Math.round(Number(explicit.fixed_cents || 0)));
    const kind = explicit.kind === "fixed" && explicitFixedCents > 0 ? "fixed" : (required ? "percent" : "none");
    return {
      version: 2,
      deposit_required: required,
      kind,
      percent: kind === "percent" ? Math.min(100, Math.max(1, Number(explicit.percent || 50))) : null,
      fixed_cents: kind === "fixed" ? explicitFixedCents : null,
      due: "after_acceptance",
      source: "document",
    };
  }

  const style = data.style || {};
  const mode = String(style.depositMode || "auto");
  if (mode === "hide" || settings.accept_deposit === false) {
    return { version: 2, deposit_required: false, kind: "none", percent: null, fixed_cents: null, due: "after_acceptance", source: mode === "hide" ? "legacy_document" : "account" };
  }
  const requestedKind = mode === "show" ? (style.depositKind === "fixed" ? "fixed" : "percent") : (settings.deposit_default_kind === "fixed" ? "fixed" : "percent");
  const percent = Math.min(100, Math.max(1, Number(mode === "show" ? style.depositPercent : settings.deposit_default_pct) || 50));
  const fixedCents = Math.max(0, Math.round(Number(mode === "show" ? style.depositFixedCents : settings.deposit_default_fixed_cents) || 0));
  const kind = requestedKind === "fixed" && fixedCents > 0 ? "fixed" : "percent";
  return {
    version: 2,
    deposit_required: true,
    kind,
    percent: kind === "percent" ? percent : null,
    fixed_cents: kind === "fixed" ? fixedCents : null,
    due: "after_acceptance",
    source: mode === "show" ? "legacy_document" : "account",
  };
}

function depositAmountCents(totalCents: number, terms: any) {
  if (!terms.deposit_required || totalCents <= 0) return 0;
  if (terms.kind === "fixed") return Math.min(totalCents, Math.max(1, Number(terms.fixed_cents || 0)));
  return Math.min(totalCents, Math.max(1, Math.round(totalCents * Number(terms.percent || 50) / 100)));
}

function paymentType(body: Record<string, any>, row: QuoteRow) {
  const raw = String(body.paymentType || body.purpose || "").toLowerCase();
  if (isChangeOrder(row)) return "change_order_continue";
  if (raw === "invoice_full") return "invoice_full";
  if (raw === "invoice_deposit") return "invoice_deposit";
  if (isInvoice(row) && raw === "deposit") return "invoice_deposit";
  return "deposit";
}

function manualMethodAllowed(settings: Record<string, any>, method: string) {
  if (method === "etransfer") return settings.accept_etransfer !== false;
  if (method === "cheque") return settings.accept_cheque !== false;
  if (method === "cash") return settings.accept_cash !== false;
  return false;
}

async function recordsForDocument(admin: any, documentId: string) {
  const { data, error } = await admin
    .from("payment_records")
    .select("*")
    .or(`quote_id.eq.${documentId},invoice_id.eq.${documentId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function evidenceForDocument(admin: any, documentId: string) {
  const { data, error } = await admin
    .from("payment_evidence")
    .select("*")
    .or(`quote_id.eq.${documentId},invoice_id.eq.${documentId}`)
    .eq("upload_status", "ready")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function documentPaymentState(admin: any, row: QuoteRow, settings: Record<string, any>) {
  const [records, evidence] = await Promise.all([
    recordsForDocument(admin, row.id),
    evidenceForDocument(admin, row.id),
  ]);
  const terms = resolveDepositTerms(row, settings);
  if (isChangeOrder(row)) {
    const required = changeOrderContinuePayment(row);
    const secured = records.filter((record: any) => ["paid", "confirmed"].includes(record?.status));
    const paidCents = secured.reduce((sum: number, record: any) => sum + Math.max(0, Math.round(Number(record.amount_cents || 0))), 0)
      + legacyUnlinkedPaidCents(row);
    const project = await changeOrderProjectPaymentContext(admin, row);
    const maximumRequirementCents = project.projectBalanceDueCents + paidCents;
    const continueWorkRequiredCents = required.required ? Math.min(required.amountCents, maximumRequirementCents) : 0;
    const continueWorkDueCents = Math.max(0, continueWorkRequiredCents - paidCents);
    const reported = records.find((record: any) => record.status === "client_reported");
    const evidencePaymentRecord = records.find((record: any) => record.provider === "manual" && ["client_reported", "confirmed"].includes(record.status));
    return {
      records,
      totalCents: documentTotalCents(row),
      paidCents,
      balanceDueCents: Math.max(0, documentTotalCents(row) - paidCents),
      terms: { version: 2, deposit_required: false, kind: "none", percent: null, fixed_cents: null, due: "after_acceptance", source: "change_order" },
      requiredDepositCents: 0,
      depositDueCents: 0,
      depositSecured: false,
      depositShortfallAccepted: false,
      acceptedDepositCents: 0,
      continueWorkRequiredCents,
      continueWorkDueCents,
      continueWorkSecured: continueWorkRequiredCents > 0 && continueWorkDueCents === 0,
      paymentMode: "change_order_continue",
      fullPaid: project.updatedProjectTotalCents > 0 && project.projectPaidCents >= project.updatedProjectTotalCents,
      ...project,
      evidence,
      evidencePaymentRecordId: evidencePaymentRecord?.id || null,
      reported: reported ? {
        id: reported.id,
        method: reported.method,
        amountCents: reported.amount_cents,
        reportedAt: reported.reported_at || reported.created_at,
        status: reported.status,
      } : null,
    };
  }
  const requestedDepositCents = depositAmountCents(documentTotalCents(row), terms);
  const paymentState = calculateRecordedPaymentState(row, records, requestedDepositCents);
  const {
    secured,
    totalCents,
    paidCents,
    balanceDueCents,
    requiredDepositCents,
    depositDueCents,
    depositSecured,
    depositShortfallAccepted,
    acceptedDepositCents,
    fullPaid,
  } = paymentState;
  const reported = records.find((record: any) => record.status === "client_reported");
  const evidencePaymentRecord = records.find((record: any) => record.provider === "manual" && ["client_reported", "confirmed"].includes(record.status));
  return {
    records,
    totalCents,
    paidCents,
    balanceDueCents,
    terms,
    requiredDepositCents,
    depositDueCents,
    depositSecured,
    depositShortfallAccepted,
    acceptedDepositCents,
    fullPaid,
    evidence,
    evidencePaymentRecordId: evidencePaymentRecord?.id || null,
    reported: reported ? {
      id: reported.id,
      method: reported.method,
      amountCents: reported.amount_cents,
      reportedAt: reported.reported_at || reported.created_at,
      status: reported.status,
    } : null,
  };
}

function publicStatus(row: QuoteRow, state: any) {
  let status = "unpaid";
  if (state.fullPaid) status = "paid";
  else if (state.continueWorkSecured) status = "secured";
  else if (state.depositSecured) status = "secured";
  else if (state.reported) status = "client_reported";
  else if (state.paidCents > 0) status = "partially_paid";
  return {
    documentId: row.id,
    status,
    accepted: isAccepted(row),
    totalCents: state.totalCents,
    paidCents: state.paidCents,
    balanceDueCents: state.balanceDueCents,
    requiredDepositCents: state.requiredDepositCents,
    depositDueCents: state.depositDueCents,
    depositSecured: state.depositSecured,
    depositShortfallAccepted: state.depositShortfallAccepted,
    acceptedDepositCents: state.acceptedDepositCents,
    fullPaid: state.fullPaid,
    paymentMode: state.paymentMode || "deposit",
    continueWorkRequiredCents: Math.max(0, Math.round(Number(state.continueWorkRequiredCents || 0))),
    continueWorkDueCents: Math.max(0, Math.round(Number(state.continueWorkDueCents || 0))),
    continueWorkSecured: state.continueWorkSecured === true,
    updatedProjectTotalCents: Math.max(0, Math.round(Number(state.updatedProjectTotalCents || 0))),
    projectPaidCents: Math.max(0, Math.round(Number(state.projectPaidCents || 0))),
    projectBalanceDueCents: Math.max(0, Math.round(Number(state.projectBalanceDueCents || 0))),
    report: state.reported,
    evidencePaymentRecordId: state.evidencePaymentRecordId,
    evidence: (state.evidence || [])
      .filter((record: any) => record.portal_visible === true)
      .map(safePaymentEvidence),
  };
}

function dueAmount(paymentTypeValue: string, state: any) {
  if (paymentTypeValue === "invoice_full") return state.balanceDueCents;
  if (paymentTypeValue === "change_order_continue") return state.continueWorkDueCents;
  return state.depositDueCents;
}

function paymentUsesQuoteId(type: string) {
  return ["deposit", "change_order_continue"].includes(type);
}

function paymentDescription(type: string, row: QuoteRow) {
  if (type === "change_order_continue") return `Payment to continue work - ${row.quote_number || "change order"}`;
  if (type === "invoice_full") return `Invoice ${row.quote_number || row.id}`;
  return `Deposit for quote ${row.quote_number || row.id}`;
}

function assertPayable(row: QuoteRow, paymentTypeValue: string, state: any) {
  if (isInvalid(row)) throw new PaymentError("This document is no longer valid and cannot accept payment.", 409, "document_invalid");
  if (paymentTypeValue === "invoice_full" && !isInvoice(row)) throw new PaymentError("Full payment is only available for invoices.", 409, "invoice_required");
  if (isChangeOrder(row) && paymentTypeValue !== "change_order_continue") throw new PaymentError("This change order does not accept quote deposits.", 409, "change_order_payment_type_required");
  if (paymentTypeValue === "change_order_continue" && state.continueWorkRequiredCents <= 0) throw new PaymentError("This change order does not require a payment to continue work.", 409, "change_order_payment_not_required");
  if (!["invoice_full", "change_order_continue"].includes(paymentTypeValue) && !state.terms.deposit_required) throw new PaymentError("This document does not require a deposit.", 409, "deposit_not_required");
  if (!isAccepted(row) && paymentTypeValue !== "invoice_full") throw new PaymentError(paymentTypeValue === "change_order_continue" ? "Approve and sign the change order before sending this payment." : "Accept and sign the quote before sending the deposit.", 409, "quote_acceptance_required");
  if (paymentTypeValue === "invoice_full" && !["invoiced", "paid"].includes(String(row.status || "").toLowerCase())) {
    throw new PaymentError("This invoice is not ready for payment.", 409, "invoice_not_payable");
  }
  if (dueAmount(paymentTypeValue, state) <= 0) throw new PaymentError("This payment has already been secured.", 409, "payment_already_secured");
}

function safeReturnUrl(value: unknown, row: QuoteRow, token: string, portalAnchorId: string) {
  try {
    const url = new URL(String(value || ""));
    const production = isProductionClientPortalUrl(url);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (!production && !local) throw new Error("host");
    const allowedPaths = isInvoice(row)
      ? ["/invoice-viewer.html", "/invoice-viewer"]
      : ["/interactive-quote-viewer.html", "/interactive-quote-viewer"];
    if (!allowedPaths.includes(url.pathname)) throw new Error("path");
    if (url.searchParams.get("id") !== row.id || url.searchParams.get("token") !== token) throw new Error("document");
    if (portalAnchorId && url.searchParams.get("portal_anchor") !== portalAnchorId) throw new Error("portal");
    url.searchParams.delete("payment");
    url.searchParams.delete("session_id");
    url.hash = "";
    return url;
  } catch (_) {
    throw new PaymentError("The payment return link is invalid. Refresh the document and try again.", 400, "return_url_invalid");
  }
}

function idempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{16,200}$/.test(key)) throw new PaymentError("The payment request expired. Refresh and try again.", 400, "idempotency_key_invalid");
  return key;
}

async function updateQuotePaymentState(admin: any, row: QuoteRow, record: any, paidAt: string, options: Record<string, any> = {}) {
  const originalData = rowData(row);
  const data = options.clearDepositShortfallAcceptance === true ? {
    ...originalData,
    deposit_shortfall_accepted: false,
    deposit_shortfall_accepted_at: null,
    deposit_shortfall_accepted_paid_cents: 0,
    deposit_shortfall_required_cents: 0,
    deposit_shortfall_accepted_by: null,
  } : originalData;
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const paymentEntry = {
    payment_record_id: record.id,
    type: record.payment_type,
    provider: record.provider,
    method: record.method,
    amount_cents: Number(record.amount_cents || 0),
    currency: record.currency || "cad",
    stripe_checkout_session_id: record.stripe_checkout_session_id || "",
    stripe_payment_intent_id: record.stripe_payment_intent_id || "",
    paid_at: paidAt,
  };
  const existingPaymentIndex = payments.findIndex((payment: any) => payment.payment_record_id === record.id || (record.stripe_checkout_session_id && payment.stripe_checkout_session_id === record.stripe_checkout_session_id));
  const nextPayments = payments.slice();
  if (existingPaymentIndex >= 0) nextPayments[existingPaymentIndex] = paymentEntry;
  else nextPayments.push(paymentEntry);

  const { settings } = await paymentSettings(admin, row.user_id);
  const state = await documentPaymentState(admin, { ...row, data }, settings);
  const nextReceived = state.paidCents / 100;
  const changeOrderPayment = isChangeOrder(row);
  const nextData: Record<string, any> = {
    ...data,
    paymentStatus: changeOrderPayment
      ? (state.continueWorkSecured ? "paid" : (state.paidCents > 0 ? "partially_paid" : "unpaid"))
      : (state.fullPaid ? "paid" : (state.paidCents > 0 ? "partially_paid" : "unpaid")),
    accepted_total_cents: state.totalCents,
    balance_due_cents: state.balanceDueCents,
    lastPaymentAt: paidAt,
    manual_payment_reported: false,
    paymentsReceived: {
      name: record.payment_type === "change_order_continue"
        ? "Change-order payment received"
        : (["deposit", "invoice_deposit"].includes(record.payment_type) ? "Deposit paid" : "Payment received"),
      amount: Math.round(nextReceived * 100) / 100,
    },
    payments: nextPayments,
  };
  if (changeOrderPayment) {
    nextData.deposit_paid = false;
    nextData.deposit_paid_at = null;
    nextData.deposit_due_cents = 0;
    nextData.change_order_payment_paid_cents = state.paidCents;
    nextData.change_order_payment_due_cents = state.continueWorkDueCents;
    nextData.change_order_payment_satisfied = state.continueWorkSecured === true;
  } else if (!state.depositShortfallAccepted) {
    nextData.deposit_paid = state.depositSecured;
    nextData.deposit_paid_at = state.depositSecured ? (data.deposit_paid_at || paidAt) : null;
    nextData.deposit_due_cents = state.depositDueCents;
    nextData.deposit_shortfall_accepted = false;
    nextData.deposit_shortfall_accepted_at = null;
    nextData.deposit_shortfall_accepted_paid_cents = 0;
    nextData.deposit_shortfall_required_cents = 0;
    nextData.deposit_shortfall_accepted_by = null;
  } else {
    nextData.deposit_paid = state.depositSecured;
    nextData.deposit_paid_at = state.depositSecured ? (data.deposit_paid_at || paidAt) : null;
    nextData.deposit_due_cents = state.depositDueCents;
    nextData.deposit_shortfall_accepted_paid_cents = state.paidCents;
    nextData.deposit_shortfall_required_cents = state.requiredDepositCents;
  }
  const update: Record<string, any> = { data: nextData, updated_at: paidAt };
  if (state.fullPaid && !changeOrderPayment) update.status = "paid";
  else if (isInvoice(row) && String(row.status || "").toLowerCase() === "paid") update.status = "invoiced";
  const { error } = await admin.from("quotes").update(update).eq("id", row.id).eq("user_id", row.user_id);
  if (error) throw error;
  return state;
}

async function stripeSession(path: string, accountId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${STRIPE_SECRET_KEY}`);
  headers.set("Stripe-Account", accountId);
  const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Stripe request failed");
    (error as Error & { stripeCode?: string }).stripeCode = payload?.error?.code || "stripe_request_failed";
    throw error;
  }
  return payload;
}

async function createCheckout(admin: any, body: Record<string, any>, row: QuoteRow, token: string, portalAnchorId: string, settings: any, connection: any, state: any) {
  const type = paymentType(body, row);
  assertPayable(row, type, state);
  if (!cardPaymentEnabledForDocument(row, settings) || (settings.accept_full_payment === false && type === "invoice_full")) {
    throw new PaymentError("Card payment is not enabled for this document. Choose a manual payment method instead.", 403, "card_payment_disabled");
  }
  if (!connection || connection.status !== "ready" || connection.charges_enabled !== true) {
    throw new PaymentError("Card payment is temporarily unavailable. Choose e-transfer, cheque, or cash below.", 409, "stripe_account_not_ready");
  }
  if (!STRIPE_SECRET_KEY) throw new PaymentError("Card payment is temporarily unavailable.", 503, "stripe_not_configured");

  const amountCents = dueAmount(type, state);
  if (amountCents < 50) throw new PaymentError("Card payments must be at least $0.50. Choose a manual payment method instead.", 409, "stripe_minimum_not_met");
  const key = idempotencyKey(body.idempotencyKey);
  const returnUrl = safeReturnUrl(body.returnUrl, row, token, portalAnchorId);

  const existing = await admin.from("payment_records").select("*").eq("idempotency_key", key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.user_id !== row.user_id || existing.data.quote_id !== (paymentUsesQuoteId(type) ? row.id : null) || existing.data.invoice_id !== (paymentUsesQuoteId(type) ? null : row.id) || existing.data.amount_cents !== amountCents) {
      throw new PaymentError("This payment request conflicts with an earlier attempt. Refresh and try again.", 409, "idempotency_conflict");
    }
    if (existing.data.stripe_checkout_session_id) {
      const replay = await stripeSession(`/v1/checkout/sessions/${encodeURIComponent(existing.data.stripe_checkout_session_id)}`, connection.stripe_account_id);
      return { url: replay.url, sessionId: replay.id, idempotentReplay: true };
    }
  }

  let record = existing.data;
  if (!record) {
    const inserted = await admin.from("payment_records").insert({
      user_id: row.user_id,
      quote_id: paymentUsesQuoteId(type) ? row.id : null,
      invoice_id: paymentUsesQuoteId(type) ? null : row.id,
      payment_type: type,
      status: "pending",
      provider: "stripe",
      method: "card",
      amount_cents: amountCents,
      currency: currencyFor(row),
      client_email: quoteEmail(row),
      description: paymentDescription(type, row),
      connected_account_id: connection.stripe_account_id,
      metadata: { quote_number: row.quote_number || "", document_type: isInvoice(row) ? "invoice" : "quote" },
      idempotency_key: key,
    }).select().single();
    if (inserted.error) throw inserted.error;
    record = inserted.data;
  }

  const successUrl = new URL(returnUrl.toString());
  successUrl.searchParams.set("payment", "success");
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  const successText = successUrl.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
  const productName = type === "change_order_continue"
    ? `Payment to continue work - ${row.quote_number || "change order"}`
    : (type === "invoice_full" ? `Invoice ${row.quote_number || "payment"}` : `Project deposit - Quote ${row.quote_number || ""}`);
  const params = new URLSearchParams({
    "payment_method_types[]": "card",
    mode: "payment",
    "line_items[0][price_data][currency]": currencyFor(row),
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][quantity]": "1",
    success_url: successText,
    cancel_url: returnUrl.toString(),
    client_reference_id: String(record.id),
    "metadata[payment_record_id]": String(record.id),
    "metadata[quote_id]": row.id,
    "metadata[contractor_user_id]": row.user_id,
    "metadata[payment_type]": type,
    "payment_intent_data[metadata][payment_record_id]": String(record.id),
    "payment_intent_data[metadata][quote_id]": row.id,
    "payment_intent_data[metadata][contractor_user_id]": row.user_id,
    "payment_intent_data[metadata][payment_type]": type,
  });
  const email = quoteEmail(row);
  if (email) params.set("customer_email", email);

  try {
    const session = await stripeSession("/v1/checkout/sessions", connection.stripe_account_id, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": key },
      body: params.toString(),
    });
    const updated = await admin.from("payment_records").update({
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    }).eq("id", record.id);
    if (updated.error) throw updated.error;
    return { url: session.url, sessionId: session.id, amountCents };
  } catch (error) {
    await admin.from("payment_records").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", record.id);
    throw error;
  }
}

async function reportManual(admin: any, body: Record<string, any>, row: QuoteRow, settings: any, state: any) {
  const type = paymentType(body, row);
  assertPayable(row, type, state);
  const method = String(body.method || "").toLowerCase();
  if (!manualMethodAllowed(settings, method)) throw new PaymentError("That payment method is not offered for this document.", 403, "manual_method_disabled");
  const key = idempotencyKey(body.idempotencyKey);
  const amountCents = dueAmount(type, state);
  const existing = await admin.from("payment_records").select("*").eq("idempotency_key", key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.user_id !== row.user_id || existing.data.amount_cents !== amountCents || existing.data.method !== method) {
      throw new PaymentError("This report conflicts with an earlier attempt. Refresh and try again.", 409, "idempotency_conflict");
    }
    return { record: existing.data, idempotentReplay: true };
  }

  const now = new Date().toISOString();
  const inserted = await admin.from("payment_records").insert({
    user_id: row.user_id,
    quote_id: paymentUsesQuoteId(type) ? row.id : null,
    invoice_id: paymentUsesQuoteId(type) ? null : row.id,
    payment_type: type,
    status: "client_reported",
    provider: "manual",
    method,
    amount_cents: amountCents,
    currency: currencyFor(row),
    client_email: quoteEmail(row),
    description: type === "change_order_continue" ? "Client-reported payment to continue work" : (type === "invoice_full" ? "Client-reported invoice payment" : "Client-reported deposit"),
    client_reference: cleanText(body.reference, 120),
    client_note: cleanText(body.note, 500),
    reported_at: now,
    metadata: { quote_number: row.quote_number || "", document_type: isInvoice(row) ? "invoice" : "quote" },
    idempotency_key: key,
  }).select().single();
  if (inserted.error) throw inserted.error;

  const data = rowData(row);
  await admin.from("quotes").update({
    data: {
      ...data,
      manual_payment_reported: true,
      manual_payment_reported_at: now,
      manual_payment_report_id: inserted.data.id,
      manual_payment_method: method,
    },
    updated_at: now,
  }).eq("id", row.id).eq("user_id", row.user_id);
  return { record: inserted.data };
}

async function verifyCheckout(admin: any, body: Record<string, any>, row: QuoteRow, state: any) {
  const sessionId = String(body.sessionId || "");
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) throw new PaymentError("Missing checkout session", 400, "checkout_session_required");
  const { data: record, error } = await admin
    .from("payment_records")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!record || ![record.quote_id, record.invoice_id].includes(row.id)) throw new PaymentError("Payment session not found", 404, "checkout_session_not_found");
  if (["paid", "confirmed"].includes(record.status)) return publicStatus(row, await documentPaymentState(admin, row, (await paymentSettings(admin, row.user_id)).settings));
  if (!STRIPE_SECRET_KEY || !record.connected_account_id) return publicStatus(row, state);

  const session = await stripeSession(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, record.connected_account_id);
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (paid) {
    const paidAt = new Date().toISOString();
    const values = {
      status: "paid",
      amount_cents: Number(session.amount_total || record.amount_cents || 0),
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_customer_id: session.customer || null,
      paid_at: paidAt,
      updated_at: paidAt,
    };
    const updated = await admin.from("payment_records").update(values).eq("id", record.id).select().single();
    if (updated.error) throw updated.error;
    await updateQuotePaymentState(admin, row, updated.data, paidAt);
  }
  const refreshedRow = await fetchQuote(admin, row.id) || row;
  const refreshed = await documentPaymentState(admin, refreshedRow, (await paymentSettings(admin, row.user_id)).settings);
  return publicStatus(refreshedRow, refreshed);
}

async function confirmManual(req: Request, admin: any, body: Record<string, any>) {
  const user = await authenticatedUser(req);
  if (!user) throw new PaymentError("Authentication required", 401, "authentication_required");
  const recordId = normalizeId(body.recordId);
  if (!recordId) throw new PaymentError("Payment report not found", 404, "payment_report_not_found");
  const { data: record, error } = await admin.from("payment_records").select("*").eq("id", recordId).maybeSingle();
  if (error) throw error;
  if (!record || record.user_id !== user.id || record.provider !== "manual") throw new PaymentError("Payment report not found", 404, "payment_report_not_found");
  const decision = String(body.decision || "confirmed").toLowerCase();
  const now = new Date().toISOString();
  if (decision === "rejected") {
    if (record.status !== "client_reported") return { record: { id: record.id, status: record.status }, unchanged: true };
    const rejected = await admin.from("payment_records").update({
      status: "rejected",
      confirmed_at: now,
      confirmed_by: user.id,
      updated_at: now,
      metadata: { ...(record.metadata || {}), rejection_reason: cleanText(body.note, 300) },
    }).eq("id", record.id).select().single();
    if (rejected.error) throw rejected.error;
    const hiddenEvidence = await admin.from("payment_evidence").update({
      portal_visible: false,
      updated_at: now,
    }).eq("payment_record_id", record.id).is("deleted_at", null);
    if (hiddenEvidence.error) throw hiddenEvidence.error;
    const rejectedDocumentId = rejected.data.quote_id || rejected.data.invoice_id;
    const rejectedRow = rejectedDocumentId ? await fetchQuote(admin, rejectedDocumentId) : null;
    if (rejectedRow) {
      const data = rowData(rejectedRow);
      await admin.from("quotes").update({
        data: {
          ...data,
          manual_payment_reported: false,
          manual_payment_report_id: "",
          manual_payment_method: "",
        },
        updated_at: now,
      }).eq("id", rejectedRow.id).eq("user_id", user.id);
    }
    return { record: { id: rejected.data.id, status: rejected.data.status } };
  }

  const amountWasProvided = Object.prototype.hasOwnProperty.call(body, "confirmedAmountCents");
  if (!["client_reported", "confirmed"].includes(record.status) || (record.status === "confirmed" && !amountWasProvided)) {
    return { record: { id: record.id, status: record.status }, unchanged: true };
  }
  const documentId = record.quote_id || record.invoice_id;
  const row = documentId ? await fetchQuote(admin, documentId) : null;
  if (!row || row.user_id !== user.id) throw new PaymentError("Payment document not found", 404, "payment_document_not_found");

  const confirmedAmountCents = amountWasProvided ? Number(body.confirmedAmountCents) : Number(record.amount_cents || 0);
  if (!Number.isInteger(confirmedAmountCents) || confirmedAmountCents <= 0) {
    throw new PaymentError("Enter the amount actually received, to the cent.", 400, "confirmed_amount_invalid");
  }
  const records = await recordsForDocument(admin, row.id);
  const otherPaidCents = records
    .filter((candidate: any) => candidate.id !== record.id && ["paid", "confirmed"].includes(candidate.status))
    .reduce((sum: number, candidate: any) => sum + Math.max(0, Number(candidate.amount_cents || 0)), 0)
    + legacyUnlinkedPaidCents(row);
  const maximumAmountCents = isChangeOrder(row)
    ? (await changeOrderProjectPaymentContext(admin, row)).projectBalanceDueCents
      + (["paid", "confirmed"].includes(record.status) ? Math.max(0, Number(record.amount_cents || 0)) : 0)
    : Math.max(0, documentTotalCents(row) - otherPaidCents);
  if (confirmedAmountCents > maximumAmountCents) {
    throw new PaymentError(isChangeOrder(row)
      ? "The confirmed amount cannot exceed the outstanding project balance."
      : "The confirmed amount cannot exceed the document balance.", 409, "confirmed_amount_exceeds_balance");
  }

  const confirmed = await admin.from("payment_records").update({
    status: "confirmed",
    amount_cents: confirmedAmountCents,
    confirmed_at: now,
    confirmed_by: user.id,
    paid_at: now,
    updated_at: now,
    metadata: {
      ...(record.metadata || {}),
      client_reported_amount_cents: Number(record.metadata?.client_reported_amount_cents || record.amount_cents || 0),
      owner_confirmed_amount_cents: confirmedAmountCents,
      amount_corrected_by_owner: confirmedAmountCents !== Number(record.amount_cents || 0),
    },
  }).eq("id", record.id).select().single();
  if (confirmed.error) throw confirmed.error;
  const state = await updateQuotePaymentState(admin, row, confirmed.data, now, { clearDepositShortfallAcceptance: true });
  return {
    record: { id: confirmed.data.id, status: confirmed.data.status, amountCents: confirmedAmountCents, confirmedAt: now },
    payment: publicStatus({ ...row, data: { ...rowData(row), deposit_shortfall_accepted: false } }, state),
  };
}

async function resolveDepositShortfall(req: Request, admin: any, body: Record<string, any>) {
  const user = await authenticatedUser(req);
  if (!user) throw new PaymentError("Authentication required", 401, "authentication_required");
  const documentId = normalizeId(body.documentId || body.quoteId || body.invoiceId || body.id);
  if (!documentId) throw new PaymentError("Payment document not found", 404, "payment_document_not_found");
  const row = await fetchQuote(admin, documentId);
  if (!row || row.user_id !== user.id) throw new PaymentError("Payment document not found", 404, "payment_document_not_found");
  if (isChangeOrder(row)) throw new PaymentError("Change orders use their separate payment-to-continue requirement, not deposit shortfall decisions.", 409, "change_order_deposit_not_applicable");
  if (!isAccepted(row)) throw new PaymentError("Accept the quote before resolving its deposit.", 409, "quote_acceptance_required");

  const decision = String(body.decision || "").trim().toLowerCase();
  if (!["accept_shortfall", "keep_outstanding"].includes(decision)) {
    throw new PaymentError("Choose whether to accept the lower deposit or keep the balance outstanding.", 400, "deposit_shortfall_decision_required");
  }

  const { settings } = await paymentSettings(admin, row.user_id);
  const currentState = await documentPaymentState(admin, row, settings);
  if (currentState.requiredDepositCents <= 0) {
    throw new PaymentError("This document does not require a deposit.", 409, "deposit_not_required");
  }
  if (currentState.paidCents <= 0) {
    throw new PaymentError("Record a received payment before resolving the deposit.", 409, "deposit_payment_required");
  }
  if (currentState.paidCents >= currentState.requiredDepositCents) {
    throw new PaymentError("The required deposit has already been received in full.", 409, "deposit_already_satisfied");
  }

  const now = new Date().toISOString();
  const accepted = decision === "accept_shortfall";
  const candidateData = {
    ...rowData(row),
    deposit_shortfall_accepted: accepted,
    deposit_shortfall_accepted_at: accepted ? now : null,
    deposit_shortfall_accepted_paid_cents: accepted ? currentState.paidCents : 0,
    deposit_shortfall_required_cents: accepted ? currentState.requiredDepositCents : 0,
    deposit_shortfall_accepted_by: accepted ? user.id : null,
  };
  const candidateRow = { ...row, data: candidateData };
  const nextState = await documentPaymentState(admin, candidateRow, settings);
  const nextData: Record<string, any> = {
    ...candidateData,
    paymentStatus: nextState.fullPaid ? "paid" : (nextState.paidCents > 0 ? "partially_paid" : "unpaid"),
    deposit_paid: nextState.depositSecured,
    deposit_paid_at: nextState.depositSecured ? (rowData(row).deposit_paid_at || now) : null,
    deposit_due_cents: nextState.depositDueCents,
    balance_due_cents: nextState.balanceDueCents,
  };
  let updateQuery = admin.from("quotes").update({ data: nextData, updated_at: now })
    .eq("id", row.id)
    .eq("user_id", user.id);
  if (row.updated_at) updateQuery = updateQuery.eq("updated_at", row.updated_at);
  const { data: updated, error } = await updateQuery.select("id").maybeSingle();
  if (error) throw error;
  if (!updated) throw new PaymentError("The document changed while the deposit decision was being saved. Refresh and try again.", 409, "document_changed");

  return {
    decision,
    payment: publicStatus({ ...row, data: nextData }, nextState),
  };
}

async function accountPaymentAccess(req: Request, body: Record<string, any>, permission: string) {
  const access = await requireAccountPermissionWithDefault(req, body.accountId, permission);
  return { access, ownerUserId: access.ownerUserId, actorUserId: access.user.id };
}

async function manualEvidencePayment(admin: any, recordIdValue: unknown, ownerUserId: string, documentId = "") {
  const recordId = normalizeId(recordIdValue);
  if (!recordId) throw new PaymentError("Payment record not found", 404, "payment_record_not_found");
  const { data: record, error } = await admin.from("payment_records").select("*").eq("id", recordId).maybeSingle();
  if (error) throw error;
  const recordDocumentId = record?.invoice_id || record?.quote_id || "";
  if (
    !record || record.user_id !== ownerUserId || record.provider !== "manual" ||
    !["client_reported", "confirmed"].includes(record.status) ||
    (documentId && recordDocumentId !== documentId)
  ) throw new PaymentError("Payment record not found", 404, "payment_record_not_found");
  return record;
}

async function evidenceRecord(admin: any, evidenceIdValue: unknown) {
  const evidenceId = normalizeId(evidenceIdValue);
  if (!evidenceId) throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
  const { data, error } = await admin.from("payment_evidence").select("*").eq("id", evidenceId).maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at) throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
  return data;
}

function evidenceDocumentId(record: any) {
  return String(record?.invoice_id || record?.quote_id || "");
}

async function removeEvidenceObject(admin: any, record: any) {
  const removed = await admin.storage.from(PAYMENT_EVIDENCE_BUCKET).remove([record.object_path]);
  if (removed.error && !String(removed.error.message || "").toLowerCase().includes("not found")) throw removed.error;
}

async function prepareEvidenceUpload(
  admin: any,
  body: Record<string, any>,
  row: QuoteRow,
  actorRole: "client" | "contractor",
  actorUserId: string | null,
) {
  if (body.privacyChecked !== true) {
    throw new PaymentError("Check the file for sensitive information before uploading.", 400, "privacy_check_required");
  }
  let mimeType: string;
  let byteSize: number;
  try {
    mimeType = paymentEvidenceMimeType(body.mimeType);
    byteSize = paymentEvidenceByteSize(body.byteSize);
  } catch (error) {
    throw new PaymentError((error as Error).message, 415, "payment_evidence_file_invalid");
  }
  const idempotencyKey = normalizeId(body.idempotencyKey);
  if (!idempotencyKey) throw new PaymentError("This upload request expired. Choose the file again.", 400, "idempotency_key_invalid");
  const payment = await manualEvidencePayment(admin, body.recordId, row.user_id, row.id);
  const existingResult = await admin
    .from("payment_evidence")
    .select("*")
    .eq("payment_record_id", payment.id)
    .eq("uploaded_by_role", actorRole)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;
  let record = existingResult.data;
  if (record?.upload_status === "ready" && !record.deleted_at) {
    throw new PaymentError("A payment proof is already attached to this payment.", 409, "payment_evidence_exists");
  }
  const now = new Date();
  if (record) {
    const deadline = new Date(record.upload_deadline || 0);
    const sameAttempt = record.upload_status === "upload_pending"
      && record.idempotency_key === idempotencyKey
      && deadline > now
      && !record.deleted_at;
    if (!sameAttempt) {
      await removeEvidenceObject(admin, record);
      const retired = await admin.from("payment_evidence").update({
        upload_status: "deleted",
        deleted_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", record.id);
      if (retired.error) throw retired.error;
      record = null;
    }
  }
  const fileName = paymentEvidenceFilename(body.fileName);
  const portalVisible = actorRole === "client" ? true : body.portalVisible === true;
  if (!record) {
    const evidenceId = crypto.randomUUID();
    const documentColumns = payment.invoice_id
      ? { invoice_id: payment.invoice_id, quote_id: null }
      : { quote_id: payment.quote_id, invoice_id: null };
    const inserted = await admin.from("payment_evidence").insert({
      id: evidenceId,
      user_id: row.user_id,
      payment_record_id: payment.id,
      ...documentColumns,
      object_path: `${row.user_id}/${payment.id}/${evidenceId}.${paymentEvidenceExtension(mimeType)}`,
      original_filename: fileName,
      mime_type: mimeType,
      byte_size: byteSize,
      upload_status: "upload_pending",
      uploaded_by_role: actorRole,
      uploaded_by_user_id: actorUserId,
      portal_visible: portalVisible,
      privacy_notice_version: PAYMENT_EVIDENCE_NOTICE_VERSION,
      privacy_checked_at: now.toISOString(),
      idempotency_key: idempotencyKey,
      upload_deadline: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    }).select().single();
    if (inserted.error) throw inserted.error;
    record = inserted.data;
  } else {
    if (
      record.user_id !== row.user_id || record.uploaded_by_role !== actorRole ||
      record.mime_type !== mimeType || Number(record.byte_size) !== byteSize
    ) throw new PaymentError("This upload request conflicts with an earlier attempt.", 409, "payment_evidence_conflict");
  }
  const { data: upload, error: uploadError } = await admin.storage
    .from(PAYMENT_EVIDENCE_BUCKET)
    .createSignedUploadUrl(record.object_path, { upsert: true });
  if (uploadError || !upload?.token) throw uploadError || new Error("Signed upload token was not created");
  return {
    evidence: safePaymentEvidence(record),
    upload: {
      bucket: PAYMENT_EVIDENCE_BUCKET,
      path: record.object_path,
      token: upload.token,
      expiresAt: record.upload_deadline,
    },
  };
}

async function finalizeEvidenceUpload(admin: any, body: Record<string, any>, row: QuoteRow, actorRole: "client" | "contractor") {
  const record = await evidenceRecord(admin, body.evidenceId);
  if (record.user_id !== row.user_id || evidenceDocumentId(record) !== row.id || record.uploaded_by_role !== actorRole) {
    throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
  }
  if (record.upload_status === "ready") return { evidence: safePaymentEvidence(record), alreadyFinalized: true };
  if (record.upload_status !== "upload_pending" || new Date(record.upload_deadline) <= new Date()) {
    throw new PaymentError("This proof upload expired. Remove it and try again.", 409, "payment_evidence_upload_expired");
  }
  const parts = String(record.object_path || "").split("/");
  const fileName = parts.pop() || "";
  const folder = parts.join("/");
  const listed = await admin.storage.from(PAYMENT_EVIDENCE_BUCKET).list(folder, { limit: 10, search: fileName });
  if (listed.error) throw listed.error;
  const object = (listed.data || []).find((candidate: any) => candidate.name === fileName);
  if (!object) throw new PaymentError("The proof upload has not completed yet.", 409, "payment_evidence_upload_incomplete");
  const downloaded = await admin.storage.from(PAYMENT_EVIDENCE_BUCKET).download(record.object_path);
  if (downloaded.error || !downloaded.data) throw downloaded.error || new Error("Payment proof could not be verified");
  const actualBytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const actualSize = actualBytes.byteLength;
  const actualMime = String(object.metadata?.mimetype ?? object.metadata?.contentType ?? "").split(";")[0].trim().toLowerCase();
  let verified = false;
  try {
    verified = paymentEvidenceByteSize(actualSize) === Number(record.byte_size)
      && paymentEvidenceMimeType(actualMime) === record.mime_type
      && paymentEvidenceContentMatches(actualBytes, record.mime_type);
  } catch (_) {}
  if (!verified) {
    await removeEvidenceObject(admin, record);
    await admin.from("payment_evidence").update({ upload_status: "failed", updated_at: new Date().toISOString() }).eq("id", record.id);
    throw new PaymentError("The uploaded proof did not match the approved file and was removed.", 422, "payment_evidence_upload_mismatch");
  }
  const finalized = await admin.from("payment_evidence").update({
    upload_status: "ready",
    finalized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", record.id).select().single();
  if (finalized.error) throw finalized.error;
  return { evidence: safePaymentEvidence(finalized.data), alreadyFinalized: false };
}

async function evidenceSignedUrl(admin: any, record: any) {
  if (record.upload_status !== "ready") throw new PaymentError("Payment proof is not ready", 409, "payment_evidence_not_ready");
  const { data, error } = await admin.storage
    .from(PAYMENT_EVIDENCE_BUCKET)
    .createSignedUrl(record.object_path, PAYMENT_EVIDENCE_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error("Signed proof URL was not created");
  return { evidence: safePaymentEvidence(record), url: data.signedUrl, expiresIn: PAYMENT_EVIDENCE_SIGNED_URL_SECONDS };
}

async function deleteEvidence(admin: any, record: any) {
  await removeEvidenceObject(admin, record);
  const deleted = await admin.from("payment_evidence").update({
    upload_status: "deleted",
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", record.id);
  if (deleted.error) throw deleted.error;
  return { deleted: true, evidenceId: record.id };
}

async function ownerEvidenceAction(req: Request, admin: any, body: Record<string, any>, action: string) {
  const permission = ["owner_list_evidence", "owner_view_evidence"].includes(action)
    ? ACCOUNT_PERMISSION.PAYMENTS_READ
    : ACCOUNT_PERMISSION.PAYMENTS_MANAGE;
  const { ownerUserId, actorUserId } = await accountPaymentAccess(req, body, permission);
  if (action === "owner_list_evidence") {
    const { data, error } = await admin.from("payment_evidence").select("*")
      .eq("user_id", ownerUserId).eq("upload_status", "ready").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return { evidence: (data || []).map(safePaymentEvidence) };
  }
  if (action === "owner_prepare_evidence_upload") {
    const payment = await manualEvidencePayment(admin, body.recordId, ownerUserId);
    const row = await fetchQuote(admin, payment.invoice_id || payment.quote_id);
    if (!row || row.user_id !== ownerUserId) throw new PaymentError("Payment document not found", 404, "payment_document_not_found");
    return prepareEvidenceUpload(admin, body, row, "contractor", actorUserId);
  }
  const record = await evidenceRecord(admin, body.evidenceId);
  if (record.user_id !== ownerUserId) throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
  const row = await fetchQuote(admin, evidenceDocumentId(record));
  if (!row || row.user_id !== ownerUserId) throw new PaymentError("Payment document not found", 404, "payment_document_not_found");
  if (action === "owner_finalize_evidence_upload") return finalizeEvidenceUpload(admin, body, row, "contractor");
  if (action === "owner_view_evidence") return evidenceSignedUrl(admin, record);
  if (action === "owner_delete_evidence") return deleteEvidence(admin, record);
  if (action === "owner_set_evidence_visibility") {
    if (record.uploaded_by_role !== "contractor") {
      throw new PaymentError("Client-provided proof remains visible to that client.", 409, "payment_evidence_visibility_locked");
    }
    const updated = await admin.from("payment_evidence").update({
      portal_visible: body.portalVisible === true,
      updated_at: new Date().toISOString(),
    }).eq("id", record.id).select().single();
    if (updated.error) throw updated.error;
    return { evidence: safePaymentEvidence(updated.data) };
  }
  throw new PaymentError("Unknown payment proof action", 400, "unknown_action");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  let activeDocumentId = normalizeId(body.documentId || body.quoteId || body.invoiceId || body.id);

  try {
    const admin = adminClient();
    if (action.startsWith("owner_") && action.includes("evidence")) {
      return json(await ownerEvidenceAction(req, admin, body, action));
    }
    if (action === "confirm_manual") return json(await confirmManual(req, admin, body));
    if (action === "resolve_deposit_shortfall") return json(await resolveDepositShortfall(req, admin, body));

    const { target, token, portalAnchorId } = await assertDocumentAccess(admin, body);
    activeDocumentId = target.id;
    if (isInvalid(target)) throw new PaymentError("This document is no longer valid and cannot accept payment.", 409, "document_invalid");
    const { settings, connection } = await paymentSettings(admin, target.user_id);
    const state = await documentPaymentState(admin, target, settings);

    if (action === "status") return json({ payment: publicStatus(target, state) });
    if (action === "prepare_evidence_upload") {
      return json(await prepareEvidenceUpload(admin, body, target, "client", null));
    }
    if (action === "finalize_evidence_upload") {
      return json(await finalizeEvidenceUpload(admin, body, target, "client"));
    }
    if (action === "view_evidence") {
      const record = await evidenceRecord(admin, body.evidenceId);
      if (record.user_id !== target.user_id || evidenceDocumentId(record) !== target.id || record.portal_visible !== true) {
        throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
      }
      return json(await evidenceSignedUrl(admin, record));
    }
    if (action === "delete_evidence") {
      const record = await evidenceRecord(admin, body.evidenceId);
      if (
        record.user_id !== target.user_id || evidenceDocumentId(record) !== target.id ||
        record.uploaded_by_role !== "client"
      ) throw new PaymentError("Payment proof not found", 404, "payment_evidence_not_found");
      return json(await deleteEvidence(admin, record));
    }
    if (action === "create_checkout") {
      const result = await createCheckout(admin, body, target, token, portalAnchorId, settings, connection, state);
      return json(result);
    }
    if (action === "report_manual") {
      const result = await reportManual(admin, body, target, settings, state);
      const reportedState = await documentPaymentState(admin, await fetchQuote(admin, target.id) || target, settings);
      return json({
        payment: publicStatus(target, reportedState),
        idempotentReplay: !!result.idempotentReplay,
      });
    }
    if (action === "verify_checkout") return json({ payment: await verifyCheckout(admin, body, target, state) });
    throw new PaymentError("Unknown payment action", 400, "unknown_action");
  } catch (error) {
    if (error instanceof PaymentError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
    const id = supportId();
    console.error("document-payment error", { supportId: id, action, documentId: activeDocumentId, message: (error as Error).message });
    return json({
      error: action === "create_checkout"
        ? "Card payment could not be opened. Choose a manual payment method or try again."
        : "The payment request could not be completed. Please try again.",
      code: action === "create_checkout" ? "stripe_checkout_unavailable" : "payment_request_failed",
      supportId: id,
    }, action === "create_checkout" ? 502 : 500);
  }
});
