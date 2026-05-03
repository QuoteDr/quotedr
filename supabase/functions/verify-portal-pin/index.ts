import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { clientName, clientEmail, contractorId, pin } = await req.json();

    if ((!clientName && !clientEmail) || !contractorId || !pin) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use service role key so RLS doesn't block the read
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const normalizedEmail = normalize(clientEmail);
    const normalizedName = normalize(clientName);
    const enteredPin = String(pin ?? '').trim();

    // Fetch quotes for this contractor, then match the client server-side.
    // This keeps the stored PIN private while tolerating older quote payload keys.
    const query = supabase
      .from('quotes')
      .select('client_name,data')
      .eq('user_id', contractorId);

    const { data: quotes, error } = await query;

    if (error) throw new Error(error.message);

    let valid = false;
    let noPinSet = true;

    const matchingQuotes = (quotes || []).filter((quote) => {
      const data = quote.data || {};
      const quoteEmail = normalize(data.clientEmail || data.email || data.client_email);
      const quoteName = normalize(quote.client_name || data.clientName || data.client_name);
      return (
        (normalizedEmail && quoteEmail && quoteEmail === normalizedEmail) ||
        (normalizedName && quoteName && quoteName === normalizedName) ||
        (normalizedEmail && quoteName && quoteName === normalizedEmail)
      );
    });

    if (matchingQuotes.length > 0) {
      for (const quote of matchingQuotes) {
        if (quote.data && quote.data.portal_pin) {
          noPinSet = false;
          if (String(quote.data.portal_pin).trim() === enteredPin) {
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
