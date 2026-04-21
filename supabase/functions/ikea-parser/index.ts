import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert at parsing IKEA kitchen order receipts. IKEA uses specific abbreviations — learn these exact patterns:

SE = SEKTION cabinet line. The format is: "SE [type] [description] [dimensions]"
- "SE bas cab" or "SE bas" = baseCabinet (base cabinet)
- "SE wall cab" or "SE wall" = wallCabinet (wall/upper cabinet)
- "SE hi cab" or "SE tall" or "SE hs" = tallCabinet (tall/high/pantry cabinet)
- "SE cor" or "SE corner" = cornerCabinet
- "SE cvr" or "SE cover" or "SE fil" or "SE filler" or "SE end" = coverPanel
- "SE toe" or "SE tk" = toeKick
- "SE shelf" or "SE shlf" = shelf
- "SE rnfrcd" or "SE rail" or "SE suspension" or "SE vent" = skip (structural hardware, not an install item)

MA or MAXIMERA = drawer box/insert → drawer
AXSTAD = cabinet door/drawer front → door ("drwfr" means drawer front which is a door panel)
VEDHAMN, KUNGSBACKA, JÄRSTA, LERHYTTAN, KALLARP = door
PRÄGEL = crownMoulding
BADELUNDA, EKBACKEN, KASKER, NUMERAR = countertop
TUTEMO = dishwasherPanel
UTRUSTA = usually skip (hardware/rails) UNLESS it says "rotating shelf" or "carousel" → lazySusan
EDSVIK, LILLVIKEN, HAVSEN = skip (faucets/sinks)

Lines starting with "15% Kitchen", "PROMOTION", "Page", or showing only a discount amount = skip entirely

For each non-skip product line, extract:
- type: one of baseCabinet, wallCabinet, tallCabinet, cornerCabinet, drawer, door, coverPanel, toeKick, crownMoulding, countertop, dishwasherPanel, lazySusan, islandBase, shelf
- qty: the quantity number from the line (3rd column, e.g. "3.00" → 3)
- label: short human-readable description (e.g. "Base Cabinet 30x24x30", "Wall Cabinet 24x40", "AXSTAD Drawer Front 30x10")

Return ONLY a valid JSON array. No explanation, no markdown. Each element: {"type": "categoryKey", "qty": number, "label": "description"}`;

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

    // Parse — model returns either array directly or wrapped in object
    let parsed;
    try {
      const obj = JSON.parse(content);
      parsed = Array.isArray(obj) ? obj : (obj.items || obj.result || Object.values(obj)[0]);
    } catch(e) {
      // Strip markdown fences if present
      content = content.replace(/```json?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    }

    if (!Array.isArray(parsed)) throw new Error('Unexpected response format from AI');

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
