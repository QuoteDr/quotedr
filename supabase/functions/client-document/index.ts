import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  requireAccountPermissionWithDefault,
} from "../_shared/account-authorization.ts";
import {
  applyClientDocumentDecision,
  calculateClientDocumentTotals,
  clientDecisionForStorage,
  ClientDocumentDecisionError,
  sanitizeClientBusinessProfile,
  sanitizeClientDocumentRow,
  sanitizeClientMediaUrl,
  sanitizeClientDocumentStyle,
} from "../_shared/client-document-policy.mjs";
import { isProductionClientPortalUrl } from "../_shared/client-portal-url.mjs";
import { legacyUnlinkedPaidCents } from "../_shared/document-payment-accounting.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QuoteRow = {
  id: string;
  user_id: string;
  quote_number?: string;
  client_name?: string;
  status?: string;
  type?: string;
  parent_quote_id?: string | null;
  change_order_number?: number | null;
  total?: number;
  data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  viewed_at?: string | null;
  public_share_token_hash?: string | null;
};

type PortalJobAssetRow = {
  id: string;
  user_id: string;
  portal_id: string;
  job_folder_id: string;
  quote_id?: string | null;
  kind: "photo" | "file";
  title: string;
  storage_path: string;
  thumbnail_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  original_size_bytes?: number | null;
  visible_to_client?: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PortalDocumentEventRow = {
  id: string;
  user_id: string;
  portal_id?: string | null;
  document_id: string;
  portal_anchor_id?: string | null;
  event_type: string;
  session_id: string;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

const ALLOWED_DOCUMENT_EVENT_TYPES = new Set([
  "document_opened",
  "document_view_duration",
  "pdf_opened",
  "payment_clicked",
  "signature_started",
  "document_signed",
  "document_rejected",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function userFromAuthHeader(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function normalizeId(value: unknown) {
  return String(value || "").trim();
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createShareToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rowData(row: QuoteRow) {
  return row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
}

function quoteEmail(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_client_email || data.clientEmail || data.email || data.client_email || "").trim().toLowerCase();
}

function quoteName(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_client_name || row.client_name || data.clientName || data.client_name || "").trim().toLowerCase();
}

function displayQuoteName(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_client_name || row.client_name || data.clientName || data.client_name || "Client").trim();
}

function normalizeSignerName(value: unknown) {
  let text = String(value || "").trim();
  try { text = text.normalize("NFKD"); } catch (_) {}
  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019'`.-]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function signerWordCount(value: unknown) {
  const normalized = normalizeSignerName(value);
  return normalized ? normalized.split(" ").length : 0;
}

function clientSignerCandidates(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  let candidates = [raw];
  raw.split(/\s*(?:;|\/|\||&|\band\b)\s*/i).forEach((group) => {
    const cleanGroup = String(group || "").trim();
    if (!cleanGroup) return;
    candidates.push(cleanGroup);
    const commaParts = cleanGroup.split(",").map((part) => part.trim()).filter(Boolean);
    if (commaParts.length === 2 && commaParts.every((part) => signerWordCount(part) === 1)) {
      candidates.push(`${commaParts[1]} ${commaParts[0]}`);
    } else if (commaParts.length > 1 && commaParts.every((part) => signerWordCount(part) >= 2)) {
      candidates = candidates.concat(commaParts);
    }
  });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = normalizeSignerName(candidate);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function validateTypedSigner(row: QuoteRow, signerName: unknown) {
  const entered = normalizeSignerName(signerName);
  const candidates = clientSignerCandidates(displayQuoteName(row));
  const normalizedCandidates = candidates.map(normalizeSignerName);
  const exactMatch = !!entered && normalizedCandidates.includes(entered);
  const hasFullName = signerWordCount(entered) >= 2;
  return {
    valid: exactMatch && hasFullName,
    hasFullName,
    hasClientName: candidates.length > 0 && displayQuoteName(row) !== "Client",
  };
}

function quoteTitle(row: QuoteRow) {
  const data = rowData(row);
  return String(data.quoteTitle || data.title || row.client_name || row.quote_number || "Untitled document").trim();
}

function documentTypeLabel(row: QuoteRow) {
  const data = rowData(row);
  const raw = String(row.type || data.documentType || data.type || "quote").toLowerCase();
  if (raw.includes("invoice")) return "invoice";
  if (raw.includes("change")) return "change order";
  return "quote";
}

function eventLabel(eventType: string) {
  if (eventType === "viewed") return "opened";
  if (eventType === "declined") return "declined";
  if (eventType === "note_added") return "left a note on";
  if (eventType === "payment_paid") return "made a payment on";
  return "accepted";
}

function prefKeyForEvent(eventType: string) {
  if (eventType === "viewed") return "email_on_viewed";
  if (eventType === "declined") return "email_on_declined";
  if (eventType === "note_added") return "email_on_note";
  return "email_on_accepted";
}

function defaultPrefs() {
  return {
    email_on_viewed: true,
    email_on_accepted: true,
    email_on_declined: true,
    email_on_note: true,
    email_to: "",
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientNoteSummary(decision: Record<string, unknown>) {
  const roomNotes = decision.roomNotes;
  if (!roomNotes || typeof roomNotes !== "object" || Array.isArray(roomNotes)) return "";
  const snippets = Object.values(roomNotes as Record<string, unknown>)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!snippets.length) return "";
  const joined = snippets.join(" | ");
  return joined.length > 240 ? joined.slice(0, 237) + "..." : joined;
}

function detectClientNoteActivity(decision: unknown) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return "";
  return clientNoteSummary(decision as Record<string, unknown>);
}

async function maybeSendClientActivityEmail(
  supabase: ReturnType<typeof adminClient>,
  eventRow: Record<string, unknown>,
  row: QuoteRow,
  prefs: Record<string, unknown>,
) {
  if (!RESEND_API_KEY) return { sent: false, error: "RESEND_API_KEY is not configured" };
  const eventType = String(eventRow.event_type || "");
  const enabled = prefs[prefKeyForEvent(eventType)] === true;
  if (!enabled) return { sent: false };

  let recipient = String(prefs.email_to || "").trim();
  if (!recipient) {
    const { data, error } = await supabase.auth.admin.getUserById(row.user_id);
    if (error) return { sent: false, error: error.message };
    recipient = String(data?.user?.email || "").trim();
  }
  if (!recipient) return { sent: false, error: "No alert email recipient configured" };

  const client = String(eventRow.client_name || "Client");
  const docType = String(eventRow.document_type || documentTypeLabel(row)).replace(/_/g, " ");
  const quoteNumber = String(eventRow.quote_number || "").trim();
  const action = eventLabel(eventType);
  const message = String(eventRow.message || "");
  const subject = `QuoteDr alert: ${client} ${action} your ${docType}${quoteNumber ? " #" + quoteNumber : ""}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#102033;">
      <h2 style="margin:0 0 12px;">QuoteDr client activity</h2>
      <p><strong>${escapeHtml(client)}</strong> ${escapeHtml(action)} your ${escapeHtml(docType)}.</p>
      ${quoteNumber ? `<p><strong>Document:</strong> ${escapeHtml(quoteNumber)}</p>` : ""}
      <p><strong>File:</strong> ${escapeHtml(eventRow.document_title || "")}</p>
      ${message ? `<p><strong>Note:</strong> ${escapeHtml(message)}</p>` : ""}
      <p style="color:#64748b;font-size:13px;">You can adjust these alerts from QuoteDr dashboard alerts.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "QuoteDr Alerts <quotes@quotedr.io>",
      to: [recipient],
      subject,
      html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, error: String(result?.message || "Email alert failed") };
  return { sent: true };
}

async function recordClientActivity(
  supabase: ReturnType<typeof adminClient>,
  row: QuoteRow,
  eventType: string,
  details: Record<string, unknown> = {},
) {
  try {
    if (eventType === "viewed") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("client_activity_events")
        .select("id")
        .eq("document_id", row.id)
        .eq("event_type", "viewed")
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length) return null;
    }

    const message = String(details.message || "");
    const eventRow = {
      user_id: row.user_id,
      document_id: row.id,
      document_type: documentTypeLabel(row).replace(" ", "_"),
      event_type: eventType,
      client_name: displayQuoteName(row),
      client_email: quoteEmail(row),
      quote_number: row.quote_number || "",
      document_title: quoteTitle(row),
      message,
      metadata: details.metadata && typeof details.metadata === "object" ? details.metadata : {},
    };

    const { data: inserted, error } = await supabase
      .from("client_activity_events")
      .insert(eventRow)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!inserted) return null;

    const { data: prefRow } = await supabase
      .from("client_notification_preferences")
      .select("*")
      .eq("user_id", row.user_id)
      .maybeSingle();
    const prefs = { ...defaultPrefs(), ...(prefRow || {}) };
    const email = await maybeSendClientActivityEmail(supabase, inserted as Record<string, unknown>, row, prefs);
    if (email.sent) {
      await supabase
        .from("client_activity_events")
        .update({ email_sent_at: new Date().toISOString(), email_error: null })
        .eq("id", (inserted as Record<string, unknown>).id);
    } else if (email.error && prefs[prefKeyForEvent(eventType)] === true) {
      await supabase
        .from("client_activity_events")
        .update({ email_error: email.error })
        .eq("id", (inserted as Record<string, unknown>).id);
    }
    return inserted;
  } catch (error) {
    console.error("client activity record failed:", error);
    return null;
  }
}

function portalId(row: QuoteRow) {
  const data = rowData(row);
  return String(data.portal_id || "").trim();
}

function portalVisible(row: QuoteRow) {
  const data = rowData(row);
  return data.portal_visible === true;
}

function portalAnchorAvailable(row: QuoteRow) {
  const data = rowData(row);
  return portalVisible(row) || (data.portal_anchor_only === true && !!portalId(row));
}

function isPortalShareBaseUrl(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return true;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const isProductionPortal = isProductionClientPortalUrl(url);
      let supabaseHost = "";
      try { supabaseHost = new URL(SUPABASE_URL).hostname.toLowerCase(); } catch (_) {}
      const isLocalSupabase = supabaseHost === "localhost" || supabaseHost === "127.0.0.1";
      const isLocalPortal = isLocalSupabase &&
        (host === "localhost" || host === "127.0.0.1") &&
        (url.protocol === "http:" || url.protocol === "https:");
      const reservedParams = ["admin", "view", "theme_studio", "id", "token", "p", "portal_anchor"];
      const hasReservedParam = reservedParams.some((name) => url.searchParams.has(name));
      return (isProductionPortal || isLocalPortal) &&
        !hasReservedParam &&
        /^\/client-portal(?:\.html)?\/?$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
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

function sanitizeQuoteRow(row: QuoteRow, options: Record<string, unknown> = {}) {
  return sanitizeClientDocumentRow(row, options) as Record<string, unknown>;
}

function sanitizePublicBusinessProfile(value: unknown) {
  return sanitizeClientBusinessProfile(value);
}

const PUBLIC_PORTAL_THEME_STRING_FIELDS = [
  "headerColor", "bgColor", "bgColor2", "textColor", "headerTextColor",
  "headerDetailColor", "cardTextColor", "mutedTextColor", "buttonTextColor",
  "bgStyle", "layoutStyle", "portalLogo", "logoSize", "headerDensity",
  "buttonStyle", "cardStyle",
];

function sanitizePublicPortalTheme(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of PUBLIC_PORTAL_THEME_STRING_FIELDS) {
    if (typeof source[key] !== "string") continue;
    result[key] = key === "portalLogo" ? sanitizeClientMediaUrl(source[key]) : source[key];
  }
  for (const key of ["bgStrength", "logoScale"]) {
    const rawValue = source[key];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") continue;
    const numberValue = Number(rawValue);
    if (Number.isFinite(numberValue)) result[key] = numberValue;
  }
  return result;
}

async function loadPublicAccountBranding(userId: string, includePortalTheme = false) {
  try {
    const keys = ["business_profile", "company_logo"];
    if (includePortalTheme) keys.push("portal_theme");
    const { data, error } = await adminClient()
      .from("user_data")
      .select("key,value")
      .eq("user_id", userId)
      .in("key", keys);
    if (error) throw error;
    const profile = (data || []).find((row) => row.key === "business_profile")?.value;
    const logoValue = (data || []).find((row) => row.key === "company_logo")?.value;
    const portalTheme = (data || []).find((row) => row.key === "portal_theme")?.value;
    const logoRecord = logoValue && typeof logoValue === "object" && !Array.isArray(logoValue)
      ? logoValue as Record<string, unknown>
      : {};
    return {
      businessProfile: sanitizePublicBusinessProfile(profile),
      businessLogo: typeof logoRecord.logo === "string" ? sanitizeClientMediaUrl(logoRecord.logo) : "",
      portalTheme: includePortalTheme ? sanitizePublicPortalTheme(portalTheme) : {},
    };
  } catch (error) {
    console.error("public account branding load failed:", error);
    return { businessProfile: {}, businessLogo: "", portalTheme: {} };
  }
}

async function loadDocumentBrandingFallback(userId: string) {
  const branding = await loadPublicAccountBranding(userId);
  return { businessProfile: branding.businessProfile, businessLogo: branding.businessLogo };
}

async function loadPortalBranding(userId: string) {
  return await loadPublicAccountBranding(userId, true);
}

function documentNeedsBrandingFallback(row: QuoteRow) {
  const data = rowData(row);
  return !Object.prototype.hasOwnProperty.call(data, "businessLogo")
    || !Object.prototype.hasOwnProperty.call(data, "businessProfile");
}

function cardPaymentEnabledForDocument(row: QuoteRow, settings: Record<string, unknown>) {
  if (settings.stripe_enabled !== true) return false;
  const data = rowData(row);
  const decision = data.card_payment || data.cardPayment;
  if (
    decision &&
    typeof decision === "object" &&
    Number((decision as Record<string, unknown>).version || 0) >= 1 &&
    typeof (decision as Record<string, unknown>).enabled === "boolean"
  ) {
    return (decision as Record<string, unknown>).enabled === true;
  }
  // Documents shared before Card Payment Rules keep the prior account-wide behavior.
  return true;
}

async function loadPaymentOptions(row: QuoteRow) {
  const userId = row.user_id;
  const supabase = adminClient();
  const [{ data: settingsRow }, { data: connectionRow }] = await Promise.all([
    supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "payment_settings").maybeSingle(),
    supabase.from("stripe_connected_accounts").select("status,charges_enabled,payouts_enabled,details_submitted").eq("user_id", userId).maybeSingle(),
  ]);
  const settings = settingsRow?.value && typeof settingsRow.value === "object"
    ? settingsRow.value as Record<string, unknown>
    : {};
  const connectionReady = connectionRow?.status === "ready" && connectionRow?.charges_enabled === true;
  const cardPaymentEnabled = cardPaymentEnabledForDocument(row, settings);
  const defaultPercent = Math.min(100, Math.max(1, Number(settings.deposit_default_pct || 50)));
  const defaultFixedCents = Math.max(0, Math.round(Number(settings.deposit_default_fixed_cents || 0)));
  const defaultKind = settings.deposit_default_kind === "fixed" && defaultFixedCents > 0 ? "fixed" : "percent";
  return {
    version: 3,
    deposit: {
      enabled: settings.accept_deposit !== false,
      defaultKind,
      defaultPercent,
      defaultFixedCents,
      due: "after_acceptance",
    },
    invoice: { fullPaymentEnabled: settings.accept_full_payment !== false },
    card: {
      enabled: cardPaymentEnabled,
      available: cardPaymentEnabled && connectionReady,
    },
    manual: {
      etransfer: {
        enabled: settings.accept_etransfer !== false,
        email: String(settings.etransfer_email || "").trim().slice(0, 254),
      },
      cheque: {
        enabled: settings.accept_cheque !== false,
        payee: String(settings.cheque_payee || "").trim().slice(0, 200),
      },
      cash: { enabled: settings.accept_cash !== false },
      instructions: String(settings.payment_instructions || "").trim().slice(0, 2000),
    },
  };
}

function normalizedDocumentPaymentTerms(row: QuoteRow, settings: Record<string, unknown>) {
  const data = rowData(row);
  if (documentTypeLabel(row) === "change order") {
    return {
      version: 2,
      deposit_required: false,
      kind: "none",
      percent: null,
      fixed_cents: null,
      currency: String(data.currency || "CAD").toUpperCase(),
      due: "after_acceptance",
    };
  }
  const explicit = data.payment_terms || data.paymentTerms;
  if (explicit && typeof explicit === "object" && Number((explicit as Record<string, unknown>).version || 0) >= 2) {
    const terms = explicit as Record<string, unknown>;
    const required = terms.deposit_required !== false && terms.kind !== "none";
    const explicitFixedCents = Math.max(0, Math.round(Number(terms.fixed_cents || 0)));
    const kind = terms.kind === "fixed" && explicitFixedCents > 0 ? "fixed" : (required ? "percent" : "none");
    return {
      version: 2,
      deposit_required: required,
      kind,
      percent: kind === "percent" ? Math.min(100, Math.max(1, Number(terms.percent || 50))) : null,
      fixed_cents: kind === "fixed" ? explicitFixedCents : null,
      currency: String(terms.currency || data.currency || "CAD").toUpperCase(),
      due: "after_acceptance",
    };
  }

  const style = data.style && typeof data.style === "object" ? data.style as Record<string, unknown> : {};
  const mode = String(style.depositMode || "auto");
  if (mode === "hide" || settings.accept_deposit === false) {
    return { version: 2, deposit_required: false, kind: "none", percent: null, fixed_cents: null, currency: String(data.currency || "CAD").toUpperCase(), due: "after_acceptance" };
  }
  const requestedKind = mode === "show"
    ? (style.depositKind === "fixed" ? "fixed" : "percent")
    : (settings.deposit_default_kind === "fixed" ? "fixed" : "percent");
  const fixedCents = Math.max(0, Math.round(Number(mode === "show" ? style.depositFixedCents : settings.deposit_default_fixed_cents) || 0));
  const kind = requestedKind === "fixed" && fixedCents > 0 ? "fixed" : "percent";
  return {
    version: 2,
    deposit_required: true,
    kind,
    percent: kind === "percent" ? Math.min(100, Math.max(1, Number(mode === "show" ? style.depositPercent : settings.deposit_default_pct) || 50)) : null,
    fixed_cents: kind === "fixed" ? fixedCents : null,
    currency: String(data.currency || "CAD").toUpperCase(),
    due: "after_acceptance",
  };
}

function acceptedDocumentTotalCents(row: QuoteRow) {
  const data = rowData(row);
  const raw = Number(row.total ?? data.grandTotal ?? data.total ?? 0);
  return Math.max(0, Math.round((Number.isFinite(raw) ? raw : 0) * 100));
}

function acceptedDepositDueCents(totalCents: number, terms: Record<string, unknown>) {
  if (terms.deposit_required === false || terms.kind === "none" || totalCents <= 0) return 0;
  if (terms.kind === "fixed") return Math.min(totalCents, Math.max(1, Number(terms.fixed_cents || 0)));
  return Math.min(totalCents, Math.max(1, Math.round(totalCents * Number(terms.percent || 50) / 100)));
}

function compactDocumentResult(row: QuoteRow) {
  const data = rowData(row);
  return {
    id: row.id,
    status: row.status || "",
    type: row.type || data.documentType || data.type || "quote",
    total: row.total || 0,
    updated_at: row.updated_at || null,
    accepted_at: row.accepted_at || data.accepted_at || null,
    accepted_by: row.accepted_by || data.accepted_by || data.signed_by || null,
    signed_at: data.signed_at || data.approved_at || data.accepted_at || row.accepted_at || null,
    terms_accepted_at: data.terms_accepted_at || null,
  };
}

function sanitizePortalJobAssetRow(row: PortalJobAssetRow, urls: Record<string, string>) {
  return {
    id: row.id,
    user_id: row.user_id,
    portal_id: row.portal_id,
    job_folder_id: row.job_folder_id,
    quote_id: row.quote_id || null,
    kind: row.kind,
    title: row.title || (row.kind === "photo" ? "Project photo" : "Project file"),
    mime_type: row.mime_type || "",
    size_bytes: row.size_bytes || 0,
    original_size_bytes: row.original_size_bytes || 0,
    visible_to_client: row.visible_to_client !== false,
    metadata: row.metadata || {},
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    signed_url: urls.storage_path || "",
    thumbnail_signed_url: urls.thumbnail_path || "",
  };
}

function sanitizePortalDocumentEventRow(row: PortalDocumentEventRow) {
  return {
    id: row.id,
    portal_id: row.portal_id || null,
    document_id: row.document_id,
    portal_anchor_id: row.portal_anchor_id || null,
    event_type: row.event_type,
    session_id: row.session_id,
    duration_seconds: row.duration_seconds || 0,
    metadata: row.metadata || {},
    created_at: row.created_at || null,
  };
}

function sanitizeSessionId(value: unknown) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 120);
}

function sanitizeDurationSeconds(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(parsed, 24 * 60 * 60));
}

function sanitizeEventMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).slice(0, 20).forEach(([key, raw]) => {
    const cleanKey = key.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 50);
    if (!cleanKey) return;
    if (typeof raw === "string") result[cleanKey] = raw.slice(0, 500);
    else if (typeof raw === "number" && Number.isFinite(raw)) result[cleanKey] = raw;
    else if (typeof raw === "boolean") result[cleanKey] = raw;
    else if (raw === null) result[cleanKey] = null;
  });
  return result;
}

function isTruthyFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAdminPreviewActivityRequest(body: Record<string, unknown>) {
  const rawMetadata = body.metadata;
  const metadata = rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
    ? rawMetadata as Record<string, unknown>
    : {};
  return isTruthyFlag(body.adminPreview)
    || isTruthyFlag(body.admin_preview)
    || isTruthyFlag(body.preview)
    || isTruthyFlag(body.admin)
    || isTruthyFlag(metadata.adminPreview)
    || isTruthyFlag(metadata.admin_preview)
    || isTruthyFlag(metadata.preview)
    || isTruthyFlag(metadata.admin);
}

async function fetchQuoteById(id: string) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as QuoteRow | null;
}

async function fetchQuoteByShareToken(token: string) {
  if (!token) throw new Error("Missing secure portal token");
  const tokenHash = await sha256Hex(token);
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("public_share_token_hash", tokenHash)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as QuoteRow | null;
  return row && portalAnchorAvailable(row) ? row : null;
}

async function assertPortalAnchorAccess(documentId: string, token: string) {
  if (!documentId || !token) throw new Error("Missing secure portal token");
  const anchor = await fetchQuoteById(documentId);
  const tokenHash = await sha256Hex(token);
  if (anchor && portalAnchorAvailable(anchor) && anchor.public_share_token_hash === tokenHash) return anchor;
  throw new Error("Invalid or expired secure portal token");
}

async function assertTokenAccess(documentId: string, token: string, portalAnchorId?: string) {
  if (!documentId || !token) throw new Error("Missing secure document token");
  const target = await fetchQuoteById(documentId);
  if (!target) throw new Error("Document not found");
  const tokenHash = await sha256Hex(token);

  if (portalVisible(target) && target.public_share_token_hash === tokenHash) {
    return { target, anchor: target };
  }

  const anchorId = normalizeId(portalAnchorId);
  if (anchorId && anchorId !== documentId) {
    const anchor = await fetchQuoteById(anchorId);
    if (
      anchor &&
      portalAnchorAvailable(anchor) &&
      anchor.public_share_token_hash === tokenHash &&
      samePortalGroup(anchor, target) &&
      (target.id === anchor.id || portalVisible(target))
    ) {
      return { target, anchor };
    }
  }

  throw new Error("Invalid or expired secure document token");
}

async function createLink(req: Request, body: Record<string, unknown>) {
  let access;
  try {
    access = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.QUOTES_SEND);
  } catch (error) {
    if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
    throw error;
  }

  const documentId = normalizeId(body.documentId || body.id);
  const mode = String(body.mode || "portal").trim().toLowerCase();
  if (!documentId) return json({ error: "Missing document id" }, 400);
  if (mode !== "portal") {
    return json({
      error: "Standalone document links are retired. Share this document through its client portal.",
      code: "portal_required",
    }, 400);
  }

  const row = await fetchQuoteById(documentId);
  if (!row || row.user_id !== access.ownerUserId) return json({ error: "Document not found" }, 404);
  if (!portalVisible(row)) {
    return json({
      error: "Add this document to a client portal before creating its share link.",
      code: "portal_assignment_required",
    }, 409);
  }

  const baseUrl = String(body.baseUrl || "").trim();
  if (!isPortalShareBaseUrl(baseUrl)) {
    return json({
      error: "Client share links must open the QuoteDr client portal.",
      code: "portal_url_required",
    }, 400);
  }

  const token = createShareToken(16);
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date().toISOString();
  const nextData = {
    ...rowData(row),
    portal_share_token: token,
    portal_share_anchor_id: row.id,
    portal_share_created_at: createdAt,
  };
  const supabase = adminClient();
  let updateQuery = supabase
    .from("quotes")
    .update({
      data: nextData,
      public_share_token_hash: tokenHash,
      public_share_token_created_at: createdAt,
      public_share_token_last4: token.slice(-4),
      updated_at: createdAt,
    })
    .eq("id", row.id)
    .eq("user_id", access.ownerUserId);
  if (row.updated_at) updateQuery = updateQuery.eq("updated_at", row.updated_at);
  const { data: updatedRow, error } = await updateQuery.select("id").maybeSingle();
  if (error) throw error;
  if (!updatedRow) {
    return json({
      error: "The document changed while its portal link was being prepared. Refresh and try again.",
      code: "document_changed",
    }, 409);
  }

  const params = new URLSearchParams({ id: row.id, token });
  params.set("portal_anchor", row.id);
  const url = baseUrl ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}` : "";

  return json({
    id: row.id,
    token,
    mode: "portal",
    portalAnchorId: row.id,
    createdAt,
    url,
  });
}

function changeOrderParentId(row: QuoteRow) {
  const data = rowData(row);
  return normalizeId(row.parent_quote_id || data.parentQuoteId || data.parent_quote_id);
}

function changeOrderSequence(row: QuoteRow) {
  const data = rowData(row);
  return Number(row.change_order_number ?? data.changeOrderNumber ?? data.change_order_number ?? 0) || 0;
}

function authoritativeRowTotal(row: QuoteRow | null | undefined) {
  if (!row) return 0;
  const data = rowData(row);
  const value = Number(row.total ?? data.grandTotal ?? data.total ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function loadAuthoritativeChangeOrderContext(row: QuoteRow) {
  if (documentTypeLabel(row) !== "change order") return null;
  const parentId = changeOrderParentId(row);
  if (!parentId) return null;
  const supabase = adminClient();
  const [parentResult, siblingResult] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", parentId).eq("user_id", row.user_id).maybeSingle(),
    supabase.from("quotes").select("*").eq("parent_quote_id", parentId).eq("user_id", row.user_id),
  ]);
  if (parentResult.error) throw parentResult.error;
  let siblingData = siblingResult.data;
  if (siblingResult.error) {
    const fallback = await supabase
      .from("quotes")
      .select("*")
      .eq("user_id", row.user_id)
      .contains("data", { parentQuoteId: parentId });
    if (fallback.error) throw fallback.error;
    siblingData = fallback.data;
  }
  const parent = parentResult.data as QuoteRow | null;
  const siblings = (siblingData as QuoteRow[] || []).filter((candidate) => documentTypeLabel(candidate) === "change order");
  const currentSequence = changeOrderSequence(row) || Number.MAX_SAFE_INTEGER;
  const approved = siblings.filter((candidate) => String(candidate.status || rowData(candidate).status || "").toLowerCase() === "approved");
  const previousApproved = approved.filter((candidate) => candidate.id !== row.id && changeOrderSequence(candidate) < currentSequence);
  const parentTotal = authoritativeRowTotal(parent);
  const previousApprovedTotal = previousApproved.reduce((sum, candidate) => sum + authoritativeRowTotal(candidate), 0);
  const allApprovedTotal = approved.filter((candidate) => candidate.id !== row.id).reduce((sum, candidate) => sum + authoritativeRowTotal(candidate), 0);
  const parentStyle = parent ? sanitizeClientDocumentStyle(rowData(parent).style) : {};
  const projectRows = [parent, ...siblings].filter(Boolean) as QuoteRow[];
  const projectDocumentIds = projectRows.map((candidate) => candidate.id);
  let projectPaidCents = projectRows.reduce((sum, candidate) => sum + legacyUnlinkedPaidCents(candidate), 0);
  if (projectDocumentIds.length) {
    const { data: paymentRows, error: paymentError } = await supabase
      .from("payment_records")
      .select("amount_cents")
      .in("quote_id", projectDocumentIds)
      .in("status", ["paid", "confirmed"]);
    if (paymentError) throw paymentError;
    projectPaidCents += (paymentRows || []).reduce((sum, payment) => sum + Math.max(0, Math.round(Number(payment.amount_cents || 0))), 0);
  }
  return {
    parentTotal,
    previousApprovedTotal,
    allApprovedTotal,
    projectPaidCents,
    publicContext: {
      parent: parent ? { id: parent.id, data: { style: parentStyle } } : null,
      parentTotal,
      previousApprovedTotal,
      allApprovedTotal,
      projectPaidCents,
    },
  };
}

async function viewDocument(body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const portalAnchorId = normalizeId(body.portalAnchorId || body.portal_anchor);
  const { target } = await assertTokenAccess(documentId, token, portalAnchorId);
  const [paymentOptions, branding, changeOrderContext] = await Promise.all([
    loadPaymentOptions(target),
    documentNeedsBrandingFallback(target)
      ? loadDocumentBrandingFallback(target.user_id)
      : Promise.resolve(null),
    loadAuthoritativeChangeOrderContext(target),
  ]);
  const document = sanitizeQuoteRow(target, {
    changeOrderContext,
    parentTotal: changeOrderContext?.parentTotal,
    previousApprovedTotal: changeOrderContext?.previousApprovedTotal,
  });
  if (changeOrderContext?.publicContext && document.data && typeof document.data === "object") {
    (document.data as Record<string, unknown>).changeOrderContext = changeOrderContext.publicContext;
  }
  return json({ document, paymentOptions, branding });
}

async function portalDocuments(body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const anchor = documentId
    ? await assertPortalAnchorAccess(documentId, token)
    : await fetchQuoteByShareToken(token);
  if (!anchor) throw new Error("Invalid or expired secure portal token");
  const supabase = adminClient();
  let query = supabase
    .from("quotes")
    .select("*")
    .eq("user_id", anchor.user_id)
    .neq("quote_number", "__ITEMS_BACKUP__")
    .order("created_at", { ascending: false });
  const activePortalId = portalId(anchor);
  if (activePortalId) query = query.eq("data->>portal_id", activePortalId);
  const [{ data, error }, branding] = await Promise.all([
    query,
    loadPortalBranding(anchor.user_id),
  ]);
  if (error) throw error;
  const docs = (data as QuoteRow[] || [])
    .filter((row) => portalVisible(row) && samePortalGroup(anchor, row))
    .map((row) => sanitizeQuoteRow(row));
  const anchorData = rowData(anchor);
  return json({
    anchor: portalVisible(anchor) ? compactDocumentResult(anchor) : { id: anchor.id },
    anchorId: anchor.id,
    contractorId: anchor.user_id,
    portalId: activePortalId,
    portal: {
      name: String(anchorData.portal_name || displayQuoteName(anchor) || "Client Portal").trim().slice(0, 200),
      clientName: displayQuoteName(anchor).slice(0, 200),
      theme: sanitizePublicPortalTheme(anchorData.portal_theme),
    },
    documents: docs,
    branding,
  });
}

async function signedStorageUrl(path: string | null | undefined) {
  if (!path) return "";
  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from("portal-job-assets")
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || "";
}

async function isOwnerRequest(req: Request, userId: string) {
  const signedInUser = await userFromAuthHeader(req);
  return !!signedInUser?.id && signedInUser.id === userId;
}

async function portalAssets(req: Request, body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const anchor = await assertPortalAnchorAccess(documentId, token);
  const anchorPortalId = portalId(anchor);
  if (!anchorPortalId) return json({ assets: [] });

  const includePrivate = await isOwnerRequest(req, anchor.user_id);
  const supabase = adminClient();
  let query = supabase
    .from("portal_job_assets")
    .select("*")
    .eq("user_id", anchor.user_id)
    .eq("portal_id", anchorPortalId)
    .order("created_at", { ascending: false });

  if (!includePrivate) query = query.eq("visible_to_client", true);

  const { data, error } = await query;
  if (error) throw error;

  const assets = await Promise.all((data as PortalJobAssetRow[] || []).map(async (row) => {
    const [storageUrl, thumbnailUrl] = await Promise.all([
      signedStorageUrl(row.storage_path),
      signedStorageUrl(row.thumbnail_path),
    ]);
    return sanitizePortalJobAssetRow(row, {
      storage_path: storageUrl,
      thumbnail_path: thumbnailUrl,
    });
  }));

  return json({ assets, expiresIn: 60 * 60 });
}

async function portalAssetUrl(req: Request, body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const assetId = normalizeId(body.assetId || body.asset_id);
  const preferThumbnail = body.thumbnail === true;
  if (!assetId) return json({ error: "Missing asset id" }, 400);

  const anchor = await assertPortalAnchorAccess(documentId, token);
  const includePrivate = await isOwnerRequest(req, anchor.user_id);
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("portal_job_assets")
    .select("*")
    .eq("id", assetId)
    .eq("user_id", anchor.user_id)
    .eq("portal_id", portalId(anchor))
    .maybeSingle();
  if (error) throw error;
  const asset = data as PortalJobAssetRow | null;
  if (!asset || (!includePrivate && asset.visible_to_client === false)) {
    return json({ error: "Asset not found" }, 404);
  }

  const url = await signedStorageUrl(preferThumbnail && asset.thumbnail_path ? asset.thumbnail_path : asset.storage_path);
  return json({ url, expiresIn: 60 * 60 });
}

async function logDocumentEvent(req: Request, body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const portalAnchorId = normalizeId(body.portalAnchorId || body.portal_anchor);
  const eventType = String(body.eventType || body.event_type || "").trim();
  if (!ALLOWED_DOCUMENT_EVENT_TYPES.has(eventType)) return json({ error: "Unsupported document activity event" }, 400);

  const { target, anchor } = await assertTokenAccess(documentId, token, portalAnchorId);
  if (isAdminPreviewActivityRequest(body)) {
    return json({ result: compactDocumentResult(target), event: null, skipped: "admin_preview_activity" });
  }

  const signedInUser = await userFromAuthHeader(req);
  if (signedInUser?.id && signedInUser.id === target.user_id) {
    return json({ result: compactDocumentResult(target), event: null, skipped: "owner_activity" });
  }

  const sessionId = sanitizeSessionId(body.sessionId || body.session_id);
  if (!sessionId) return json({ error: "Missing activity session id" }, 400);

  const activePortalId = portalId(anchor || target) || portalId(target) || null;
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("portal_document_events")
    .insert({
      user_id: target.user_id,
      portal_id: activePortalId || null,
      document_id: target.id,
      portal_anchor_id: normalizeId(anchor?.id || portalAnchorId) || null,
      event_type: eventType,
      session_id: sessionId,
      duration_seconds: sanitizeDurationSeconds(body.durationSeconds || body.duration_seconds),
      metadata: sanitizeEventMetadata(body.metadata),
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  const loggedEvent = data as PortalDocumentEventRow;
  if (eventType === "document_opened") {
    await recordClientActivity(supabase, target, "viewed", {
      metadata: {
        viewed_at: loggedEvent.created_at || new Date().toISOString(),
        source: "portal_document_event",
        portal_event_id: loggedEvent.id || "",
        session_id: sessionId,
        portal_id: activePortalId || "",
        portal_anchor_id: normalizeId(anchor?.id || portalAnchorId) || "",
      },
    });
  }
  return json({ event: sanitizePortalDocumentEventRow(loggedEvent), result: compactDocumentResult(target) });
}

async function documentActivity(req: Request, body: Record<string, unknown>) {
  const user = await userFromAuthHeader(req);
  if (!user) return json({ error: "Authentication required" }, 401);

  const documentId = normalizeId(body.documentId || body.id);
  if (!documentId) return json({ error: "Missing document id" }, 400);
  const row = await fetchQuoteById(documentId);
  if (!row || row.user_id !== user.id) return json({ error: "Document not found" }, 404);

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("portal_document_events")
    .select("*")
    .eq("user_id", user.id)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json({ events: ((data as PortalDocumentEventRow[]) || []).map(sanitizePortalDocumentEventRow) });
}

function clientDecisionBody(body: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(body, "dataPatch") || Object.prototype.hasOwnProperty.call(body, "topLevel")) {
    throw new ClientDocumentDecisionError(
      "Legacy full-document client updates are not supported. Refresh the secure document and try again.",
      "legacy_client_document_patch_rejected",
    );
  }
  return body.decision;
}

function cloneDocumentData(data: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(data || {})) as Record<string, unknown>;
}

function storeClientSelectionSummaries(
  data: Record<string, unknown>,
  summaries: Record<string, unknown[]>,
  submittedAt: string,
) {
  data._clientUpgrades = summaries.upgrades || [];
  data._clientRemovals = summaries.removals || [];
  data._clientOptionalSelections = summaries.optionalSelections || [];
  data._clientChoiceGroups = summaries.choiceGroups || [];
  data._clientEnhancements = summaries.enhancements || [];
  data._clientItemUpgradeSelections = summaries.itemUpgradeSelections || [];
  data._clientConsultationRequests = summaries.consultationRequests || [];
  data._clientSubmittedAt = submittedAt;
}

function applyTypedSignature(
  data: Record<string, unknown>,
  signature: Record<string, unknown>,
  signerName: string,
  now: string,
  invoiceAcknowledgement = false,
) {
  const evidenceUrl = String(signature.evidenceUrl || "").trim();
  const evidenceDataUrl = String(signature.evidenceDataUrl || "").trim();
  data.signature_method = "typed";
  data.signature_text = signerName;
  data.signed_by = signerName;
  data.signed_at = now;
  data.accepted_by = signerName;
  data.accepted_at = now;
  data.terms_accepted = true;
  data.terms_accepted_at = now;
  if (evidenceUrl) {
    data.signature_url = evidenceUrl;
    delete data.signature_data_url;
  } else {
    data.signature_data_url = evidenceDataUrl;
    delete data.signature_url;
  }
  if (invoiceAcknowledgement) {
    data.invoice_acknowledged = true;
    data.invoice_acknowledged_at = now;
  } else {
    data.approved_by = signerName;
    data.approved_at = now;
  }
}

async function updateDocument(req: Request, body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const portalAnchorId = normalizeId(body.portalAnchorId || body.portal_anchor);
  const action = String(body.updateAction || body.actionName || "").trim();
  const { target } = await assertTokenAccess(documentId, token, portalAnchorId);
  const signedInUser = await userFromAuthHeader(req);

  const supabase = adminClient();
  const existingData = rowData(target);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  let activityDecision: Record<string, unknown> | null = null;
  let activitySignerName = "";
  let activityStatus = "";

  if (action === "mark_viewed") {
    if (signedInUser?.id && signedInUser.id === target.user_id) {
      return json({ result: compactDocumentResult(target), unchanged: true, skipped: "owner_view" });
    }
    if (!target.status || ["draft", "sent"].includes(String(target.status))) {
      update.status = "viewed";
      update.viewed_at = now;
      update.data = { ...existingData, status: "viewed", viewed_at: now };
    }
  } else if (action === "client_update") {
    if (documentTypeLabel(target) === "invoice") return json({ error: "Invoice updates require the invoice signature action" }, 400);
    const rawDecision = clientDecisionBody(body);
    const requestedStatusHint = rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision)
      ? String((rawDecision as Record<string, unknown>).status || "").toLowerCase()
      : "";
    const applied = applyClientDocumentDecision(existingData, rawDecision, { applySelections: !!requestedStatusHint });
    const decision = applied.decision as unknown as Record<string, unknown>;
    const requestedStatus = String(decision.status || "").toLowerCase();
    const signature = decision.signature && typeof decision.signature === "object"
      ? decision.signature as Record<string, unknown>
      : null;
    const signerName = String(signature?.signerName || "").trim().slice(0, 200);
    activityDecision = decision;
    activitySignerName = signerName;
    activityStatus = requestedStatus;

    if (requestedStatus) {
      const expectedStatus = documentTypeLabel(target) === "change order" ? "approved" : "accepted";
      if (requestedStatus !== expectedStatus) return json({ error: `This document must be ${expectedStatus}` }, 400);
      if (!signature) return json({ error: "Typed signature evidence is required" }, 400);
      const signerValidation = validateTypedSigner(target, signerName);
      if (!signerValidation.hasClientName) return json({ error: "This document does not have a client name to verify" }, 400);
      if (!signerValidation.hasFullName) return json({ error: "Enter the client's full name" }, 400);
      if (!signerValidation.valid) return json({ error: "Signer name does not match the client name on this document" }, 400);
      const documentStatus = String(target.status || existingData.status || "").toLowerCase();
      const validity = String(existingData.document_validity || existingData.documentValidity || "").toLowerCase();
      if (documentStatus === "voided" || ["voided", "invalid", "superseded"].includes(validity)) {
        return json({ error: "This document is no longer valid" }, 409);
      }
    } else if (signature) {
      return json({ error: "A signature may only be submitted with an acceptance decision" }, 400);
    }

    const merged = applied.data as Record<string, unknown>;
    storeClientSelectionSummaries(merged, applied.summaries as Record<string, unknown[]>, now);
    if (!requestedStatus) {
      merged._clientDecision = clientDecisionForStorage(decision);
      update.data = merged;
    } else {
      if (applied.changed && !Array.isArray(merged.original_rooms)) {
        merged.original_rooms = cloneDocumentData(existingData).rooms || [];
      }
      delete merged._clientDecision;
      merged.client_upgraded = applied.changed === true || existingData.client_upgraded === true;
      if (merged.client_upgraded) merged.client_upgraded_at = now;

      const changeOrderContext = await loadAuthoritativeChangeOrderContext(target);
      const totals = calculateClientDocumentTotals(merged, {
        documentType: target.type,
        parentTotal: changeOrderContext?.parentTotal,
        previousApprovedTotal: changeOrderContext?.previousApprovedTotal,
      });
      const authoritativeTotal = Number(totals.documentTotal || 0);
      merged.subtotal = totals.subtotal;
      merged.taxAmount = totals.tax;
      merged.grandTotal = authoritativeTotal;
      merged.total = authoritativeTotal;
      if (documentTypeLabel(target) === "change order") {
        merged.parentQuoteTotal = totals.parentTotal;
        merged.changeOrderPreviousApprovedTotal = totals.previousApprovedTotal;
        merged.changeOrderPriceSummary = {
          ...(merged.changeOrderPriceSummary && typeof merged.changeOrderPriceSummary === "object"
            ? merged.changeOrderPriceSummary as Record<string, unknown>
            : {}),
          originalTotal: totals.parentTotal,
          previousApprovedTotal: totals.previousApprovedTotal,
          addedSubtotal: totals.addedSubtotal,
          creditSubtotal: totals.creditSubtotal,
          netSubtotal: totals.taxableSubtotal,
          tax: totals.tax,
          netChange: totals.documentTotal,
          updatedTotal: totals.updatedTotal,
          taxLabel: totals.taxLabel,
          taxRate: totals.taxRate,
          taxEnabled: totals.taxEnabled,
        };
      }

      const { data: settingsRow } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", target.user_id)
        .eq("key", "payment_settings")
        .maybeSingle();
      const settings = settingsRow?.value && typeof settingsRow.value === "object"
        ? settingsRow.value as Record<string, unknown>
        : {};
      const acceptedRow = { ...target, total: authoritativeTotal, data: merged } as QuoteRow;
      const terms = normalizedDocumentPaymentTerms(acceptedRow, settings);
      const acceptedTotalCents = acceptedDocumentTotalCents(acceptedRow);
      merged.status = requestedStatus;
      merged.payment_terms = terms;
      merged.accepted_total_cents = acceptedTotalCents;
      merged.deposit_due_cents = acceptedDepositDueCents(acceptedTotalCents, terms);
      merged.accepted_at = now;
      merged.terms_accepted_snapshot = Array.isArray(existingData.terms) ? existingData.terms.slice(0, 100) : [];
      if (!signature) return json({ error: "Typed signature evidence is required" }, 400);
      applyTypedSignature(merged, signature, signerName, now, false);
      update.status = requestedStatus;
      update.accepted_at = now;
      update.accepted_by = signerName;
      update.total = authoritativeTotal;
      update.data = merged;
    }
  } else if (action === "record_signature") {
    if (documentTypeLabel(target) !== "invoice") return json({ error: "Invoice signature action requires an invoice" }, 400);
    const documentStatus = String(target.status || existingData.status || "").toLowerCase();
    const validity = String(existingData.document_validity || existingData.documentValidity || "").toLowerCase();
    if (documentStatus === "voided" || ["voided", "invalid", "superseded"].includes(validity)) {
      return json({ error: "This document is no longer valid" }, 409);
    }
    const alreadySigned = existingData.invoice_acknowledged === true || !!(
      (existingData.signature_url || existingData.signature_data_url) &&
      (existingData.signed_at || existingData.invoice_acknowledged_at) &&
      (existingData.signed_by || existingData.signature_text)
    );
    if (alreadySigned) return json({ result: compactDocumentResult(target), unchanged: true, alreadySigned: true });
    const applied = applyClientDocumentDecision(existingData, clientDecisionBody(body), { applySelections: false });
    const decision = applied.decision as unknown as Record<string, unknown>;
    if (decision.status || (Array.isArray(decision.items) && decision.items.length) || Object.keys(decision.roomNotes || {}).length) {
      return json({ error: "Invoice signatures may only submit signature evidence" }, 400);
    }
    const signature = decision.signature && typeof decision.signature === "object"
      ? decision.signature as Record<string, unknown>
      : null;
    if (!signature) return json({ error: "Typed signature evidence is required" }, 400);
    const signerName = String(signature.signerName || "").trim().slice(0, 200);
    const signerValidation = validateTypedSigner(target, signerName);
    if (!signerValidation.hasClientName) return json({ error: "This invoice does not have a client name to verify" }, 400);
    if (!signerValidation.hasFullName) return json({ error: "Enter the client's full name" }, 400);
    if (!signerValidation.valid) return json({ error: "Signer name does not match the client name on this invoice" }, 400);
    const merged = cloneDocumentData(existingData);
    merged.terms_accepted_snapshot = Array.isArray(existingData.terms) ? existingData.terms.slice(0, 100) : [];
    applyTypedSignature(merged, signature, signerName, now, true);
    update.accepted_at = now;
    update.accepted_by = signerName;
    update.data = merged;
    activityDecision = decision;
    activitySignerName = signerName;
  } else if (action === "decline_change_order") {
    if (documentTypeLabel(target) !== "change order") return json({ error: "Only change orders may be declined" }, 400);
    const applied = applyClientDocumentDecision(existingData, clientDecisionBody(body), { applySelections: false });
    const decision = applied.decision as unknown as Record<string, unknown>;
    if (decision.status || decision.signature || (Array.isArray(decision.items) && decision.items.length) || Object.keys(decision.roomNotes || {}).length) {
      return json({ error: "A decline decision cannot include document changes" }, 400);
    }
    const merged = cloneDocumentData(existingData);
    merged.status = "declined";
    merged.declined_at = now;
    update.status = "declined";
    update.data = merged;
    activityDecision = decision;
    activityStatus = "declined";
  } else {
    return json({ error: "Unsupported client document update" }, 400);
  }

  if (!Object.prototype.hasOwnProperty.call(update, "data")) {
    if (action === "mark_viewed") {
      await recordClientActivity(supabase, target, "viewed", {
        metadata: {
          viewed_at: now,
          unchanged: true,
          unchanged_status: String(target.status || ""),
        },
      });
    }
    return json({ result: compactDocumentResult(target), unchanged: true });
  }

  const { error } = await supabase
    .from("quotes")
    .update(update)
    .eq("id", target.id)
    .eq("user_id", target.user_id);
  if (error) throw error;
  const updatedRow = { ...target, ...update } as QuoteRow;

  if (action === "mark_viewed") {
    await recordClientActivity(supabase, updatedRow, "viewed", { metadata: { viewed_at: now } });
  } else if (action === "client_update") {
    if (activityStatus === "accepted" || activityStatus === "approved") {
      await recordClientActivity(supabase, updatedRow, activityStatus === "approved" ? "approved" : "accepted", {
        metadata: { signed_at: now, accepted_by: activitySignerName },
      });
    }
    const noteMessage = detectClientNoteActivity(activityDecision);
    if (noteMessage) {
      await recordClientActivity(supabase, updatedRow, "note_added", {
        message: noteMessage,
        metadata: { submitted_at: now },
      });
    }
  } else if (action === "record_signature") {
    await recordClientActivity(supabase, updatedRow, "accepted", {
      metadata: {
        signed_at: now,
        accepted_by: activitySignerName,
        signature_method: "typed",
        signature_action: "invoice_acknowledgement",
      },
    });
  } else if (action === "decline_change_order") {
    await recordClientActivity(supabase, updatedRow, "declined", { metadata: { declined_at: now } });
  }

  return json({ result: compactDocumentResult(updatedRow) });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    if (action === "create_link") return await createLink(req, body);
    if (action === "view") return await viewDocument(body);
    if (action === "portal") return await portalDocuments(body);
    if (action === "portal_assets") return await portalAssets(req, body);
    if (action === "portal_asset_url") return await portalAssetUrl(req, body);
    if (action === "log_event") return await logDocumentEvent(req, body);
    if (action === "document_activity") return await documentActivity(req, body);
    if (action === "update") return await updateDocument(req, body);
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("client-document error:", error);
    if (error instanceof ClientDocumentDecisionError) return json({ error: error.message, code: error.code }, 400);
    return json({ error: error instanceof Error ? error.message : "Secure document request failed" }, 400);
  }
});
