import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert at parsing IKEA kitchen order lists. Given raw IKEA order text, identify each product and classify it into one of these installation categories:
- baseCabinet: any SEKTION base/floor cabinet
- wallCabinet: any SEKTION wall/upper cabinet
- tallCabinet: any SEKTION tall/high/pantry cabinet
- cornerCabinet: any corner cabinet
- drawer: MAXIMERA or any drawer insert/box
- door: AXSTAD, VEDHAMN, KUNGSBACKA, JÄRSTA, LERHYTTAN, KALLARP, or any cabinet door/front
- coverPanel: any cover panel, filler, end panel
- toeKick: any toe kick strip
- crownMoulding: any crown moulding, light valance, cornice, PRÄGEL
- countertop: BADELUNDA, EKBACKEN, KASKER, NUMERAR or any countertop/worktop
- dishwasherPanel: any dishwasher door panel, TUTEMO
- lazySusan: any lazy susan, carousel, UTRUSTA rotating shelf
- islandBase: any island or peninsula cabinet
- skip: hinges, screws, handles, knobs, rails, brackets, clips, legs, suspension rails, accessories, lighting, sink, faucet — anything that is NOT a major structural install item

Return ONLY a valid JSON array, no explanation, no markdown. Each element: {"type": "categoryKey", "qty": number, "label": "short readable description"}`;

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
