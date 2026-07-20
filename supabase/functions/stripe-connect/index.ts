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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function supportId() {
  return crypto.randomUUID().split("-")[0].toUpperCase();
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function safeSettingsUrl(value: unknown, fallbackPath = "/settings.html") {
  const fallback = `https://quotedr.io${fallbackPath}`;
  try {
    const url = new URL(String(value || fallback));
    const productionHost = url.protocol === "https:" && ["quotedr.io", "www.quotedr.io"].includes(url.hostname);
    const localHost = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (!productionHost && !localHost) return fallback;
    const settingsPath = url.pathname.endsWith("/settings.html") || url.pathname === "/settings";
    const onboardingPath = url.pathname.endsWith("/onboarding.html") || url.pathname === "/onboarding";
    if (!settingsPath && !onboardingPath) return fallback;
    url.search = "";
    if (settingsPath) url.searchParams.set("tab", "payments");
    url.hash = "";
    return url.toString();
  } catch (_) {
    return fallback;
  }
}

async function stripeRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${STRIPE_SECRET_KEY}`);
  const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Stripe request failed");
    (error as Error & { stripeCode?: string }).stripeCode = payload?.error?.code || "stripe_request_failed";
    throw error;
  }
  return payload;
}

function accountState(account: any, disabled = false) {
  const requirements = account?.requirements || {};
  let status = "pending";
  if (disabled) status = "disabled";
  else if (account?.charges_enabled && account?.payouts_enabled && account?.details_submitted) status = "ready";
  else if (requirements.disabled_reason || (account?.details_submitted && !account?.charges_enabled)) status = "restricted";

  return {
    status,
    charges_enabled: !!account?.charges_enabled,
    payouts_enabled: !!account?.payouts_enabled,
    details_submitted: !!account?.details_submitted,
    country: account?.country || null,
    default_currency: account?.default_currency || null,
    requirements: {
      currently_due: Array.isArray(requirements.currently_due) ? requirements.currently_due : [],
      eventually_due: Array.isArray(requirements.eventually_due) ? requirements.eventually_due : [],
      past_due: Array.isArray(requirements.past_due) ? requirements.past_due : [],
      disabled_reason: requirements.disabled_reason || null,
    },
    livemode: !!account?.livemode,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function publicConnection(row: any) {
  if (!row) {
    return {
      connected: false,
      status: "not_connected",
      ready: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirements: { currently_due: [], eventually_due: [], past_due: [], disabled_reason: null },
    };
  }
  return {
    connected: true,
    status: row.status || "pending",
    ready: row.status === "ready" && row.charges_enabled === true,
    chargesEnabled: row.charges_enabled === true,
    payoutsEnabled: row.payouts_enabled === true,
    detailsSubmitted: row.details_submitted === true,
    country: row.country || null,
    defaultCurrency: row.default_currency || null,
    requirements: row.requirements || { currently_due: [], eventually_due: [], past_due: [], disabled_reason: null },
    lastSyncedAt: row.last_synced_at || null,
  };
}

async function syncAccount(admin: any, row: any) {
  if (!row?.stripe_account_id) return row;
  const account = await stripeRequest(`/v1/accounts/${encodeURIComponent(row.stripe_account_id)}`);
  const values = accountState(account, row.status === "disabled");
  const { data, error } = await admin
    .from("stripe_connected_accounts")
    .update(values)
    .eq("user_id", row.user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Authentication required", code: "authentication_required" }, 401);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Payment setup is temporarily unavailable", code: "service_unavailable" }, 503);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");

  try {
    let { data: row, error: rowError } = await admin
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (rowError) throw rowError;

    if (action === "status" || action === "refresh") {
      if (row && STRIPE_SECRET_KEY) {
        try {
          row = await syncAccount(admin, row);
        } catch (error) {
          console.error("stripe-connect status sync failed", { userId: user.id, message: (error as Error).message });
          return json({ connection: publicConnection(row), warning: "Stripe status could not be refreshed. Showing the last known status." });
        }
      }
      return json({ connection: publicConnection(row) });
    }

    if (!STRIPE_SECRET_KEY) return json({ error: "Card payment setup is temporarily unavailable", code: "stripe_not_configured" }, 503);

    if (action === "start_onboarding" || action === "continue_onboarding") {
      if (!row) {
        const params = new URLSearchParams({
          type: "standard",
          country: String(body.country || "CA").toUpperCase() === "US" ? "US" : "CA",
          "metadata[quotedr_user_id]": user.id,
          "metadata[quotedr_product]": "document_payments",
        });
        if (user.email) params.set("email", user.email);
        const account = await stripeRequest("/v1/accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": `quotedr-connect-${user.id}`,
          },
          body: params.toString(),
        });
        const values = {
          user_id: user.id,
          stripe_account_id: account.id,
          ...accountState(account),
        };
        const inserted = await admin.from("stripe_connected_accounts").insert(values).select().single();
        if (inserted.error) throw inserted.error;
        row = inserted.data;
      } else if (row.status === "disabled") {
        const reenabled = await admin
          .from("stripe_connected_accounts")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .select()
          .single();
        if (reenabled.error) throw reenabled.error;
        row = reenabled.data;
      }

      const returnUrl = safeSettingsUrl(body.returnUrl);
      const returnTarget = new URL(returnUrl);
      returnTarget.searchParams.set("stripe", "returned");
      const refreshTarget = new URL(returnUrl);
      refreshTarget.searchParams.set("stripe", "refresh");
      const params = new URLSearchParams({
        account: row.stripe_account_id,
        type: "account_onboarding",
        return_url: returnTarget.toString(),
        refresh_url: refreshTarget.toString(),
      });
      const link = await stripeRequest("/v1/account_links", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      return json({ url: link.url, connection: publicConnection(row) });
    }

    if (action === "dashboard") {
      if (!row?.stripe_account_id) return json({ error: "Connect Stripe first", code: "not_connected" }, 409);
      try {
        const link = await stripeRequest(`/v1/accounts/${encodeURIComponent(row.stripe_account_id)}/login_links`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return json({ url: link.url });
      } catch (error) {
        console.warn("Stripe login link unavailable; using Stripe Dashboard", { userId: user.id, message: (error as Error).message });
        return json({ url: "https://dashboard.stripe.com/" });
      }
    }

    if (action === "disable") {
      if (!row) return json({ connection: publicConnection(null) });
      const disabled = await admin
        .from("stripe_connected_accounts")
        .update({ status: "disabled", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select()
        .single();
      if (disabled.error) throw disabled.error;
      return json({ connection: publicConnection(disabled.data) });
    }

    return json({ error: "Unknown Stripe setup action", code: "unknown_action" }, 400);
  } catch (error) {
    const id = supportId();
    console.error("stripe-connect error", { supportId: id, userId: user.id, action, message: (error as Error).message });
    return json({
      error: "Stripe setup could not be completed. Please try again.",
      code: "stripe_setup_failed",
      supportId: id,
    }, 502);
  }
});
