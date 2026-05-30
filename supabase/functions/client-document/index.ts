import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  public_share_token_hash?: string | null;
};

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

function createShareToken() {
  const bytes = new Uint8Array(32);
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

  const row = await fetchQuoteById(documentId);
  if (!row || row.user_id !== user.id) return json({ error: "Document not found" }, 404);

  const token = createShareToken();
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
  return json({ document: sanitizeQuoteRow(target) });
}

async function portalDocuments(body: Record<string, unknown>) {
  const documentId = normalizeId(body.documentId || body.id);
  const token = String(body.token || "").trim();
  const { target: anchor } = await assertTokenAccess(documentId, token, documentId);
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("user_id", anchor.user_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const docs = (data as QuoteRow[] || [])
    .filter((row) => row.id === anchor.id || (portalVisible(row) && samePortalGroup(anchor, row)))
    .map(sanitizeQuoteRow);
  return json({ anchor: sanitizeQuoteRow(anchor), documents: docs });
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
      return json({ document: sanitizeQuoteRow(target), unchanged: true, skipped: "owner_view" });
    }
    if (!target.status || ["draft", "sent"].includes(String(target.status))) {
      update.status = "viewed";
      update.viewed_at = now;
      update.data = mergeSafeData(existingData, { status: "viewed", viewed_at: now });
    }
  } else if (action === "client_update") {
    const topLevel = body.topLevel && typeof body.topLevel === "object" ? body.topLevel as Record<string, unknown> : {};
    if (typeof topLevel.status === "string") update.status = topLevel.status;
    if (typeof topLevel.client_name === "string") update.client_name = topLevel.client_name;
    if (typeof topLevel.accepted_at === "string") update.accepted_at = topLevel.accepted_at;
    if (typeof topLevel.accepted_by === "string") update.accepted_by = topLevel.accepted_by;
    update.data = mergeSafeData(existingData, body.dataPatch);
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
    return json({ document: sanitizeQuoteRow(target), unchanged: true });
  }

  const { data, error } = await supabase
    .from("quotes")
    .update(update)
    .eq("id", target.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return json({ document: sanitizeQuoteRow(data as QuoteRow) });
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
    if (action === "update") return await updateDocument(req, body);
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("client-document error:", error);
    return json({ error: error instanceof Error ? error.message : "Secure document request failed" }, 400);
  }
});
