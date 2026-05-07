import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function roundQuantity(value: number) {
  if (!isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function extractRoomDimensions(text: string) {
  const lower = String(text || '').toLowerCase();
  const dimMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/);
  if (!dimMatch) return null;
  const length = parseFloat(dimMatch[1]);
  const width = parseFloat(dimMatch[2]);
  if (!isFinite(length) || !isFinite(width) || length <= 0 || width <= 0) return null;
  let height = 8;
  let heightProvided = false;
  const heightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:high|height|ceilings?|walls?)/)
    || lower.match(/(?:ceiling|wall)\s*(?:height|is|are)?\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/);
  if (heightMatch) {
    const parsedHeight = parseFloat(heightMatch[1]);
    if (isFinite(parsedHeight) && parsedHeight > 0) {
      height = parsedHeight;
      heightProvided = true;
    }
  }
  return {
    length,
    width,
    height,
    heightProvided,
    floorArea: roundQuantity(length * width),
    wallArea: roundQuantity((length + width) * 2 * height),
  };
}

function normalizePaintQuantities(parsed: any, transcript: string) {
  const dims = extractRoomDimensions(transcript);
  if (!dims || !parsed || !Array.isArray(parsed.rooms)) return parsed;
  parsed.rooms.forEach((room: any) => {
    if (!room || !Array.isArray(room.items)) return;
    room.dimensions = {
      length: dims.length,
      width: dims.width,
      height: dims.height,
      heightProvided: dims.heightProvided,
      floorArea: dims.floorArea,
      wallArea: dims.wallArea,
    };
    room.items.forEach((item: any) => {
      const label = `${item.category || ''} ${item.description || ''} ${item.spokenPhrase || ''}`.toLowerCase();
      const isPaint = label.includes('paint') || label.includes('painting');
      if (!isPaint) return;
      if (label.includes('wall')) {
        item.quantity = dims.wallArea;
        item.unit = item.unit || 'sqft';
        item.calculation = `Wall paint sqft = perimeter x height = (${dims.length}+${dims.width})x2x${dims.height} = ${dims.wallArea} sqft`;
        item.needsMeasurement = dims.heightProvided ? undefined : 'ceiling_height';
        item.total = roundQuantity((parseFloat(item.rate) || 0) * dims.wallArea);
      } else if (label.includes('ceiling')) {
        item.quantity = dims.floorArea;
        item.unit = item.unit || 'sqft';
        item.calculation = `Ceiling paint sqft = length x width = ${dims.length}x${dims.width} = ${dims.floorArea} sqft`;
        item.total = roundQuantity((parseFloat(item.rate) || 0) * dims.floorArea);
      }
    });
  });
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transcript, customItems, learnedMappings } = await req.json();
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
          "total": 0,
          "spokenPhrase": "short phrase the contractor said for this item",
          "calculation": "brief quantity math when dimensions are used"
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
- IMPORTANT: If a user price list is provided, match items to it as closely as possible and use those exact prices and unit types. Only use $0 for items not in the price list.
- Preserve each requested service in spokenPhrase so the app can ask the user to verify and remember it later.
- When dimensions are provided, calculate quantities with explicit trade math. Do not use vague rules of thumb when a formula is available.
- Wall paint formula is mandatory: wall paint sqft = room perimeter x wall height. Perimeter = (length + width) x 2. Example: a 12ft x 12ft room with 8ft walls has wall paint = (12+12)x2x8 = 384 sqft. Do not use floor area x 2 for wall paint.
- Ceiling paint sqft = length x width.
- Baseboard linear feet = room perimeter, minus openings only if the contractor states openings/door widths.
- Drywall/paint wall area should use perimeter x height unless the contractor gives exact wall areas.
- Return ONLY the JSON, no explanation`;

    // Build materials reference from user's custom items
    let materialsRef = '';
    if (customItems && typeof customItems === 'object') {
      const lines: string[] = [];
      for (const [category, items] of Object.entries(customItems)) {
        if (!Array.isArray(items)) continue;
        for (const item of items as any[]) {
          if (item.name && item.rate) {
            lines.push(`${category} | ${item.name} | ${item.unitType || item.unit || 'ls'} | $${parseFloat(item.rate).toFixed(2)}`);
          }
        }
      }
      if (lines.length > 0) {
        materialsRef = `\n\nUSER'S PRICE LIST (use these exact prices and descriptions when they match):\n${lines.slice(0, 100).join('\n')}`;
      }
    }

    let learningRef = '';
    if (Array.isArray(learnedMappings) && learnedMappings.length > 0) {
      const lines = learnedMappings.slice(0, 60).map((m: any) => {
        return `${m.spoken_phrase || ''} => ${m.mapped_item_category || 'Miscellaneous'} | ${m.mapped_item_name || ''} | ${m.mapped_unit || 'ls'} | $${parseFloat(m.mapped_price || 0).toFixed(2)} | confidence ${m.usage_count || 0}`;
      });
      learningRef = `\n\nUSER'S LEARNED VOICE DICTIONARY (prefer these mappings when the spoken phrase matches):\n${lines.join('\n')}`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_VOICE_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt + materialsRef + learningRef },
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
    const parsed = normalizePaintQuantities(JSON.parse(jsonStr), transcript);

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
