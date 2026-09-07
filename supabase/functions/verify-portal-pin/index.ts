import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { currentDesignPortal, digest, issueDesignSession } from '../_shared/portal-design-session.mjs';

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
    const { clientName, clientEmail, contractorId, quoteId, portalId, pin } = await req.json();

    if ((!clientName && !clientEmail && !quoteId && !portalId) || !contractorId || !pin) {
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
    const normalizedQuoteId = String(quoteId ?? '').trim();
    const normalizedPortalId = String(portalId ?? '').trim();
    const enteredPin = String(pin ?? '').trim();

    // Portal-scoped PINs now mint a verifiable, expiring grant for private designs.
    // Legacy name/email-only links retain their existing verification below.
    if (normalizedPortalId) {
      const gate = await supabase.rpc('portal_design_pin_attempt', {
        p_scope: await digest(String(contractorId) + ':' + normalizedPortalId)
      });
      if (gate.error) throw new Error('Portal PIN service is temporarily unavailable');
      if (!gate.data) return new Response(JSON.stringify({valid:false,error:'Too many attempts. Please wait 15 minutes before trying again.'}), {status:429,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
      const portal = await currentDesignPortal(supabase,contractorId,normalizedPortalId);
      const valid = !!portal?.pin && /^\d{4}$/.test(enteredPin) && portal.pin === enteredPin;
      const session = valid ? await issueDesignSession(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),contractorId,normalizedPortalId,portal.pin) : null;
      return new Response(JSON.stringify({valid,session,...(!portal?.pin ? {noPinSet:true} : {})}), {headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
    }

    // Fetch quotes for this contractor, then match the client server-side.
    // This keeps the stored PIN private while tolerating older quote payload keys.
    const query = supabase
      .from('quotes')
      .select('id,client_name,data')
      .eq('user_id', contractorId);

    const { data: quotes, error } = await query;

    if (error) throw new Error(error.message);

    let valid = false;
    let noPinSet = true;

    const matchingQuotes = (quotes || []).filter((quote) => {
      const data = quote.data || {};
      const quoteEmail = normalize(data.clientEmail || data.email || data.client_email);
      const quoteName = normalize(data.portal_client_name || quote.client_name || data.clientName || data.client_name);
      if (normalizedPortalId) {
        return data.portal_id === normalizedPortalId;
      }
      return (
        (normalizedQuoteId && quote.id === normalizedQuoteId) ||
        (normalizedEmail && quoteEmail && quoteEmail === normalizedEmail) ||
        (normalizedName && quoteName && quoteName === normalizedName) ||
        (normalizedEmail && quoteName && quoteName === normalizedEmail)
      );
    });

    // Legacy name/email routes must not become an unlimited PIN-guessing oracle
    // for a protected portal. Count against the same canonical portal scope.
    const scopes = [...new Set(matchingQuotes.map(quote => String(quote.data?.portal_id || ('legacy:' + quote.id))))];
    for (const scope of scopes) {
      const gate = await supabase.rpc('portal_design_pin_attempt', { p_scope:await digest(String(contractorId) + ':' + scope) });
      if (gate.error) throw new Error('Portal PIN service is temporarily unavailable');
      if (!gate.data) return new Response(JSON.stringify({valid:false,error:'Too many attempts. Please wait 15 minutes before trying again.'}), {status:429,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
    }

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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'PIN verification failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
