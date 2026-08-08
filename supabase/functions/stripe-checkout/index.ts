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

type BillingInterval = "month" | "year";
type Plan = "basic" | "pro";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePlan(value: unknown): Plan | null {
  if (value === "basic" || value === "starter") return "basic";
  if (value === "pro") return "pro";
  return null;
}

function normalizeBillingInterval(value: unknown): BillingInterval | null {
  if (value === undefined || value === null || value === "") return "month";
  if (value === "month" || value === "year") return value;
  return null;
}

function priceSecretName(plan: Plan, interval: BillingInterval) {
  return `STRIPE_PRICE_ID_${plan.toUpperCase()}_${interval === "year" ? "ANNUAL" : "MONTHLY"}`;
}

function safeReturnUrl(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const production = url.hostname === "quotedr.io" || url.hostname === "www.quotedr.io";
    if ((production && url.protocol === "https:") || (local && url.protocol === "http:")) return url.href;
  } catch (error) {}
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("Authorization") || "";
    if (!supabaseAnonKey) return json({ error: "Supabase authentication is not configured" }, 500);
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in is required" }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user?.id || !user.email) return json({ error: "Your session is no longer valid. Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    let access;
    try {
      access = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.BILLING_MANAGE);
    } catch (error) {
      if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
      throw error;
    }
    const accountOwnerId = access.ownerUserId;
    const plan = normalizePlan(body.plan);
    const billingInterval = normalizeBillingInterval(body.billingInterval);
    if (!plan) return json({ error: "Choose a valid QuoteDr plan" }, 400);
    if (!billingInterval) return json({ error: "Choose monthly or annual billing" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const secretName = priceSecretName(plan, billingInterval);
    const priceId = Deno.env.get(secretName);
    if (!stripeKey || !priceId) return json({ error: `Stripe price is not configured for ${plan} ${billingInterval}` }, 500);

    const successUrl = safeReturnUrl(body.successUrl, "https://quotedr.io/quote-builder.html?subscribed=1");
    const cancelUrl = safeReturnUrl(body.cancelUrl, `https://quotedr.io/pricing.html?billing=${billingInterval}`);
    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "mode": "subscription",
      "customer_email": user.email,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "client_reference_id": accountOwnerId,
      "metadata[userId]": accountOwnerId,
      "metadata[plan]": plan,
      "metadata[billing_interval]": billingInterval,
      "allow_promotion_codes": "true",
      "subscription_data[trial_period_days]": "14",
      "subscription_data[metadata][userId]": accountOwnerId,
      "subscription_data[metadata][plan]": plan,
      "subscription_data[metadata][billing_interval]": billingInterval,
    });

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error("Stripe checkout error", response.status, await response.text());
      return json({ error: "Stripe checkout could not be created" }, 502);
    }

    const session = await response.json();
    return json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("stripe-checkout failed", error);
    return json({ error: "Checkout could not be opened" }, 500);
  }
});
