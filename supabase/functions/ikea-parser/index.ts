import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert at parsing IKEA kitchen order receipts. Use these EXACT abbreviation rules to classify each line:

== CABINET BOXES (SE = SEKTION line) ==
- "SE bas cab" → baseCabinet
- "SE wall cab" → wallCabinet
- "SE hi cab", "SE tall", "SE hs" → tallCabinet
- "SE cor" or any "corner" → cornerCabinet
- "SE susp rl", "SE N leg", "SE rnfrcd", "SE vent", "SE rail" → skip (hardware)

== DOORS ==
- "AXSTAD dr" (any variant: gls dr, dr, drwfr) → door (ALL AXSTAD items with "dr" are doors)
- VEDHAMN, KUNGSBACKA, JÄRSTA, LERHYTTAN, KALLARP → door

== DRAWERS ==
- "MA drw" or "MAXIMERA" → drawer

== FÖRBÄTTRA line ==
- "FÖRBÄTTRA Toe kick" or "FÖRBÄTTRA toe" → toeKick
- "FÖRBÄTTRA N cvr pnl" or "FÖRBÄTTRA cvr" or "FÖRBÄTTRA cover" → coverPanel
- "FÖRBÄTTRA rnd deco strip" or "FÖRBÄTTRA deco" or "FÖRBÄTTRA strip" → crownMoulding
- "FÖRBÄTTRA light val" or "FÖRBÄTTRA valance" → crownMoulding

== UTRUSTA line ==
- "UTRUSTA shlf" or "UTRUSTA shelf" → shelf (interior shelf, installable)
- "UTRUSTA hinge", "UTRUSTA NN hinge", "UTRUSTA dmpr", "UTRUSTA conn rail", "UTRUSTA pull-out" → skip
- "UTRUSTA rotating shelf" or "UTRUSTA carousel" → lazySusan
- When unsure about UTRUSTA: skip it

== COUNTERTOPS ==
- BADELUNDA, EKBACKEN, KASKER, NUMERAR → countertop

== DISHWASHER PANEL ==
- TUTEMO → dishwasherPanel

== ALWAYS SKIP ==
- Any line starting with "15% Kitchen", "PROMOTION", "Page", "delivery"
- EDSVIK, LILLVIKEN, HAVSEN, VRESJÖN (faucets/sinks)
- VARIERA (accessories)
- SE N leg, SE susp rl (legs and rails)
- Anything with: hinge, dmpr, screw, handle, knob, rail, bracket, clip, leg, delivery, sink, faucet, lid, strainer, stopper

For each recognized (non-skip) line:
- type: baseCabinet | wallCabinet | tallCabinet | cornerCabinet | drawer | door | coverPanel | toeKick | crownMoulding | countertop | dishwasherPanel | lazySusan | islandBase | shelf
- qty: integer quantity from the line (e.g. "2.00" → 2)
- label: short readable label with dimensions if visible (e.g. "Wall Cabinet 36x40", "AXSTAD Glass Door 18x40", "FÖRBÄTTRA Toe Kick 84")

Return ONLY a JSON array. No markdown, no explanation. Format: [{"type":"...","qty":1,"label":"..."}]`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'No order text provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.substring(0, 8000) }, // cap at 8k chars
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('OpenAI error: ' + err);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    // Parse — strip fences then try array or wrapped object
    content = content.replace(/```json?/g, '').replace(/```/g, '').trim();
    let parsed: any;
    try {
      const obj = JSON.parse(content);
      if (Array.isArray(obj)) {
        parsed = obj;
      } else {
        parsed = obj.items || obj.result || obj.data || obj.products || obj.kitchen_items
          || (Object.values(obj).find((v: any) => Array.isArray(v)) as any[]);
      }
    } catch(e) {
      throw new Error('Could not parse AI response: ' + content.substring(0, 300));
    }

    if (!Array.isArray(parsed)) throw new Error('Unexpected AI format: ' + content.substring(0, 200));

    const items = parsed.filter((item: any) => item.type !== 'skip' && item.qty > 0);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
