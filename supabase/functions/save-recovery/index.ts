import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_REPLY_EMAIL = (Deno.env.get("QUOTEDR_ADMIN_EMAIL") ?? "admin@quotedr.io").trim();
const ALERT_EMAIL = (Deno.env.get("QUOTEDR_SAVE_ALERT_EMAIL") ?? ADMIN_REPLY_EMAIL).trim();
const ADMIN_EMAILS = new Set([
  "admin@quotedr.io",
  "info@alddirect.ca",
  "ald.direct.contracting@gmail.com",
  ADMIN_REPLY_EMAIL,
  ...(Deno.env.get("QUOTEDR_ADMIN_EMAILS") ?? "").split(","),
].map((email) => email.trim().toLowerCase()).filter(Boolean));
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function isAdminEmail(email: unknown) {
  return ADMIN_EMAILS.has(String(email ?? "").trim().toLowerCase());
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedEntityTypes = new Set([
  "quote", "quote_draft", "invoice", "item_database", "item", "client", "client_database",
  "template", "template_database", "term", "terms_database", "business_profile", "company_logo",
  "payment_settings", "notification_settings", "quote_preferences", "quote_style", "portal_theme",
  "portal_job_folder", "portal_job_asset", "client_note", "client_signature", "client_approval",
  "labor_job_site", "labor_session", "labor_device", "labor_location_event", "labor_notification_settings",
  "user_data", "upload_metadata", "feedback", "admin_broadcast", "ai_mapping", "ai_trade_rule"
]);

const replayTables = new Set([
  "quotes", "items", "clients", "templates", "terms", "user_data", "client_notification_preferences",
  "labor_job_sites", "labor_time_sessions", "labor_devices", "labor_location_events",
  "labor_notification_settings", "portal_job_folders", "portal_job_assets", "feedback",
  "app_broadcast_messages", "ai_learned_mappings", "ai_trade_rules"
]);

const blockedKey = /token|secret|password|authorization|stripe.*key|quickbooks.*token|access[_-]?key/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Save recovery service is not configured");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 20) return "[Maximum depth]";
  if (Array.isArray(value)) return value.slice(0, 10000).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = blockedKey.test(key) ? "[REDACTED]" : sanitize(item, depth + 1);
  }
  return output;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendIncidentEmail(record: Record<string, unknown>, userEmail: string) {
  if (!RESEND_API_KEY || !ALERT_EMAIL) return false;
  const error = (record.last_error || {}) as Record<string, unknown>;
  const subject = `[QuoteDr save recovery] ${text(record.entity_type, 80)} failed for ${userEmail}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#17283e">
    <h2 style="margin:0 0 18px;color:#b42318">A user's save needs recovery</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700;width:160px">User</td><td style="padding:8px">${escapeHtml(userEmail)}</td></tr>
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700">Data</td><td style="padding:8px">${escapeHtml(record.entity_label || record.entity_type)}</td></tr>
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700">Page</td><td style="padding:8px">${escapeHtml(record.source_page)}</td></tr>
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700">Attempts</td><td style="padding:8px">${escapeHtml(record.attempts)}</td></tr>
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700">Error</td><td style="padding:8px">${escapeHtml(error.message || "Unknown save error")}</td></tr>
      <tr><td style="padding:8px;background:#f5f7fa;font-weight:700">Operation</td><td style="padding:8px">${escapeHtml(record.operation_id)}</td></tr>
    </table>
    <p style="margin-top:20px">The failed payload is retained in QuoteDr's admin Save Incidents panel.</p>
  </div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "QuoteDr Save Monitor <quotes@quotedr.io>",
      to: [ALERT_EMAIL],
      reply_to: ADMIN_REPLY_EMAIL,
      subject,
      html,
    }),
  });
  return response.ok;
}

type ReplayTarget = {
  table?: string;
  action?: "upsert" | "insert" | "update" | "delete" | "replace";
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  onConflict?: string;
  filters?: Array<{ column?: string; operator?: "eq" | "in" | "is"; value?: unknown }>;
  matchColumn?: string;
  ownerScoped?: boolean;
  dedupe?: { select?: string; filters?: Array<{ column?: string; operator?: "eq" | "in" | "is"; value?: unknown }> };
};

function validIdentifier(value: unknown) {
  return /^[a-z_][a-z0-9_]*$/i.test(text(value, 100));
}

function validateRecoveryOperation(operation: Record<string, unknown>) {
  const serialized = JSON.stringify(operation);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) throw new Error("Recovery payload is too large");
  if (operation.payload === undefined) throw new Error("Recovery payload is required");
  if (operation.target == null) return;
  const target = operation.target as ReplayTarget;
  const action = target.action || "upsert";
  if (!target.table || !replayTables.has(target.table) || !validIdentifier(target.table)) throw new Error("Recovery target is not allowlisted");
  if (!["upsert", "insert", "update", "delete", "replace"].includes(action)) throw new Error("Unsupported recovery action");
  if (action !== "delete" && target.values === undefined) throw new Error("Recovery target values are required");
  const filters = [...(target.filters || []), ...(target.dedupe?.filters || [])];
  if (filters.length > 50 || filters.some((filter) => !validIdentifier(filter.column))) throw new Error("Invalid recovery filters");
  if (target.onConflict && !String(target.onConflict).split(",").every(validIdentifier)) throw new Error("Invalid conflict columns");
}

function forceOwner(values: ReplayTarget["values"], userId: string) {
  const apply = (row: Record<string, unknown>) => ({ ...row, user_id: userId });
  return Array.isArray(values) ? values.map(apply) : apply((values || {}) as Record<string, unknown>);
}

async function replayTarget(record: Record<string, unknown>) {
  const target = (record.recovery_target || {}) as ReplayTarget;
  const table = text(target.table, 80);
  const action = target.action || "upsert";
  if (table === "quotes" || ["quote", "invoice"].includes(text(record.entity_type, 80))) {
    throw new Error("Quote and invoice recovery records are backup-only and cannot overwrite a live document. Export the retained copy for review instead.");
  }
  if (!replayTables.has(table)) throw new Error("This recovery target is not allowlisted for replay");
  if (!["upsert", "insert", "update", "delete", "replace"].includes(action)) throw new Error("Unsupported recovery action");
  const client = adminClient();
  const userId = text(record.user_id, 80);
  const ownerScoped = target.ownerScoped !== false;
  if (!ownerScoped && table !== "app_broadcast_messages") throw new Error("Only admin broadcast saves may use an ownerless recovery target");
  let query: any;
  if (action === "replace") {
    const rows = forceOwner(target.values, userId) as Array<Record<string, unknown>>;
    const replacementRows = Array.isArray(rows) ? rows : [];
    const matchColumn = text(target.matchColumn || "id", 80);
    const { data: oldRows, error: oldError } = await client.from(table).select(`id,${matchColumn}`).eq("user_id", userId);
    if (oldError) throw oldError;
    let savedRows: unknown[] = [];
    if (replacementRows.length) {
      const saved = await client.from(table).upsert(replacementRows, target.onConflict ? { onConflict: target.onConflict } : undefined).select();
      if (saved.error) throw saved.error;
      savedRows = saved.data || [];
    }
    const keep = new Set(replacementRows.map((row) => String(row[matchColumn] || "")));
    const staleIds = (oldRows || []).filter((row: Record<string, unknown>) => !keep.has(String(row[matchColumn] || ""))).map((row: Record<string, unknown>) => row.id).filter(Boolean);
    if (staleIds.length) {
      const removed = await client.from(table).delete().eq("user_id", userId).in("id", staleIds);
      if (removed.error) throw removed.error;
    }
    return savedRows;
  } else if (action === "upsert") {
    query = client.from(table).upsert(ownerScoped ? forceOwner(target.values, userId) : target.values, target.onConflict ? { onConflict: target.onConflict } : undefined).select();
  } else if (action === "insert") {
    if (target.dedupe?.filters?.length) {
      let existing = client.from(table).select(target.dedupe.select || "id,updated_at");
      if (ownerScoped) existing = existing.eq("user_id", userId);
      for (const filter of target.dedupe.filters) {
        const column = text(filter.column, 80);
        if (filter.operator === "in" && Array.isArray(filter.value)) existing = existing.in(column, filter.value);
        else if (filter.operator === "is") existing = existing.is(column, filter.value);
        else existing = existing.eq(column, filter.value);
      }
      const existingResult = await existing.limit(1).maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (existingResult.data?.id) {
        query = client.from(table).update(ownerScoped ? forceOwner(target.values, userId) : target.values).eq("id", existingResult.data.id);
        if (ownerScoped) query = query.eq("user_id", userId);
      }
    }
    if (!query) query = client.from(table).insert(ownerScoped ? forceOwner(target.values, userId) : target.values).select();
  } else if (action === "update") {
    const updateValues = { ...((target.values || {}) as Record<string, unknown>) };
    delete updateValues.user_id;
    query = client.from(table).update(updateValues);
    if (ownerScoped) query = query.eq("user_id", userId);
  } else {
    query = client.from(table).delete();
    if (ownerScoped) query = query.eq("user_id", userId);
  }
  if (action === "update" || action === "delete") {
    for (const filter of target.filters || []) {
      const column = text(filter.column, 80);
      if (!column || column === "user_id") continue;
      if (filter.operator === "in" && Array.isArray(filter.value)) query = query.in(column, filter.value);
      else if (filter.operator === "is") query = query.is(column, filter.value);
      else query = query.eq(column, filter.value);
    }
    query = query.select();
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Recovery payload is too large" }, 413);
  try {
    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);
    const body = await req.json();
    const action = text(body.action, 40);
    const service = adminClient();

    if (action === "capture") {
      const operation = body.operation || {};
      const entityType = text(operation.entityType, 80);
      const operationId = text(operation.operationId, 160);
      const revision = text(operation.revision, 160);
      if (!operationId || !revision || !allowedEntityTypes.has(entityType)) {
        return json({ error: "Invalid recovery operation" }, 400);
      }
      validateRecoveryOperation(operation);
      if (entityType === "admin_broadcast" && !isAdminEmail(user.email)) {
        return json({ error: "Admin access required" }, 403);
      }
      const { data: existing } = await service
        .from("save_recovery_records")
        .select("operation_id,first_failed_at,alert_sent_at")
        .eq("operation_id", operationId)
        .maybeSingle();
      const now = new Date().toISOString();
      const record = {
        operation_id: operationId,
        user_id: user.id,
        user_email: text(user.email || "", 320),
        revision,
        payload_hash: text(operation.payloadHash, 160),
        entity_type: entityType,
        entity_id: text(operation.entityId, 500),
        entity_label: text(operation.entityLabel, 500),
        save_action: ["upsert", "insert", "update", "delete"].includes(operation.saveAction) ? operation.saveAction : "upsert",
        payload: sanitize(operation.payload || {}),
        recovery_target: operation.target ? sanitize(operation.target) : null,
        status: "pending",
        attempts: Math.max(0, Number(operation.attempts) || 0),
        last_error: sanitize(operation.lastError || {}),
        source_page: text(operation.page, 500),
        app_version: text(operation.appVersion, 120),
        local_saved_at: operation.localSavedAt || now,
        first_failed_at: existing?.first_failed_at || now,
        last_failed_at: now,
        alert_sent_at: existing?.alert_sent_at || null,
        resolved_at: null,
        updated_at: now,
      };
      const { error } = await service.from("save_recovery_records").upsert(record, { onConflict: "operation_id" });
      if (error) throw error;
      let alertSentAt = existing?.alert_sent_at || null;
      if (!alertSentAt && await sendIncidentEmail(record, user.email || user.id)) {
        alertSentAt = new Date().toISOString();
        await service.from("save_recovery_records").update({ alert_sent_at: alertSentAt, updated_at: alertSentAt }).eq("operation_id", operationId);
      }
      return json({ success: true, operationId, alertSentAt });
    }

    if (action === "resolve") {
      const operationId = text(body.operationId, 160);
      const now = new Date().toISOString();
      const { error } = await service.from("save_recovery_records")
        .update({ status: "resolved", resolved_at: now, updated_at: now })
        .eq("operation_id", operationId)
        .eq("user_id", user.id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "retry") {
      if (!isAdminEmail(user.email)) return json({ error: "Admin access required" }, 403);
      const operationId = text(body.operationId, 160);
      const { data: record, error } = await service.from("save_recovery_records").select("*").eq("operation_id", operationId).single();
      if (error || !record) return json({ error: "Recovery record not found" }, 404);
      const now = new Date().toISOString();
      const replayTable = text((record.recovery_target as ReplayTarget | null)?.table, 80);
      if (replayTable === "quotes" || ["quote", "invoice"].includes(text(record.entity_type, 80))) {
        return json({ error: "Quote and invoice incidents cannot be replayed over a live document. Export the retained backup for review, then close the incident." }, 409);
      }
      if (!record.recovery_target) {
        await service.from("save_recovery_records").update({ status: "retry_requested", retry_requested_at: now, updated_at: now }).eq("operation_id", operationId);
        return json({ success: true, state: "retry_requested" });
      }
      try {
        const data = await replayTarget(record);
        await service.from("save_recovery_records").update({ status: "resolved", resolved_at: now, updated_at: now }).eq("operation_id", operationId);
        return json({ success: true, state: "resolved", data });
      } catch (replayError) {
        await service.from("save_recovery_records").update({
          status: "pending",
          attempts: Number(record.attempts || 0) + 1,
          last_error: sanitize({ message: (replayError as Error).message }),
          last_failed_at: now,
          updated_at: now,
        }).eq("operation_id", operationId);
        return json({ error: (replayError as Error).message }, 409);
      }
    }

    if (action === "discard") {
      const operationId = text(body.operationId, 160);
      const isAdmin = isAdminEmail(user.email);
      let query = service.from("save_recovery_records").update({ status: "discarded", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("operation_id", operationId);
      if (!isAdmin) query = query.eq("user_id", user.id);
      const { error } = await query;
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Unknown recovery action" }, 400);
  } catch (error) {
    console.error("save-recovery error", error);
    return json({ error: (error as Error).message || "Save recovery failed" }, 500);
  }
});
