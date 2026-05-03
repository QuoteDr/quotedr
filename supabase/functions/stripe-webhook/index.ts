import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(payload: string, signatureHeader: string | null, endpointSecret: string) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [key, value] = item.split("=");
    if (!key || !value) return acc;
    acc[key] = acc[key] || [];
    acc[key].push(value);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(endpointSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)));
  return signatures.some((sig) => timingSafeEqual(sig, digest));
}

async function saveSubscriptionStatus(supabase: any, userId: string, statusData: Record<string, unknown>) {
  const value = { ...statusData, updated_at: new Date().toISOString() };
  await supabase
    .from("user_data")
    .upsert({ user_id: userId, key: "subscription_status", value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
}

async function updateQuotePaymentState(supabase: any, quoteId: string, paymentType: string, amountCents: number, session: any) {
  const { data: row } = await supabase.from("quotes").select("id,status,data").eq("id", quoteId).maybeSingle();
  if (!row) return;
  const paidAt = new Date().toISOString();
  const existingData = row.data || {};
  const payments = Array.isArray(existingData.payments) ? existingData.payments : [];
  const nextData = {
    ...existingData,
    paymentStatus: paymentType === "invoice_full" ? "paid" : "partially_paid",
    lastPaymentAt: paidAt,
    payments: payments.concat([{
      type: paymentType,
      amount_cents: amountCents,
      currency: session.currency || "cad",
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || "",
      paid_at: paidAt,
    }]),
  };
  await supabase.from("quotes").update({ data: nextData, updated_at: paidAt }).eq("id", quoteId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!supabaseServiceKey) return json({ error: "Supabase service key not configured" }, 500);
    if (!endpointSecret) return json({ error: "Stripe webhook secret not configured" }, 500);

    const body = await req.text();
    const verified = await verifyStripeSignature(body, req.headers.get("stripe-signature"), endpointSecret);
    if (!verified) return json({ error: "Invalid Stripe signature" }, 400);

    const event = JSON.parse(body);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.subscription_details?.metadata?.userId;
        const paymentRecordId = session.metadata?.payment_record_id;

        if (paymentRecordId) {
          const paymentType = session.metadata?.payment_type || "deposit";
          const quoteId = session.metadata?.quote_id;
          const amountCents = Number(session.amount_total || 0);
          await supabase
            .from("payment_records")
            .update({
              status: "paid",
              amount_cents: amountCents || undefined,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent || null,
              stripe_customer_id: session.customer || null,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentRecordId);
          if (quoteId) await updateQuotePaymentState(supabase, quoteId, paymentType, amountCents, session);
        } else if (userId) {
          await saveSubscriptionStatus(supabase, userId, {
            status: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "active" : session.payment_status,
            plan: session.metadata?.plan || "pro",
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            started_at: new Date().toISOString(),
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: sub.status,
          plan: sub.metadata?.plan || "pro",
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          current_period_end: sub.current_period_end || null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: "cancelled",
          plan: sub.metadata?.plan || "basic",
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          cancelled_at: new Date().toISOString(),
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: "past_due",
          plan: invoice.subscription_details?.metadata?.plan || invoice.metadata?.plan || "pro",
          stripe_customer_id: invoice.customer,
          stripe_subscription_id: invoice.subscription || null,
        });
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: "active",
          plan: invoice.subscription_details?.metadata?.plan || invoice.metadata?.plan || "pro",
          stripe_customer_id: invoice.customer,
          stripe_subscription_id: invoice.subscription || null,
          last_invoice_id: invoice.id,
          last_invoice_paid_at: new Date().toISOString(),
        });
        break;
      }
    }

    return json({ received: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
