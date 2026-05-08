import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  aiGuardErrorResponse,
  assertWithinAiInputLimit,
  jsonResponse,
  startAiUsage,
} from "../_shared/ai-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let usageGuard: any = null;
  try {
    const { content, type } = await req.json();
    if (!content || !type) {
      return jsonResponse({ error: 'Missing content or type' }, 400, corsHeaders);
    }
    if (type !== 'materials' && type !== 'clients') {
      return jsonResponse({ error: 'Unsupported smart import type' }, 400, corsHeaders);
    }

    usageGuard = await startAiUsage(req, {
      feature: 'smart_import',
      endpoint: 'smart-import',
      inputChars: String(content).length,
    });
    assertWithinAiInputLimit(usageGuard.policy, content, 'Import file content');

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return jsonResponse({ error: 'OpenAI key not configured' }, 500, corsHeaders);
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
- Extract EVERY valid item from the whole input. Do not return only a sample or the first 10 rows.
- Merge obvious duplicate items only when they clearly refer to the same item and same price/unit.
- Group items by category. If no category is obvious, use "General" or infer from context (e.g. tile items → "Tile & Stone", labour items → "Labour")
- unitType should be one of: sqft, lf, ea, hr, ls, bag, sheet, box — pick closest match
- rate is the price/cost as a number (no $ sign)
- materialCost defaults to 0 if not specified
- If the data has columns, figure out which column is name, which is price, which is unit
- Clean up item names — capitalize properly, remove weird characters
- If something is clearly not a price list item (headers, totals, notes), skip it
- The count must equal the total number of item objects returned across all categories.
- Return ONLY the JSON, no explanation`;
    } else if (type === 'clients') {
      systemPrompt = `You are a data parser for a renovation contractor app. Parse the user's client list into structured JSON.

The user may have their data in ANY format — phone contacts export, spreadsheet, hand-typed notes, etc.

Return ONLY valid JSON in this exact format:
{
  "clients": [
    { "name": "Full Name", "phone": "416-555-1234", "email": "email@example.com", "address": "123 Main St", "city": "Toronto", "notes": "" }
  ],
  "count": 42
}

Rules:
- Extract EVERY valid client/person/household from the whole input. Do not stop at 10 and do not return only a preview.
- Merge obvious duplicates into one best client record, preserving alternate spellings or job labels in notes when useful.
- Extract name, phone, email, address, city, notes from whatever format is given
- Name should be "First Last" format
- Phone should be formatted as XXX-XXX-XXXX if possible
- Leave fields empty string "" if not found
- Skip obviously invalid entries (just numbers, empty lines, etc)
- Job-name-only rows with no contact details should usually be notes on a nearby matching client, not separate clients.
- The count must equal the number of client objects returned.
- Return ONLY the JSON, no explanation`;
    }

    const model = 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: String(content) }
        ],
        temperature: 0.1,
        max_tokens: usageGuard.policy.maxOutputTokens,
        response_format: { type: 'json_object' },
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
    await usageGuard.recordSuccess({
      model,
      usage: data.usage || {},
      metadata: { label: usageGuard.policy.label, importType: type },
    });

    return jsonResponse(parsed, 200, corsHeaders);

  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
