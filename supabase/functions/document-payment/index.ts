import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
      portalVisible(anchor) &&
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
  const data = rowData(row);
  const explicitAccepted = Number(data.accepted_total_cents || 0);
  if (Number.isInteger(explicitAccepted) && explicitAccepted > 0) return explicitAccepted;
  const raw = Number(row.total ?? row.grand_total ?? data.grandTotal ?? data.total ?? 0);
  return Math.max(0, Math.round((Number.isFinite(raw) ? raw : 0) * 100));
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

function existingPaidCents(row: QuoteRow) {
  const data = rowData(row);
  const received = data.paymentsReceived || data.paymentReceived || {};
  const amount = Number(received.amount || received.value || 0);
  return Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100));
}

async function documentPaymentState(admin: any, row: QuoteRow, settings: Record<string, any>) {
  const records = await recordsForDocument(admin, row.id);
  const secured = records.filter((record: any) => ["paid", "confirmed"].includes(record.status));
  const recordPaidCents = secured.reduce((sum: number, record: any) => sum + Math.max(0, Number(record.amount_cents || 0)), 0);
  const paidCents = Math.max(recordPaidCents, existingPaidCents(row));
  const totalCents = documentTotalCents(row);
  const terms = resolveDepositTerms(row, settings);
  const requestedDepositCents = depositAmountCents(totalCents, terms);
  const depositSecured = secured.some((record: any) => ["deposit", "invoice_deposit"].includes(record.payment_type));
  const fullPaid = secured.some((record: any) => record.payment_type === "invoice_full") || paidCents >= totalCents && totalCents > 0;
  const reported = records.find((record: any) => record.status === "client_reported");
  return {
    records,
    totalCents,
    paidCents,
    balanceDueCents: Math.max(0, totalCents - paidCents),
    terms,
    depositDueCents: depositSecured ? 0 : requestedDepositCents,
    depositSecured,
    fullPaid,
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
  else if (state.depositSecured) status = "secured";
  else if (state.reported) status = "client_reported";
  return {
    documentId: row.id,
    status,
    accepted: isAccepted(row),
    totalCents: state.totalCents,
    paidCents: state.paidCents,
    balanceDueCents: state.balanceDueCents,
    depositDueCents: state.depositDueCents,
    depositSecured: state.depositSecured,
    fullPaid: state.fullPaid,
    report: state.reported,
  };
}

function dueAmount(paymentTypeValue: string, state: any) {
  if (paymentTypeValue === "invoice_full") return state.balanceDueCents;
  return state.depositDueCents;
}

function assertPayable(row: QuoteRow, paymentTypeValue: string, state: any) {
  if (isInvalid(row)) throw new PaymentError("This document is no longer valid and cannot accept payment.", 409, "document_invalid");
  if (paymentTypeValue === "invoice_full" && !isInvoice(row)) throw new PaymentError("Full payment is only available for invoices.", 409, "invoice_required");
  if (paymentTypeValue !== "invoice_full" && !state.terms.deposit_required) throw new PaymentError("This document does not require a deposit.", 409, "deposit_not_required");
  if (!isAccepted(row) && paymentTypeValue !== "invoice_full") throw new PaymentError("Accept and sign the quote before sending the deposit.", 409, "quote_acceptance_required");
  if (paymentTypeValue === "invoice_full" && !["invoiced", "paid"].includes(String(row.status || "").toLowerCase())) {
    throw new PaymentError("This invoice is not ready for payment.", 409, "invoice_not_payable");
  }
  if (dueAmount(paymentTypeValue, state) <= 0) throw new PaymentError("This payment has already been secured.", 409, "payment_already_secured");
}

function safeReturnUrl(value: unknown, row: QuoteRow, token: string, portalAnchorId: string) {
  try {
    const url = new URL(String(value || ""));
    const production = url.protocol === "https:" && ["quotedr.io", "www.quotedr.io"].includes(url.hostname);
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

async function updateQuotePaymentState(admin: any, row: QuoteRow, record: any, paidAt: string) {
  const data = rowData(row);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const alreadyRecorded = payments.some((payment: any) => payment.payment_record_id === record.id || (record.stripe_checkout_session_id && payment.stripe_checkout_session_id === record.stripe_checkout_session_id));
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
  const received = data.paymentsReceived || data.paymentReceived || {};
  const previousReceived = Math.max(0, Number(received.amount || received.value || 0));
  const nextReceived = alreadyRecorded ? previousReceived : previousReceived + Number(record.amount_cents || 0) / 100;
  const nextData = {
    ...data,
    paymentStatus: record.payment_type === "invoice_full" ? "paid" : "partially_paid",
    deposit_paid: ["deposit", "invoice_deposit"].includes(record.payment_type) ? true : data.deposit_paid,
    deposit_paid_at: ["deposit", "invoice_deposit"].includes(record.payment_type) ? (data.deposit_paid_at || paidAt) : data.deposit_paid_at,
    lastPaymentAt: paidAt,
    manual_payment_reported: false,
    paymentsReceived: {
      name: ["deposit", "invoice_deposit"].includes(record.payment_type) ? "Deposit paid" : "Payment received",
      amount: Math.round(nextReceived * 100) / 100,
    },
    payments: alreadyRecorded ? payments : payments.concat([paymentEntry]),
  };
  const update: Record<string, any> = { data: nextData, updated_at: paidAt };
  if (record.payment_type === "invoice_full") update.status = "paid";
  const { error } = await admin.from("quotes").update(update).eq("id", row.id).eq("user_id", row.user_id);
  if (error) throw error;
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
    if (existing.data.user_id !== row.user_id || existing.data.quote_id !== (type === "deposit" ? row.id : null) || existing.data.invoice_id !== (type === "deposit" ? null : row.id) || existing.data.amount_cents !== amountCents) {
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
      quote_id: type === "deposit" ? row.id : null,
      invoice_id: type === "deposit" ? null : row.id,
      payment_type: type,
      status: "pending",
      provider: "stripe",
      method: "card",
      amount_cents: amountCents,
      currency: currencyFor(row),
      client_email: quoteEmail(row),
      description: type === "invoice_full" ? `Invoice ${row.quote_number || row.id}` : `Deposit for quote ${row.quote_number || row.id}`,
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
  const productName = type === "invoice_full" ? `Invoice ${row.quote_number || "payment"}` : `Project deposit - Quote ${row.quote_number || ""}`;
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
    quote_id: type === "deposit" ? row.id : null,
    invoice_id: type === "deposit" ? null : row.id,
    payment_type: type,
    status: "client_reported",
    provider: "manual",
    method,
    amount_cents: amountCents,
    currency: currencyFor(row),
    client_email: quoteEmail(row),
    description: type === "invoice_full" ? "Client-reported invoice payment" : "Client-reported deposit",
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
  if (record.status !== "client_reported") return { record: { id: record.id, status: record.status }, unchanged: true };
  const decision = String(body.decision || "confirmed").toLowerCase();
  const now = new Date().toISOString();
  if (decision === "rejected") {
    const rejected = await admin.from("payment_records").update({
      status: "rejected",
      confirmed_at: now,
      confirmed_by: user.id,
      updated_at: now,
      metadata: { ...(record.metadata || {}), rejection_reason: cleanText(body.note, 300) },
    }).eq("id", record.id).select().single();
    if (rejected.error) throw rejected.error;
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

  const confirmed = await admin.from("payment_records").update({
    status: "confirmed",
    confirmed_at: now,
    confirmed_by: user.id,
    paid_at: now,
    updated_at: now,
  }).eq("id", record.id).select().single();
  if (confirmed.error) throw confirmed.error;
  const documentId = confirmed.data.quote_id || confirmed.data.invoice_id;
  const row = documentId ? await fetchQuote(admin, documentId) : null;
  if (row) await updateQuotePaymentState(admin, row, confirmed.data, now);
  return { record: { id: confirmed.data.id, status: confirmed.data.status, confirmedAt: now } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  let activeDocumentId = normalizeId(body.documentId || body.quoteId || body.invoiceId || body.id);

  try {
    const admin = adminClient();
    if (action === "confirm_manual") return json(await confirmManual(req, admin, body));

    const { target, token, portalAnchorId } = await assertDocumentAccess(admin, body);
    activeDocumentId = target.id;
    if (isInvalid(target)) throw new PaymentError("This document is no longer valid and cannot accept payment.", 409, "document_invalid");
    const { settings, connection } = await paymentSettings(admin, target.user_id);
    const state = await documentPaymentState(admin, target, settings);

    if (action === "status") return json({ payment: publicStatus(target, state) });
    if (action === "create_checkout") {
      const result = await createCheckout(admin, body, target, token, portalAnchorId, settings, connection, state);
      return json(result);
    }
    if (action === "report_manual") {
      const result = await reportManual(admin, body, target, settings, state);
      return json({
        payment: {
          status: "client_reported",
          report: {
            id: result.record.id,
            method: result.record.method,
            amountCents: result.record.amount_cents,
            reportedAt: result.record.reported_at || result.record.created_at,
          },
        },
        idempotentReplay: !!result.idempotentReplay,
      });
    }
    if (action === "verify_checkout") return json({ payment: await verifyCheckout(admin, body, target, state) });
    throw new PaymentError("Unknown payment action", 400, "unknown_action");
  } catch (error) {
    if (error instanceof PaymentError) return json({ error: error.message, code: error.code }, error.status);
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
