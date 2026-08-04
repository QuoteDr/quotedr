import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

function clientNoteSummary(dataPatch: Record<string, unknown>) {
  const roomNotes = dataPatch._roomNotes;
  if (!roomNotes || typeof roomNotes !== "object" || Array.isArray(roomNotes)) return "";
  const snippets = Object.values(roomNotes as Record<string, unknown>)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!snippets.length) return "";
  const joined = snippets.join(" | ");
  return joined.length > 240 ? joined.slice(0, 237) + "..." : joined;
}

function detectClientNoteActivity(dataPatch: unknown) {
  if (!dataPatch || typeof dataPatch !== "object" || Array.isArray(dataPatch)) return "";
  return clientNoteSummary(dataPatch as Record<string, unknown>);
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

function sanitizeQuoteRow(row: QuoteRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    quote_number: row.quote_number || "",
    client_name: row.client_name || "",
    status: row.status || "",
    type: row.type || rowData(row).documentType || rowData(row).type || "quote",
    parent_quote_id: row.parent_quote_id || null,
    change_order_number: row.change_order_number || null,
    total: row.total || 0,
    data: row.data || {},
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadPaymentOptions(userId: string) {
  const supabase = adminClient();
  const [{ data: settingsRow }, { data: connectionRow }] = await Promise.all([
    supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "payment_settings").maybeSingle(),
    supabase.from("stripe_connected_accounts").select("status,charges_enabled,payouts_enabled,details_submitted").eq("user_id", userId).maybeSingle(),
  ]);
  const settings = settingsRow?.value && typeof settingsRow.value === "object"
    ? settingsRow.value as Record<string, unknown>
    : {};
  const connectionReady = connectionRow?.status === "ready" && connectionRow?.charges_enabled === true;
  const defaultPercent = Math.min(100, Math.max(1, Number(settings.deposit_default_pct || 50)));
  const defaultFixedCents = Math.max(0, Math.round(Number(settings.deposit_default_fixed_cents || 0)));
  const defaultKind = settings.deposit_default_kind === "fixed" && defaultFixedCents > 0 ? "fixed" : "percent";
  return {
    version: 2,
    deposit: {
      enabled: settings.accept_deposit !== false,
      defaultKind,
      defaultPercent,
      defaultFixedCents,
      due: "after_acceptance",
    },
    invoice: { fullPaymentEnabled: settings.accept_full_payment !== false },
    stripe: {
      enabled: settings.stripe_enabled === true,
      ready: settings.stripe_enabled === true && connectionReady,
      status: connectionRow?.status || "not_connected",
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
  return data as QuoteRow | null;
}

async function fetchQuoteOwnershipById(id: string) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id,user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Pick<QuoteRow, "id" | "user_id"> | null;
}

async function assertTokenAccess(documentId: string, token: string, portalAnchorId?: string) {
  if (!documentId || !token) throw new Error("Missing secure document token");
  const target = await fetchQuoteById(documentId);
  if (!target) throw new Error("Document not found");
  const tokenHash = await sha256Hex(token);

  if (target.public_share_token_hash === tokenHash) {
    return { target, anchor: target };
  }

  const anchorId = normalizeId(portalAnchorId);
  if (anchorId && anchorId !== documentId) {
    const anchor = await fetchQuoteById(anchorId);
    if (
      anchor &&
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
  const user = await userFromAuthHeader(req);
  if (!user) return json({ error: "Authentication required" }, 401);

  const documentId = normalizeId(body.documentId || body.id);
  const mode = String(body.mode || "document");
  if (!documentId) return json({ error: "Missing document id" }, 400);

  const row = await fetchQuoteOwnershipById(documentId);
  if (!row || row.user_id !== user.id) return json({ error: "Document not found" }, 404);

  const token = createShareToken(mode === "portal" ? 16 : 32);
  const tokenHash = await sha256Hex(token);
  const supabase = adminClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      public_share_token_hash: tokenHash,
      public_share_token_created_at: new Date().toISOString(),
      public_share_token_last4: token.slice(-4),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", user.id);
  if (error) throw error;

  const baseUrl = String(body.baseUrl || "").trim();
  const params = new URLSearchParams({ id: row.id, token });
  if (mode === "portal") params.set("portal_anchor", row.id);
  const url = baseUrl ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}` : "";

  return json({
    id: row.id,
    token,
    portalAnchorId: mode === "portal" ? row.id : "",
    url,
  });
}

async function viewDocument(body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const portalAnchorId = normalizeId(body.portalAnchorId || body.portal_anchor);
  const { target } = await assertTokenAccess(documentId, token, portalAnchorId);
  const paymentOptions = await loadPaymentOptions(target.user_id);
  return json({ document: sanitizeQuoteRow(target), paymentOptions });
}

async function portalDocuments(body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const anchor = documentId
    ? (await assertTokenAccess(documentId, token, documentId)).target
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
  const { data, error } = await query;
  if (error) throw error;
  const docs = (data as QuoteRow[] || [])
    .filter((row) => row.id === anchor.id || (portalVisible(row) && samePortalGroup(anchor, row)))
    .map(sanitizeQuoteRow);
  return json({
    anchor: compactDocumentResult(anchor),
    anchorId: anchor.id,
    contractorId: anchor.user_id,
    portalId: activePortalId,
    documents: docs,
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
  const { target: anchor } = await assertTokenAccess(documentId, token, documentId);
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

  const { target: anchor } = await assertTokenAccess(documentId, token, documentId);
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

function mergeSafeData(existing: Record<string, unknown>, patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return existing;
  return { ...existing, ...(patch as Record<string, unknown>) };
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

  if (action === "mark_viewed") {
    if (signedInUser?.id && signedInUser.id === target.user_id) {
      return json({ result: compactDocumentResult(target), unchanged: true, skipped: "owner_view" });
    }
    if (!target.status || ["draft", "sent"].includes(String(target.status))) {
      update.status = "viewed";
      update.viewed_at = now;
      update.data = mergeSafeData(existingData, { status: "viewed", viewed_at: now });
    }
  } else if (action === "client_update") {
    const topLevel = body.topLevel && typeof body.topLevel === "object" ? body.topLevel as Record<string, unknown> : {};
    const patch = body.dataPatch && typeof body.dataPatch === "object" ? body.dataPatch as Record<string, unknown> : {};
    const requestedStatus = typeof topLevel.status === "string" ? String(topLevel.status).toLowerCase() : "";
    if (requestedStatus && !["accepted", "approved"].includes(requestedStatus)) {
      return json({ error: "Unsupported client document status" }, 400);
    }
    const isTypedSignature = String(patch.signature_method || "").toLowerCase() === "typed";
    const signerName = String(topLevel.accepted_by || patch.signature_text || patch.signed_by || "").trim().slice(0, 200);
    if (requestedStatus && isTypedSignature) {
      const signerValidation = validateTypedSigner(target, signerName);
      if (!signerValidation.hasClientName) return json({ error: "This document does not have a client name to verify" }, 400);
      if (!signerValidation.hasFullName) return json({ error: "Enter the client's full name" }, 400);
      if (!signerValidation.valid) return json({ error: "Signer name does not match the client name on this document" }, 400);
      if (patch.terms_accepted !== true) return json({ error: "Terms agreement is required before signing" }, 400);
      if (!patch.signature_url && !patch.signature_data_url) return json({ error: "Typed signature evidence is missing" }, 400);
    }
    if (requestedStatus) update.status = requestedStatus;
    if (typeof topLevel.client_name === "string") update.client_name = topLevel.client_name;
    if (requestedStatus) update.accepted_at = now;
    if (signerName) update.accepted_by = signerName;
    const merged = mergeSafeData(existingData, patch);
    if (requestedStatus) {
      const documentStatus = String(target.status || existingData.status || "").toLowerCase();
      const validity = String(existingData.document_validity || existingData.documentValidity || "").toLowerCase();
      if (documentStatus === "voided" || ["voided", "invalid", "superseded"].includes(validity)) {
        return json({ error: "This document is no longer valid" }, 409);
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
      const terms = normalizedDocumentPaymentTerms(target, settings);
      const acceptedTotalCents = acceptedDocumentTotalCents(target);
      merged.status = requestedStatus;
      merged.payment_terms = terms;
      merged.accepted_total_cents = acceptedTotalCents;
      merged.deposit_due_cents = acceptedDepositDueCents(acceptedTotalCents, terms);
      merged.accepted_at = now;
    }
    if (requestedStatus && isTypedSignature) {
      merged.signature_method = "typed";
      merged.signature_text = signerName;
      merged.signed_by = signerName;
      merged.signed_at = now;
      merged.approved_by = signerName;
      merged.approved_at = now;
      merged.terms_accepted = true;
      merged.terms_accepted_at = now;
      merged.terms_accepted_snapshot = Array.isArray(existingData.terms) ? existingData.terms.slice(0, 100) : [];
    }
    update.data = merged;
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
    const patch = body.dataPatch && typeof body.dataPatch === "object" ? body.dataPatch as Record<string, unknown> : {};
    const signerName = String(patch.signature_text || patch.signed_by || "").trim().slice(0, 200);
    const signerValidation = validateTypedSigner(target, signerName);
    if (String(patch.signature_method || "").toLowerCase() !== "typed") return json({ error: "Typed signature evidence is required" }, 400);
    if (!signerValidation.hasClientName) return json({ error: "This invoice does not have a client name to verify" }, 400);
    if (!signerValidation.hasFullName) return json({ error: "Enter the client's full name" }, 400);
    if (!signerValidation.valid) return json({ error: "Signer name does not match the client name on this invoice" }, 400);
    if (patch.terms_accepted !== true) return json({ error: "Terms agreement is required before signing" }, 400);
    if (!patch.signature_url && !patch.signature_data_url) return json({ error: "Typed signature evidence is missing" }, 400);
    const merged = mergeSafeData(existingData, patch);
    merged.signature_method = "typed";
    merged.signature_text = signerName;
    merged.signed_by = signerName;
    merged.signed_at = now;
    merged.accepted_by = signerName;
    merged.accepted_at = now;
    merged.terms_accepted = true;
    merged.terms_accepted_at = now;
    merged.terms_accepted_snapshot = Array.isArray(existingData.terms) ? existingData.terms.slice(0, 100) : [];
    merged.invoice_acknowledged = true;
    merged.invoice_acknowledged_at = now;
    update.accepted_at = now;
    update.accepted_by = signerName;
    update.data = merged;
  } else if (action === "decline_change_order") {
    update.status = "declined";
    update.data = mergeSafeData(existingData, {
      ...(body.dataPatch && typeof body.dataPatch === "object" ? body.dataPatch as Record<string, unknown> : {}),
      status: "declined",
      declined_at: now,
    });
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
    const topLevel = body.topLevel && typeof body.topLevel === "object" ? body.topLevel as Record<string, unknown> : {};
    const patch = body.dataPatch && typeof body.dataPatch === "object" ? body.dataPatch as Record<string, unknown> : {};
    const status = String(topLevel.status || patch.status || "").toLowerCase();
    if (status === "accepted" || status === "approved") {
      await recordClientActivity(supabase, updatedRow, status === "approved" ? "approved" : "accepted", {
        metadata: { signed_at: now, accepted_by: topLevel.accepted_by || "" },
      });
    }
    const noteMessage = detectClientNoteActivity(body.dataPatch);
    if (noteMessage) {
      await recordClientActivity(supabase, updatedRow, "note_added", {
        message: noteMessage,
        metadata: { submitted_at: now },
      });
    }
  } else if (action === "record_signature") {
    const patch = body.dataPatch && typeof body.dataPatch === "object" ? body.dataPatch as Record<string, unknown> : {};
    await recordClientActivity(supabase, updatedRow, "accepted", {
      metadata: {
        signed_at: now,
        accepted_by: patch.signature_text || patch.signed_by || "",
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
    return json({ error: error instanceof Error ? error.message : "Secure document request failed" }, 400);
  }
});
