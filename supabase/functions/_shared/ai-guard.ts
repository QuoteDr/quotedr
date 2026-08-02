import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  estimateOpenAiCostUsd,
  getAiFeaturePolicy,
  secondsUntilWindowReset,
} from "./ai-usage-policy.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type JsonMap = Record<string, unknown>;

export class AiGuardError extends Error {
  status: number;
  body: JsonMap;

  constructor(message: string, status = 500, body: JsonMap = {}) {
    super(message);
    this.name = "AiGuardError";
    this.status = status;
    this.body = body;
  }
}

export function jsonResponse(body: JsonMap, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function aiGuardErrorResponse(error: unknown, corsHeaders: HeadersInit) {
  if (error instanceof AiGuardError) {
    return jsonResponse(error.body || { error: error.message }, error.status, corsHeaders);
  }
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, 500, corsHeaders);
}

export function assertWithinAiInputLimit(policy: any, value: unknown, label = "AI input") {
  const length = typeof value === "string" ? value.length : JSON.stringify(value || "").length;
  if (length > policy.maxInputChars) {
    throw new AiGuardError(`${label} is too large for ${policy.label}.`, 413, {
      error: `${label} is too large for ${policy.label}.`,
      code: "ai_input_too_large",
      feature: policy.feature,
      maxInputChars: policy.maxInputChars,
    });
  }
  return length;
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AiGuardError("Please sign in before using AI tools.", 401, {
      error: "Please sign in before using AI tools.",
      code: "ai_auth_required",
    });
  }

  const token = authHeader.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new AiGuardError("Please sign in again before using AI tools.", 401, {
      error: "Please sign in again before using AI tools.",
      code: "ai_auth_invalid",
    });
  }
  return { user: data.user, token };
}

function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new AiGuardError("AI usage guard is missing SUPABASE_SERVICE_ROLE_KEY.", 500, {
      error: "AI usage guard is missing SUPABASE_SERVICE_ROLE_KEY.",
      code: "ai_guard_not_configured",
    });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const PRO_TRIAL_GRACE_MS = 30 * 60 * 1000;

function subscriptionAllowsProAccess(value: any) {
  const status = String(value?.status || "").toLowerCase();
  const plan = String(value?.plan || "basic").toLowerCase();
  return ["active", "trialing"].includes(status) && plan === "pro";
}

function trialAllowsFeatureAccess(value: any, feature: string, now = new Date()) {
  const trial = value && typeof value === "object" ? value[feature] : null;
  const expiresAt = trial?.expires_at ? new Date(trial.expires_at) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return false;
  return now.getTime() <= expiresAt.getTime() + PRO_TRIAL_GRACE_MS;
}

async function assertAiProAccess(supabaseAdmin: any, userId: string, feature: string) {
  const { data, error } = await supabaseAdmin
    .from("user_data")
    .select("key,value")
    .eq("user_id", userId)
    .in("key", ["subscription_status", "pro_trial_usage"]);
  if (error) {
    throw new AiGuardError("AI entitlement check failed: " + error.message, 500, {
      error: "AI entitlement check failed",
      code: "ai_entitlement_check_failed",
    });
  }
  const rows = Array.isArray(data) ? data : [];
  const subscription = rows.find((row: any) => row?.key === "subscription_status")?.value;
  const trialUsage = rows.find((row: any) => row?.key === "pro_trial_usage")?.value;
  if (subscriptionAllowsProAccess(subscription) || trialAllowsFeatureAccess(trialUsage, feature)) return;
  throw new AiGuardError("AI Quote Copilot requires QuoteDr Pro or active Play For a Day access.", 403, {
    error: "AI Quote Copilot requires QuoteDr Pro or active Play For a Day access.",
    code: "ai_pro_required",
    feature,
  });
}

async function countUsage(supabaseAdmin: any, userId: string, feature: string, sinceIso: string) {
  const { count, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", sinceIso);
  if (error) throw new AiGuardError(`AI usage check failed: ${error.message}`, 500, { error: "AI usage check failed" });
  return Number(count || 0);
}

function limitReached(policy: any, windowName: "hour" | "day", used: number) {
  const limit = windowName === "hour" ? policy.hourlyLimit : policy.dailyLimit;
  if (used < limit) return null;
  const retryAfterSeconds = secondsUntilWindowReset(new Date(), windowName);
  return new AiGuardError(`${policy.label} limit reached. Try again later.`, 429, {
    error: `${policy.label} limit reached. Try again later.`,
    code: "ai_limit_reached",
    feature: policy.feature,
    window: windowName,
    limit,
    used,
    retryAfterSeconds,
  });
}

export async function startAiUsage(req: Request, options: {
  feature: string;
  endpoint: string;
  inputChars?: number;
  requiresPro?: boolean;
  entitlementFeature?: string;
}) {
  const policy = getAiFeaturePolicy(options.feature);
  const { user } = await getAuthenticatedUser(req);
  const supabaseAdmin = adminClient();
  if (options.requiresPro) {
    await assertAiProAccess(supabaseAdmin, user.id, options.entitlementFeature || options.feature);
  }
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [hourUsed, dayUsed] = await Promise.all([
    countUsage(supabaseAdmin, user.id, policy.feature, hourAgo),
    countUsage(supabaseAdmin, user.id, policy.feature, dayAgo),
  ]);

  const hourError = limitReached(policy, "hour", hourUsed);
  if (hourError) throw hourError;
  const dayError = limitReached(policy, "day", dayUsed);
  if (dayError) throw dayError;

  const requestId = crypto.randomUUID();
  const { data, error } = await supabaseAdmin
    .from("ai_usage_events")
    .insert({
      user_id: user.id,
      feature: policy.feature,
      endpoint: options.endpoint,
      status: "started",
      max_output_tokens: policy.maxOutputTokens,
      input_chars: options.inputChars || 0,
      request_id: requestId,
      metadata: { label: policy.label },
    })
    .select("id")
    .single();

  if (error) throw new AiGuardError(`AI usage logging failed: ${error.message}`, 500, { error: "AI usage logging failed" });

  async function finish(status: "succeeded" | "failed", update: JsonMap = {}) {
    const usage = (update.usage || {}) as any;
    const model = String(update.model || "");
    const estimatedCostUsd = status === "succeeded" ? estimateOpenAiCostUsd(model, usage) : 0;
    await supabaseAdmin
      .from("ai_usage_events")
      .update({
        status,
        model: model || null,
        prompt_tokens: Number(usage.prompt_tokens || usage.input_tokens || 0),
        completion_tokens: Number(usage.completion_tokens || usage.output_tokens || 0),
        total_tokens: Number(usage.total_tokens || 0),
        estimated_cost_usd: estimatedCostUsd,
        error_message: update.errorMessage ? String(update.errorMessage).slice(0, 1000) : null,
        metadata: update.metadata || { label: policy.label },
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }

  return {
    user,
    policy,
    requestId,
    eventId: data.id,
    recordSuccess: (update: JsonMap = {}) => finish("succeeded", update),
    recordFailure: (error: unknown, update: JsonMap = {}) => finish("failed", {
      ...update,
      errorMessage: error instanceof Error ? error.message : String(error),
    }),
  };
}
