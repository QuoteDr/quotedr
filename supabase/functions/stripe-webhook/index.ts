import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

async function saveSubscriptionStatus(supabase: any, userId: string, statusData: object) {
  // Check if row exists first
  const { data: existing } = await supabase
    .from('user_data')
    .select('id')
    .eq('user_id', userId)
    .eq('key', 'subscription_status')
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_data')
      .update({ value: statusData, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('key', 'subscription_status');
  } else {
    await supabase
      .from('user_data')
      .insert({ user_id: userId, key: 'subscription_status', value: statusData, updated_at: new Date().toISOString() });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://axmoffknvblluibuitrq.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase service key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.text();
    const event = JSON.parse(body);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: 'active',
          plan: session.metadata?.plan || 'pro',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          started_at: new Date().toISOString(),
        });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: sub.status,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          updated_at: new Date().toISOString(),
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: 'cancelled',
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          cancelled_at: new Date().toISOString(),
        });
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = invoice.metadata?.userId;
        if (!userId) break;
        await saveSubscriptionStatus(supabase, userId, {
          status: 'past_due',
          stripe_customer_id: invoice.customer,
          updated_at: new Date().toISOString(),
        });
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
