import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST to subscribe." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const sourcePage = String(body.sourcePage || "marketing").slice(0, 120);
    const consentSource = String(body.consentSource || "quotedr_marketing_newsletter").slice(0, 120);

    if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Newsletter signup is not configured." }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date().toISOString();
    const unsubscribeToken = crypto.randomUUID();

    const { data: existing, error: readError } = await supabase
      .from("newsletter_subscribers")
      .select("id,status")
      .eq("normalized_email", email)
      .maybeSingle();
    if (readError) throw readError;

    const payload = {
      email,
      normalized_email: email,
      status: "subscribed",
      source_page: sourcePage,
      consent_source: consentSource,
      consented_at: now,
      unsubscribed_at: null,
      unsubscribe_token: existing?.status === "subscribed" ? undefined : unsubscribeToken,
      updated_at: now,
    };

    const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    const { error: upsertError } = await supabase
      .from("newsletter_subscribers")
      .upsert(cleanPayload, { onConflict: "normalized_email" });
    if (upsertError) throw upsertError;

    return json({ success: true, alreadySubscribed: existing?.status === "subscribed" });
  } catch (err) {
    console.error("newsletter-signup error", err);
    return json({ error: "Could not complete newsletter signup." }, 500);
  }
});
