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
    const { imageBase64, mimeType, scale, ceilingHeight, trades, customItems, buildingWidth, buildingDepth } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing required field: imageBase64' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tradesRequested = trades || ['flooring', 'drywall', 'paint', 'framing'];
    const ceilingHt = ceilingHeight || 9;
    const scaleInfo = scale || 'Dimensions labeled on drawing';
    const buildingDimsInfo = (buildingWidth && buildingDepth)
      ? `KNOWN BUILDING DIMENSIONS: The overall building footprint is ${buildingWidth}' wide × ${buildingDepth}' deep. Use this as your anchor — all room dimensions must add up to these totals (accounting for wall thicknesses of ~6 inches per wall). If string dimensions on the drawing don't match individual room labels, trust these overall dimensions and divide proportionally.`
      : '';

    const systemPrompt = `You are an expert construction estimator who analyzes architectural floor plans and extracts room dimensions to calculate material quantities for renovation quotes.

TASK: Analyze the provided floor plan image and extract all rooms with their dimensions. Calculate quantities for the following trades: ${tradesRequested.join(', ')}.

SCALE INFORMATION: ${scaleInfo}
CEILING HEIGHT: ${ceilingHt} feet
${buildingDimsInfo}

INSTRUCTIONS:
1. Identify every room and area in the floor plan (bedrooms, bathrooms, kitchen, living room, hallways, etc.)
2. Read dimension labels directly from the drawing if present — these are the most accurate
3. If scale is provided and dimensions aren't labeled, use the scale to estimate room sizes
4. For each room, calculate quantities for the requested trades:
   - flooring: length × width × 1.10 (10% waste) = sqft
   - drywall: (perimeter × ceilingHeight × 1.12) - (doors × 21sqft) - (windows × 15sqft) — round up to nearest full sheet (32 sqft)
   - paint: wall area (same as drywall base before door/window deductions) + ceiling area (length × width) = total sqft
   - framing: perimeter in linear feet
   - tile: same calculation as flooring but labeled as tile
5. Be conservative — slightly overestimate rather than underestimate
6. If a room name is not labeled, infer from context (bathroom has toilet/tub symbols, kitchen has island/counters, etc.)

RETURN FORMAT: Return ONLY valid JSON with no markdown, no explanation, just the JSON object:
{
  "rooms": [
    {
      "name": "Living Room",
      "dimensions": { "length": 14, "width": 12, "area": 168, "perimeter": 52 },
      "items": [
        {
          "category": "Flooring",
          "description": "Flooring supply and install",
          "quantity": 185,
          "unitType": "sqft",
          "rate": 0,
          "notes": "168 sqft + 10% waste"
        }
      ]
    }
  ],
  "warnings": ["Any assumptions or uncertainties go here"],
  "totalArea": 1240
}

IMPORTANT: 
- rate is always 0 (contractor sets their own pricing)
- Only include items for the trades that were requested
- If dimensions are completely unreadable, include the room with a warning and your best estimate
- Do not include any text outside the JSON object`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI API error');
    }

    const result = await response.json();
    const content = result.choices[0].message.content.trim();

    // Parse the JSON response — strip any accidental markdown
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      throw new Error('Failed to parse AI response as JSON: ' + content.substring(0, 200));
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
