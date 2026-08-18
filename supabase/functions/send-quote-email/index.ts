import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  requireAccountPermissionWithDefault,
} from "../_shared/account-authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PORTAL_EMAIL_KINDS = new Set([
  "portal_quote",
  "portal_invoice",
  "portal_change_order",
  "portal_followup",
]);

function isQuoteDrPortalUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "quotedr.io" && host !== "www.quotedr.io") || (url.port && url.port !== "443")) return false;
    if (["admin", "view", "theme_studio"].some((name) => ["1", "true", "admin", "studio"].includes(String(url.searchParams.get(name) || "").toLowerCase()))) return false;
    if (/^\/p\/[^/?#]+\/?$/i.test(url.pathname)) return true;
    if (!/^\/client-portal(?:\.html)?\/?$/i.test(url.pathname)) return false;
    return !!(url.searchParams.get("token") || url.searchParams.get("p"));
  } catch (_) {
    return false;
  }
}

function isExternalReviewUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (_) {
    return false;
  }
}

function portalTokenFromUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    const shortMatch = url.pathname.match(/^\/p\/([^/?#]+)\/?$/i);
    return String(shortMatch ? decodeURIComponent(shortMatch[1]) : (url.searchParams.get("token") || url.searchParams.get("p") || "")).trim();
  } catch (_) {
    return "";
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function portalLinkBelongsToAccount(service: any, ownerUserId: string, value: unknown) {
  const token = portalTokenFromUrl(value);
  if (!/^[a-zA-Z0-9_-]{16,200}$/.test(token)) return false;
  const tokenHash = await sha256Hex(token);
  const result = await service
    .from("quotes")
    .select("id,data")
    .eq("user_id", ownerUserId)
    .eq("public_share_token_hash", tokenHash)
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row || !row.data || (row.data.portal_visible !== true && row.data.portal_anchor_only !== true)) return false;
  const url = new URL(String(value));
  const requestedAnchor = String(url.searchParams.get("portal_anchor") || url.searchParams.get("id") || "").trim();
  return !requestedAnchor || requestedAnchor === String(row.id);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function payloadHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await auth.auth.getUser(authHeader.slice(7));
  return error ? null : data.user;
}

async function claimEmailOperation(service: any, userId: string, idempotencyKey: string, hash: string) {
  const now = new Date().toISOString();
  const inserted = await service.from("external_operation_receipts").insert({
    idempotency_key: idempotencyKey,
    user_id: userId,
    operation_type: "send_quote_email",
    payload_hash: hash,
    status: "processing",
    created_at: now,
    updated_at: now,
  });
  if (!inserted.error) return { claimed: true, response: null };
  if (inserted.error.code !== "23505") throw inserted.error;
  const existing = await service.from("external_operation_receipts").select("*").eq("idempotency_key", idempotencyKey).eq("user_id", userId).single();
  if (existing.error || !existing.data) throw existing.error || new Error("Could not verify the email request");
  if (existing.data.payload_hash !== hash) throw new Error("This email request key was already used for different content");
  if (existing.data.status === "completed") return { claimed: false, response: existing.data.response || { success: true } };
  if (existing.data.status === "processing") {
    const stale = Date.now() - new Date(existing.data.updated_at || existing.data.created_at).getTime() > 2 * 60 * 1000;
    if (!stale) return { claimed: false, processing: true, response: null };
    const reclaimedStale = await service.from("external_operation_receipts")
      .update({ attempts: Number(existing.data.attempts || 0) + 1, updated_at: now })
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "processing")
      .eq("updated_at", existing.data.updated_at)
      .select("idempotency_key")
      .maybeSingle();
    return { claimed: !!reclaimedStale.data, processing: !reclaimedStale.data, response: null };
  }
  const reclaimed = await service.from("external_operation_receipts")
    .update({ status: "processing", attempts: Number(existing.data.attempts || 0) + 1, last_error: "", updated_at: now })
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "failed")
    .select("idempotency_key")
    .maybeSingle();
  return { claimed: !!reclaimed.data, processing: !reclaimed.data, response: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let service: any = null;
  let operationKey = "";
  try {
    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Email idempotency service is not configured" }, 500);
    service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const requestBody = await req.json();
    let access;
    try {
      access = await requireAccountPermissionWithDefault(req, requestBody.accountId, ACCOUNT_PERMISSION.QUOTES_SEND);
    } catch (error) {
      if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
      throw error;
    }
    const accountOwnerId = access.ownerUserId;
    const {
      to, clientName, contractorName, companyName, quoteNumber, total, quoteUrl: requestedQuoteUrl, message, isInvoice,
      emailSubject, emailIntro, emailButtonText, portalUrl, emailReplyTo, emailFooter, idempotencyKey,
      emailKind, documentType
    } = requestBody;
    operationKey = String(idempotencyKey || "").trim();

    const normalizedEmailKind = String(emailKind || "").trim().toLowerCase();
    const isPortalEmail = PORTAL_EMAIL_KINDS.has(normalizedEmailKind);
    const isReviewEmail = normalizedEmailKind === "google_review";
    if (!isPortalEmail && !isReviewEmail) {
      return json({ error: "Missing or invalid email kind" }, 400);
    }

    const primaryUrl = String(isPortalEmail ? (portalUrl || requestedQuoteUrl) : requestedQuoteUrl || "").trim();
    if (isPortalEmail && !isQuoteDrPortalUrl(primaryUrl)) {
      return json({ error: "QuoteDr document emails must use a secure client portal link" }, 400);
    }
    if (isPortalEmail && !await portalLinkBelongsToAccount(service, accountOwnerId, primaryUrl)) {
      return json({ error: "The client portal link is invalid, removed, or belongs to another account" }, 403);
    }
    if (isReviewEmail && !isExternalReviewUrl(primaryUrl)) {
      return json({ error: "Review request link must be a valid web URL" }, 400);
    }

    if (!to || !primaryUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, portal link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!/^[a-zA-Z0-9_-]{16,200}$/.test(operationKey)) return json({ error: "Missing or invalid idempotency key" }, 400);

    const hashBody = { ...requestBody };
    delete hashBody.idempotencyKey;
    const hash = await payloadHash(hashBody);
    const claim = await claimEmailOperation(service, accountOwnerId, operationKey, hash);
    if (claim.response) return json({ ...claim.response, idempotentReplay: true });
    if (!claim.claimed) return json({ error: "This email request is already being processed. Check delivery before trying again." }, 409);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Email service not configured. Please add RESEND_API_KEY to Supabase secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const escapeHtml = (value: unknown) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const withBreaks = (value: unknown) => escapeHtml(value).replace(/\n/g, "<br>");

    const fromName = companyName || contractorName || "QuoteDr";
    const greeting = clientName ? `Hi ${clientName},` : "Hi there,";
    const requestedDocumentType = String(documentType || "").toLowerCase();
    const normalizedDocumentType = normalizedEmailKind === "portal_change_order" || requestedDocumentType === "change_order"
      ? "change_order"
      : (isInvoice || requestedDocumentType === "invoice" ? "invoice" : "quote");
    const documentTitle = normalizedDocumentType === "change_order" ? "Change Order" : (normalizedDocumentType === "invoice" ? "Invoice" : "Quote");
    const quoteRef = quoteNumber ? `${documentTitle} #${quoteNumber}` : `Your ${documentTitle}`;
    const totalStr = total ? `$${parseFloat(total).toFixed(2)}` : "";
    const customMessage = message ? `<p style="color:#555; line-height:1.6;">${withBreaks(message)}</p>` : "";

    const subject = emailSubject
      ? String(emailSubject).replace("{quoteRef}", quoteRef).replace("{company}", fromName).replace("{total}", totalStr)
      : `${quoteRef} from ${fromName}${totalStr ? " - " + totalStr : ""}`;

    const introParagraph = emailIntro
      ? `<p style="color:#555; line-height:1.6; margin:0 0 24px;">${withBreaks(emailIntro)}</p>`
      : isPortalEmail
        ? `<p style="color:#555; line-height:1.6; margin:0 0 24px;">${escapeHtml(contractorName || fromName || "Your contractor")} has shared ${escapeHtml(quoteRef)}${totalStr ? ` for <strong>${escapeHtml(totalStr)}</strong>` : ""} in your secure client portal.</p>`
        : `<p style="color:#555; line-height:1.6; margin:0 0 24px;">${escapeHtml(contractorName || fromName || "Your contractor")} sent you this request.</p>`;

    const btnText = emailButtonText || (isPortalEmail ? "Open Client Portal" : "Open Link");
    const replyTo = emailReplyTo || undefined;
    const footerExtra = emailFooter ? `<br>${withBreaks(emailFooter)}` : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0f3460,#1a56a0); padding:32px 40px; text-align:center;">
          <div style="font-size:2rem; font-weight:800; color:white; letter-spacing:-1px;">${escapeHtml(fromName)}</div>
          <div style="color:rgba(255,255,255,0.8); font-size:0.9rem; margin-top:4px;">${escapeHtml(quoteRef)}</div>
        </td></tr>

        <tr><td style="padding:40px;">
          <p style="font-size:1.1rem; font-weight:600; color:#0f3460; margin:0 0 16px;">${escapeHtml(greeting)}</p>
          ${customMessage}
          ${introParagraph}

          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="${escapeHtml(primaryUrl)}" style="display:inline-block; background:#e87e2a; color:white; font-weight:700; font-size:1rem; padding:16px 40px; border-radius:50px; text-decoration:none; letter-spacing:0.3px;">
              ${escapeHtml(btnText)}
            </a>
          </td></tr></table>

          ${quoteNumber || totalStr ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa; border-radius:8px; margin-bottom:24px;">
            <tr><td style="padding:20px;">
              ${quoteNumber ? `<div style="margin-bottom:8px;"><span style="color:#999; font-size:0.85rem;">${escapeHtml(documentTitle)} Number</span><br><strong style="color:#333;">#${escapeHtml(quoteNumber)}</strong></div>` : ""}
              ${totalStr ? `<div><span style="color:#999; font-size:0.85rem;">Total</span><br><strong style="color:#0f3460; font-size:1.2rem;">${escapeHtml(totalStr)}</strong></div>` : ""}
            </td></tr>
          </table>` : ""}

          <p style="color:#999; font-size:0.8rem; margin:0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${escapeHtml(primaryUrl)}" style="color:#1a56a0; word-break:break-all;">${escapeHtml(primaryUrl)}</a>
          </p>
        </td></tr>

        <tr><td style="background:#f8f9fa; padding:20px 40px; text-align:center; border-top:1px solid #eee;">
          <p style="color:#aaa; font-size:0.75rem; margin:0;">
            Sent by ${escapeHtml(fromName)}${footerExtra}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <quotes@quotedr.io>`,
        to: [to],
        subject,
        html,
        reply_to: replyTo,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      await service.from("external_operation_receipts").update({ status: "failed", last_error: result.message || JSON.stringify(result), updated_at: new Date().toISOString() }).eq("idempotency_key", operationKey);
      throw new Error(result.message || JSON.stringify(result));
    }

    const success = { success: true, id: result.id };
    const completedAt = new Date().toISOString();
    const receipt = await service.from("external_operation_receipts").update({ status: "completed", response: success, completed_at: completedAt, updated_at: completedAt }).eq("idempotency_key", operationKey);
    if (receipt.error) throw receipt.error;
    return json(success);
  } catch (err) {
    if (service && operationKey) {
      await service.from("external_operation_receipts").update({ status: "failed", last_error: (err as Error).message, updated_at: new Date().toISOString() }).eq("idempotency_key", operationKey).eq("status", "processing");
    }
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
