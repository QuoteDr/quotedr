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
    const { transcript } = await req.json();
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'No transcript provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `You are a renovation quoting assistant. Parse the contractor's spoken description into a structured quote.

Return ONLY valid JSON in this exact format:
{
  "rooms": [
    {
      "name": "Room/Area Name",
      "items": [
        {
          "category": "Category Name",
          "description": "Item description",
          "quantity": 1,
          "unit": "unit",
          "rate": 0,
          "total": 0
        }
      ]
    }
  ]
}

Categories to use (pick the closest match):
Demolition, Concrete & Masonry, Waterproofing, Rough Framing, Windows & Exterior Doors, Rough Plumbing, Rough Electrical, HVAC / Ductwork, Insulation, Drywall, Tile & Stone, Flooring, Interior Doors, Trim & Millwork, Cabinets & Vanities, Finish Plumbing, Finish Electrical, Carpentry & Baseboards, Painting, Cleaning & Disposal, Miscellaneous

Rules:
- Group items logically by room or area
- If no specific price is mentioned, set rate and total to 0 (contractor will fill in)
- Use realistic unit types: sqft, lf, ea, hr, ls (lump sum)
- Keep descriptions concise and professional
- If the contractor mentions a bathroom, create a separate room for it
- Return ONLY the JSON, no explanation`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Strip markdown code blocks if present
    const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});