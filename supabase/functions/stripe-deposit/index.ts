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

function sanitizePaymentType(value: unknown) {
  const type = String(value || "deposit");
  return ["deposit", "invoice_full", "invoice_deposit"].includes(type) ? type : "deposit";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const quoteId = body.quoteId || body.invoiceId || "";
    const paymentType = sanitizePaymentType(body.paymentType);
    const currency = String(body.currency || "cad").toLowerCase();
    const description = String(body.description || "QuoteDr payment");
    const successUrl = String(body.successUrl || "https://quotedr.io");
    const cancelUrl = String(body.cancelUrl || "https://quotedr.io");

    if (!amount || amount < 50) return json({ error: "Amount must be at least $0.50" }, 400);
    if (!quoteId) return json({ error: "Missing quote or invoice id" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    if (!serviceKey) return json({ error: "Supabase service key not configured" }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: quoteRow, error: quoteError } = await supabase
      .from("quotes")
      .select("id,user_id,quote_number,client_name,total,data")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quoteRow) return json({ error: "Quote or invoice not found" }, 404);

    const { data: settingsRow } = await supabase
      .from("user_data")
      .select("value")
      .eq("user_id", quoteRow.user_id)
      .eq("key", "payment_settings")
      .maybeSingle();

    const settings = settingsRow?.value || {};
    if (!settings.stripe_enabled) return json({ error: "Stripe payments are not enabled for this contractor" }, 403);
    if (paymentType === "deposit" && settings.accept_deposit === false) return json({ error: "Deposits are not enabled" }, 403);
    if (paymentType === "invoice_deposit" && settings.accept_deposit === false) return json({ error: "Invoice deposits are not enabled" }, 403);
    if (paymentType === "invoice_full" && settings.accept_full_payment === false) return json({ error: "Full invoice payments are not enabled" }, 403);

    const quoteData = quoteRow.data || {};
    const clientEmail = String(body.clientEmail || quoteData.clientEmail || quoteData.email || "");
    const metadata = {
      quote_number: quoteRow.quote_number || quoteData.quoteNumber || "",
      client_name: quoteRow.client_name || quoteData.clientName || "",
    };

    const { data: paymentRecord, error: recordError } = await supabase
      .from("payment_records")
      .insert({
        user_id: quoteRow.user_id,
        quote_id: paymentType === "deposit" ? quoteRow.id : null,
        invoice_id: paymentType !== "deposit" ? quoteRow.id : null,
        payment_type: paymentType,
        status: "pending",
        amount_cents: Math.round(amount),
        currency,
        client_email: clientEmail,
        description,
        metadata,
      })
      .select()
      .single();

    if (recordError || !paymentRecord) {
      console.error("payment_records insert error", recordError);
      return json({ error: "Could not create payment record" }, 500);
    }

    const finalSuccessUrl = successUrl + (successUrl.includes("?") ? "&" : "?") + "payment=success&session_id={CHECKOUT_SESSION_ID}";
    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "mode": "payment",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(Math.round(amount)),
      "line_items[0][price_data][product_data][name]": description,
      "line_items[0][quantity]": "1",
      "success_url": finalSuccessUrl,
      "cancel_url": cancelUrl,
      "client_reference_id": String(paymentRecord.id),
      "metadata[payment_record_id]": String(paymentRecord.id),
      "metadata[quote_id]": String(quoteRow.id),
      "metadata[contractor_user_id]": String(quoteRow.user_id),
      "metadata[payment_type]": paymentType,
      "payment_intent_data[metadata][payment_record_id]": String(paymentRecord.id),
      "payment_intent_data[metadata][quote_id]": String(quoteRow.id),
      "payment_intent_data[metadata][contractor_user_id]": String(quoteRow.user_id),
      "payment_intent_data[metadata][payment_type]": paymentType,
    });

    if (clientEmail) params.set("customer_email", clientEmail);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      await supabase.from("payment_records").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", paymentRecord.id);
      throw new Error(`Stripe error: ${err}`);
    }

    const session = await response.json();
    await supabase
      .from("payment_records")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", paymentRecord.id);

    return json({ url: session.url, sessionId: session.id, paymentRecordId: paymentRecord.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
