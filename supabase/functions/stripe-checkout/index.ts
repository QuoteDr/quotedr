import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, userId, successUrl, cancelUrl } = body;
    const plan = body.plan || 'pro';
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const priceId = plan === 'starter'
        ? Deno.env.get('STRIPE_PRICE_ID_STARTER')
        : Deno.env.get('STRIPE_PRICE_ID_PRO');

    if (!stripeKey || !priceId) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const params = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': 'subscription',
      'customer_email': email,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': successUrl || 'https://quotedr.io/onboarding.html?subscribed=1',
      'cancel_url': cancelUrl || 'https://quotedr.io/login.html',
      'metadata[userId]': userId || '',
      'allow_promotion_codes': 'true',
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Stripe error: ${err}`);
    }

    const session = await response.json();
    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});