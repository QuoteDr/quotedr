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
    const { content, type } = await req.json();
    if (!content || !type) {
      return new Response(JSON.stringify({ error: 'Missing content or type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let systemPrompt = '';

    if (type === 'materials') {
      systemPrompt = `You are a data parser for a renovation contractor app. Parse the user's price list into structured JSON.

The user may have their data in ANY format — spreadsheet rows, hand-typed notes, old software exports, CSV, tab-separated, etc.

Return ONLY valid JSON in this exact format:
{
  "categories": {
    "Category Name": [
      { "name": "Item name", "unitType": "sqft", "rate": 12.50, "materialCost": 0 }
    ]
  },
  "count": 42
}

Rules:
- Group items by category. If no category is obvious, use "General" or infer from context (e.g. tile items → "Tile & Stone", labour items → "Labour")
- unitType should be one of: sqft, lf, ea, hr, ls, bag, sheet, box — pick closest match
- rate is the price/cost as a number (no $ sign)
- materialCost defaults to 0 if not specified
- If the data has columns, figure out which column is name, which is price, which is unit
- Clean up item names — capitalize properly, remove weird characters
- If something is clearly not a price list item (headers, totals, notes), skip it
- Return ONLY the JSON, no explanation`;
    } else if (type === 'clients') {
      systemPrompt = `You are a data parser for a renovation contractor app. Parse the user's client list into structured JSON.

The user may have their data in ANY format — phone contacts export, spreadsheet, hand-typed notes, etc.

Return ONLY valid JSON in this exact format:
{
  "clients": [
    { "name": "Full Name", "phone": "416-555-1234", "email": "email@example.com", "address": "123 Main St", "city": "Toronto", "notes": "" }
  ],
  "count": 10
}

Rules:
- Extract name, phone, email, address, city, notes from whatever format is given
- Name should be "First Last" format
- Phone should be formatted as XXX-XXX-XXXX if possible
- Leave fields empty string "" if not found
- Skip obviously invalid entries (just numbers, empty lines, etc)
- Return ONLY the JSON, no explanation`;
    }

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
          { role: 'user', content: String(content).slice(0, 8000) }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content.trim();
    const jsonStr = result.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});