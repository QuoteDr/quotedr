import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
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
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(endpointSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const digest = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)));
  return signatures.some((signature) => timingSafeEqual(signature, digest));
}

async function saveSubscriptionStatus(supabase: any, userId: string, statusData: Record<string, unknown>) {
  const now = new Date().toISOString();
  const value = { ...statusData, updated_at: now };
  const { error } = await supabase
    .from("user_data")
    .upsert({ user_id: userId, key: "subscription_status", value, updated_at: now }, { onConflict: "user_id,key" });
  if (error) throw error;
}

function subscriptionBillingInterval(source: any) {
  return source?.metadata?.billing_interval
    || source?.subscription_details?.metadata?.billing_interval
    || source?.items?.data?.[0]?.price?.recurring?.interval
    || source?.lines?.data?.[0]?.price?.recurring?.interval
    || "month";
}

async function updateQuotePaymentState(supabase: any, quoteId: string, record: any, paidAt: string) {
  const { data: row, error } = await supabase.from("quotes").select("id,user_id,status,total,data").eq("id", quoteId).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const existingData = row.data || {};
  const payments = Array.isArray(existingData.payments) ? existingData.payments : [];
  const alreadyRecorded = payments.some((payment: any) =>
    payment.payment_record_id === record.id ||
    (record.stripe_checkout_session_id && payment.stripe_checkout_session_id === record.stripe_checkout_session_id)
  );
  const received = existingData.paymentsReceived || existingData.paymentReceived || {};
  const previousReceived = Math.max(0, Number(received.amount || received.value || 0));
  const nextReceived = alreadyRecorded ? previousReceived : previousReceived + Number(record.amount_cents || 0) / 100;
  const nextData = {
    ...existingData,
    paymentStatus: record.payment_type === "invoice_full" ? "paid" : "partially_paid",
    deposit_paid: ["deposit", "invoice_deposit"].includes(record.payment_type) ? true : existingData.deposit_paid,
    deposit_paid_at: ["deposit", "invoice_deposit"].includes(record.payment_type) ? (existingData.deposit_paid_at || paidAt) : existingData.deposit_paid_at,
    lastPaymentAt: paidAt,
    manual_payment_reported: false,
    paymentsReceived: {
      name: ["deposit", "invoice_deposit"].includes(record.payment_type) ? "Deposit paid" : "Payment received",
      amount: Math.round(nextReceived * 100) / 100,
    },
    payments: alreadyRecorded ? payments : payments.concat([{
      payment_record_id: record.id,
      type: record.payment_type,
      provider: record.provider || "stripe",
      method: record.method || "card",
      amount_cents: Number(record.amount_cents || 0),
      currency: record.currency || "cad",
      stripe_checkout_session_id: record.stripe_checkout_session_id || "",
      stripe_payment_intent_id: record.stripe_payment_intent_id || "",
      paid_at: paidAt,
    }]),
  };
  const update: Record<string, any> = { data: nextData, updated_at: paidAt };
  if (record.payment_type === "invoice_full") update.status = "paid";
  const saved = await supabase.from("quotes").update(update).eq("id", quoteId).eq("user_id", row.user_id);
  if (saved.error) throw saved.error;
}

function connectedAccountState(account: any) {
  const requirements = account?.requirements || {};
  let status = "pending";
  if (account?.charges_enabled && account?.payouts_enabled && account?.details_submitted) status = "ready";
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

async function beginWebhookEvent(supabase: any, event: any) {
  if (!event?.id || !event?.type) throw new Error("Stripe event is missing its id or type");
  const { data: existing, error: readError } = await supabase
    .from("stripe_webhook_events")
    .select("*")
    .eq("event_id", event.id)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "completed") return false;
  if (existing?.status === "processing") {
    const age = Date.now() - new Date(existing.updated_at || existing.received_at || 0).getTime();
    if (Number.isFinite(age) && age < 5 * 60 * 1000) return false;
  }

  if (existing) {
    const update = await supabase.from("stripe_webhook_events").update({
      status: "processing",
      attempts: Number(existing.attempts || 0) + 1,
      last_error: null,
      connected_account_id: event.account || existing.connected_account_id || null,
      updated_at: new Date().toISOString(),
    }).eq("event_id", event.id);
    if (update.error) throw update.error;
  } else {
    const insert = await supabase.from("stripe_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      connected_account_id: event.account || null,
      status: "processing",
    });
    if (insert.error) {
      if (insert.error.code === "23505") return false;
      throw insert.error;
    }
  }
  return true;
}

async function completeWebhookEvent(supabase: any, eventId: string) {
  const now = new Date().toISOString();
  const result = await supabase.from("stripe_webhook_events").update({
    status: "completed",
    processed_at: now,
    updated_at: now,
  }).eq("event_id", eventId);
  if (result.error) throw result.error;
}

async function failWebhookEvent(supabase: any, eventId: string, error: unknown) {
  await supabase.from("stripe_webhook_events").update({
    status: "failed",
    last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("event_id", eventId);
}

async function completeDocumentCheckout(supabase: any, event: any, session: any) {
  const paymentRecordId = session.metadata?.payment_record_id;
  if (!paymentRecordId) return false;
  const { data: record, error } = await supabase.from("payment_records").select("*").eq("id", paymentRecordId).maybeSingle();
  if (error) throw error;
  if (!record) throw new Error("Payment record not found");
  const connectedAccountId = String(event.account || "");
  if (record.connected_account_id && connectedAccountId && record.connected_account_id !== connectedAccountId) {
    throw new Error("Connected account does not match the payment record");
  }
  const paidAt = new Date().toISOString();
  const update = await supabase.from("payment_records").update({
    status: "paid",
    amount_cents: Number(session.amount_total || record.amount_cents || 0),
    connected_account_id: connectedAccountId || record.connected_account_id || null,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    stripe_event_id: event.id,
    paid_at: record.paid_at || paidAt,
    updated_at: paidAt,
  }).eq("id", record.id).select().single();
  if (update.error) throw update.error;
  const quoteId = update.data.quote_id || update.data.invoice_id || session.metadata?.quote_id;
  if (quoteId) await updateQuotePaymentState(supabase, quoteId, update.data, update.data.paid_at || paidAt);
  return true;
}

async function processEvent(supabase: any, event: any) {
  switch (event.type) {
    case "account.updated": {
      const account = event.data.object;
      const accountId = String(account?.id || event.account || "");
      if (!accountId) break;
      const result = await supabase
        .from("stripe_connected_accounts")
        .update(connectedAccountState(account))
        .eq("stripe_account_id", accountId);
      if (result.error) throw result.error;
      break;
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (await completeDocumentCheckout(supabase, event, session)) break;
      const userId = session.metadata?.userId || session.subscription_details?.metadata?.userId;
      if (userId) {
        await saveSubscriptionStatus(supabase, userId, {
          status: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "active" : session.payment_status,
          plan: session.metadata?.plan || "pro",
          billing_interval: subscriptionBillingInterval(session),
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          started_at: new Date().toISOString(),
        });
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const paymentRecordId = session.metadata?.payment_record_id;
      if (paymentRecordId) {
        const status = event.type === "checkout.session.expired" ? "expired" : "failed";
        const result = await supabase.from("payment_records").update({
          status,
          stripe_event_id: event.id,
          updated_at: new Date().toISOString(),
        }).eq("id", paymentRecordId).in("status", ["pending", "failed"]);
        if (result.error) throw result.error;
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const paymentRecordId = intent.metadata?.payment_record_id;
      if (paymentRecordId) {
        const result = await supabase.from("payment_records").update({
          status: "failed",
          stripe_payment_intent_id: intent.id,
          stripe_event_id: event.id,
          updated_at: new Date().toISOString(),
        }).eq("id", paymentRecordId).neq("status", "paid");
        if (result.error) throw result.error;
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentRecordId = charge.metadata?.payment_record_id;
      if (paymentRecordId && charge.refunded === true) {
        const result = await supabase.from("payment_records").update({
          status: "refunded",
          stripe_event_id: event.id,
          updated_at: new Date().toISOString(),
        }).eq("id", paymentRecordId);
        if (result.error) throw result.error;
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      if (!userId) break;
      await saveSubscriptionStatus(supabase, userId, {
        status: subscription.status,
        plan: subscription.metadata?.plan || "pro",
        billing_interval: subscriptionBillingInterval(subscription),
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        current_period_end: subscription.current_period_end || null,
        cancel_at_period_end: !!subscription.cancel_at_period_end,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      if (!userId) break;
      await saveSubscriptionStatus(supabase, userId, {
        status: "cancelled",
        plan: subscription.metadata?.plan || "basic",
        billing_interval: subscriptionBillingInterval(subscription),
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        cancelled_at: new Date().toISOString(),
      });
      break;
    }
    case "invoice.payment_failed":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
      if (!userId) break;
      await saveSubscriptionStatus(supabase, userId, {
        status: event.type === "invoice.payment_succeeded" ? "active" : "past_due",
        plan: invoice.subscription_details?.metadata?.plan || invoice.metadata?.plan || "pro",
        billing_interval: subscriptionBillingInterval(invoice),
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: invoice.subscription || null,
        last_invoice_id: invoice.id,
        last_invoice_paid_at: event.type === "invoice.payment_succeeded" ? new Date().toISOString() : null,
      });
      break;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const endpointSecrets = [...new Set([
    Deno.env.get("STRIPE_WEBHOOK_SECRET") || "",
    Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") || "",
  ].map((secret) => secret.trim()).filter(Boolean))];
  if (!serviceKey || endpointSecrets.length === 0) return json({ error: "Webhook is not configured" }, 503);

  const body = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");
  const signatureChecks = await Promise.all(
    endpointSecrets.map((secret) => verifyStripeSignature(body, signatureHeader, secret)),
  );
  if (!signatureChecks.some(Boolean)) {
    return json({ error: "Invalid Stripe signature" }, 400);
  }

  const event = JSON.parse(body);
  const supabase = createClient(supabaseUrl, serviceKey);
  try {
    if (!await beginWebhookEvent(supabase, event)) return json({ received: true, duplicate: true });
    await processEvent(supabase, event);
    await completeWebhookEvent(supabase, event.id);
    return json({ received: true });
  } catch (error) {
    await failWebhookEvent(supabase, event?.id || "", error);
    console.error("stripe-webhook processing failed", { eventId: event?.id || "", eventType: event?.type || "", message: (error as Error).message });
    return json({ error: "Webhook processing failed" }, 500);
  }
});
