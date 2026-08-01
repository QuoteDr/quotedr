import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  aiGuardErrorResponse,
  assertWithinAiInputLimit,
  jsonResponse,
  startAiUsage,
} from "../_shared/ai-guard.ts";

import {
  formatVoiceRoomTranscript,
  normalizePaintQuantities,
  splitVoiceRoomSections,
} from "../_shared/voice-quote-measurements.mjs";

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
    const { transcript, customItems, learnedMappings } = await req.json();
    if (!transcript) {
      return jsonResponse({ error: 'No transcript provided' }, 400, corsHeaders);
    }

    usageGuard = await startAiUsage(req, {
      feature: 'voice_quote',
      endpoint: 'parse-quote',
      inputChars: String(transcript).length,
    });
    assertWithinAiInputLimit(usageGuard.policy, transcript, 'Voice quote transcript');

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return jsonResponse({ error: 'OpenAI key not configured' }, 500, corsHeaders);
    }

    const roomSections = splitVoiceRoomSections(transcript);
    const voiceTranscriptForModel = formatVoiceRoomTranscript(transcript);
    const roomBoundaryRule = roomSections.length > 1
      ? `- The transcript contains ${roomSections.length} numbered room sections. Return exactly ${roomSections.length} room objects, one per section. The room object's sourceOrder must match its section number.`
      : '- Set sourceOrder to the 1-based order in which each room or area is first mentioned.';

    const systemPrompt = `You are a renovation quoting assistant. Parse the contractor's spoken description into a structured quote.

Return ONLY valid JSON in this exact format:
{
  "rooms": [
    {
      "name": "Room/Area Name",
      "sourceOrder": 1,
      "items": [
        {
          "category": "Category Name",
          "description": "Item description",
          "quantity": 1,
          "unit": "unit",
          "rate": 0,
          "total": 0,
          "spokenPhrase": "exact verbatim excerpt the contractor said for this item",
          "calculation": "brief quantity math when dimensions are used"
        }
      ]
    }
  ]
}

Categories to use (pick the closest match):
Demolition, Concrete & Masonry, Waterproofing, Rough Framing, Windows & Exterior Doors, Rough Plumbing, Rough Electrical, HVAC / Ductwork, Insulation, Drywall, Tile & Stone, Flooring, Interior Doors, Trim & Millwork, Cabinets & Vanities, Finish Plumbing, Finish Electrical, Carpentry & Baseboards, Painting, Cleaning & Disposal, Miscellaneous

Rules:
- Include every room or area and every requested item. There is no three-room limit.
- Keep rooms in the exact order the contractor first mentions them.
- Never combine separately named rooms or areas unless the contractor explicitly describes them as one combined area.
- Treat every "next room" marker and every numbered ROOM SECTION label as a hard boundary. Never skip, merge, or reorder those sections.
${roomBoundaryRule}
- If no specific price is mentioned, set rate and total to 0 (contractor will fill in)
- Use realistic unit types: sqft, lf, ea, hr, ls (lump sum)
- Keep descriptions concise and professional
- If the contractor mentions a bathroom, create a separate room for it
- IMPORTANT: If a user price list is provided, match items to it as closely as possible and use those exact prices and unit types. Only use $0 for items not in the price list.
- spokenPhrase must be an exact, contiguous excerpt from the supplied transcript. Copy it verbatim; never summarize, paraphrase, or replace it with a familiar price-list or learned-mapping phrase.
- Keep every distinguishing word the contractor spoke in spokenPhrase, including dimensions, numbers, materials, locations, and qualifiers such as interior or exterior. For example, preserve "trim up a five-foot exterior door" instead of shortening it to "trim up a door".
- A price-list or learned-dictionary match may set description, category, unit, and rate, but it must never rewrite spokenPhrase.
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
        const itemList = Array.isArray(items)
          ? items
          : (items && typeof items === 'object' ? Object.values(items as Record<string, any>) : []);
        for (const item of itemList as any[]) {
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

    const model = Deno.env.get('OPENAI_VOICE_MODEL') || 'gpt-4o-mini';
    const baseMessages = [
      { role: 'system', content: systemPrompt + materialsRef + learningRef },
      { role: 'user', content: voiceTranscriptForModel },
    ];
    const requestQuoteCompletion = async (messages: any[]) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: usageGuard.policy.maxOutputTokens,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI error: ${err}`);
      }
      return await response.json();
    };
    const parseCompletion = (data: any) => {
      const content = String(data?.choices?.[0]?.message?.content || '').trim();
      const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      return { content, parsed: JSON.parse(jsonStr) };
    };
    const combineUsage = (first: any, second: any) => ({
      prompt_tokens: Number(first?.prompt_tokens || 0) + Number(second?.prompt_tokens || 0),
      completion_tokens: Number(first?.completion_tokens || 0) + Number(second?.completion_tokens || 0),
      total_tokens: Number(first?.total_tokens || 0) + Number(second?.total_tokens || 0),
    });

    let data = await requestQuoteCompletion(baseMessages);
    let completion = parseCompletion(data);
    let roomRepairUsed = false;
    if (roomSections.length > 1 && (!Array.isArray(completion.parsed?.rooms) || completion.parsed.rooms.length !== roomSections.length)) {
      roomRepairUsed = true;
      const actualCount = Array.isArray(completion.parsed?.rooms) ? completion.parsed.rooms.length : 0;
      const repairInstruction = `Your response returned ${actualCount} room objects, but the transcript has ${roomSections.length} hard-bounded room sections. Return a complete replacement JSON object with exactly ${roomSections.length} rooms. Keep one room per numbered section and preserve section order. Do not combine or omit any section.`;
      const repairData = await requestQuoteCompletion(baseMessages.concat([
        { role: 'assistant', content: completion.content },
        { role: 'user', content: repairInstruction },
      ]));
      repairData.usage = combineUsage(data.usage || {}, repairData.usage || {});
      data = repairData;
      completion = parseCompletion(data);
    }
    if (roomSections.length > 1 && (!Array.isArray(completion.parsed?.rooms) || completion.parsed.rooms.length !== roomSections.length)) {
      throw new Error('AI could not preserve every spoken room. Please generate again; your transcript is still available.');
    }
    const parsed = normalizePaintQuantities(completion.parsed, transcript);
    await usageGuard.recordSuccess({
      model,
      usage: data.usage || {},
      metadata: {
        label: usageGuard.policy.label,
        customItemCategories: customItems && typeof customItems === 'object' ? Object.keys(customItems).length : 0,
        learnedMappings: Array.isArray(learnedMappings) ? learnedMappings.length : 0,
        roomSections: roomSections.length,
        roomRepairUsed,
      },
    });

    return jsonResponse(parsed, 200, corsHeaders);

  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
