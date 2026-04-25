import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { clientName, contractorId, pin } = await req.json();

    if (!clientName || !contractorId || !pin) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use service role key so RLS doesn't block the read
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch quotes for this contractor + client (never expose portal_pin in response)
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('data')
      .eq('user_id', contractorId)
      .ilike('client_name', clientName);

    if (error) throw new Error(error.message);

    let valid = false;
    let noPinSet = true;

    if (quotes && quotes.length > 0) {
      for (const quote of quotes) {
        if (quote.data && quote.data.portal_pin) {
          noPinSet = false;
          if (quote.data.portal_pin === pin) {
            valid = true;
            break;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ valid, ...(noPinSet ? { noPinSet: true } : {}) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
