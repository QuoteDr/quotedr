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

async function updateQuotePaymentState(supabase: any, quoteId: string, paymentType: string, amountCents: number, session: any) {
  const { data: row } = await supabase.from("quotes").select("id,status,data").eq("id", quoteId).maybeSingle();
  if (!row) return;
  const paidAt = new Date().toISOString();
  const existingData = row.data || {};
  const payments = Array.isArray(existingData.payments) ? existingData.payments : [];
  const alreadyRecorded = payments.some((payment: any) => payment.stripe_checkout_session_id === session.id);
  const nextData = {
    ...existingData,
    paymentStatus: paymentType === "invoice_full" ? "paid" : "partially_paid",
    deposit_paid: paymentType === "deposit" ? true : existingData.deposit_paid,
    deposit_paid_at: paymentType === "deposit" ? (existingData.deposit_paid_at || paidAt) : existingData.deposit_paid_at,
    lastPaymentAt: paidAt,
    payments: alreadyRecorded ? payments : payments.concat([{
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
    const body = await req.json();
    const action = String(body.action || "");
    const amount = Number(body.amount);
    const quoteId = body.quoteId || body.invoiceId || "";
    const paymentType = sanitizePaymentType(body.paymentType);
    const currency = String(body.currency || "cad").toLowerCase();
    const description = String(body.description || "QuoteDr payment");
    const successUrl = String(body.successUrl || "https://quotedr.io");
    const cancelUrl = String(body.cancelUrl || "https://quotedr.io");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    if (!serviceKey) return json({ error: "Supabase service key not configured" }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "verify_checkout") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId || !sessionId.startsWith("cs_")) return json({ error: "Missing checkout session" }, 400);

      const sessionResp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      });
      if (!sessionResp.ok) return json({ error: "Could not verify Stripe session" }, 400);

      const session = await sessionResp.json();
      const verifiedPaymentType = sanitizePaymentType(session.metadata?.payment_type);
      const verifiedQuoteId = String(session.metadata?.quote_id || quoteId || "");
      const paymentRecordId = String(session.metadata?.payment_record_id || "");
      const amountCents = Number(session.amount_total || 0);
      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      if (!paid || !verifiedQuoteId) return json({ paid: false, status: session.payment_status || "unpaid" });

      if (paymentRecordId) {
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
      }

      await updateQuotePaymentState(supabase, verifiedQuoteId, verifiedPaymentType, amountCents, session);
      return json({ paid: true, quoteId: verifiedQuoteId, paymentType: verifiedPaymentType, amountCents });
    }

    if (action === "reconcile_quote_payments") {
      if (!quoteId) return json({ error: "Missing quote or invoice id" }, 400);
      const { data: records } = await supabase
        .from("payment_records")
        .select("*")
        .or(`quote_id.eq.${quoteId},invoice_id.eq.${quoteId}`)
        .order("created_at", { ascending: false });

      let paidRecord: any = (records || []).find((record: any) => record.status === "paid");
      if (!paidRecord) {
        for (const record of records || []) {
          if (!record.stripe_checkout_session_id) continue;
          const sessionResp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(record.stripe_checkout_session_id)}`, {
            headers: { "Authorization": `Bearer ${stripeKey}` },
          });
          if (!sessionResp.ok) continue;
          const session = await sessionResp.json();
          const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
          if (!paid) continue;
          paidRecord = {
            ...record,
            status: "paid",
            amount_cents: Number(session.amount_total || record.amount_cents || 0),
            stripe_payment_intent_id: session.payment_intent || record.stripe_payment_intent_id || null,
            stripe_customer_id: session.customer || record.stripe_customer_id || null,
            paid_at: record.paid_at || new Date().toISOString(),
          };
          await supabase
            .from("payment_records")
            .update({
              status: "paid",
              amount_cents: paidRecord.amount_cents,
              stripe_payment_intent_id: paidRecord.stripe_payment_intent_id,
              stripe_customer_id: paidRecord.stripe_customer_id,
              paid_at: paidRecord.paid_at,
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id);
          await updateQuotePaymentState(supabase, quoteId, sanitizePaymentType(record.payment_type), paidRecord.amount_cents, session);
          break;
        }
      } else {
        await updateQuotePaymentState(supabase, quoteId, sanitizePaymentType(paidRecord.payment_type), Number(paidRecord.amount_cents || 0), {
          id: paidRecord.stripe_checkout_session_id || "",
          currency: paidRecord.currency || "cad",
          payment_intent: paidRecord.stripe_payment_intent_id || "",
        });
      }

      return json({
        paid: !!paidRecord,
        paymentType: paidRecord ? sanitizePaymentType(paidRecord.payment_type) : null,
        amountCents: paidRecord ? Number(paidRecord.amount_cents || 0) : 0,
      });
    }

    if (!amount || amount < 50) return json({ error: "Amount must be at least $0.50" }, 400);
    if (!quoteId) return json({ error: "Missing quote or invoice id" }, 400);

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
