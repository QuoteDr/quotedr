import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Retired in favour of document-payment, which validates the secure document
// token, calculates the amount on the server, and charges the contractor's
// connected Stripe account. Keeping a hard failure at this legacy route closes
// the former amount- and return-URL-trusting public checkout path.
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  return json({
    error: "This payment link uses an outdated checkout flow. Refresh the secure quote or invoice link and try again.",
    code: "legacy_payment_endpoint_retired",
  }, 410);
});
