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
import {
  buildVoiceQuoteAuditClaims,
  criticalVoiceQuoteAuditIssues,
  findVoiceQuoteAuditIssues,
} from "../_shared/voice-quote-audit.mjs";

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
    const requestQuoteCompletion = async (messages: any[], temperature = 0.2) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: usageGuard.policy.maxOutputTokens,
          response_format: { type: 'json_object' },
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

    const cloneQuote = (value: any) => JSON.parse(JSON.stringify(value || {}));
    const roomCountIsValid = (value: any) => roomSections.length <= 1
      || (Array.isArray(value?.rooms) && value.rooms.length === roomSections.length);
    const issueCodes = (issues: any[]) => [...new Set((issues || [])
      .map((issue: any) => String(issue?.code || ''))
      .filter(Boolean))];

    const initialData = await requestQuoteCompletion(baseMessages);
    const initialCompletion = parseCompletion(initialData);
    const initialNormalized = normalizePaintQuantities(cloneQuote(initialCompletion.parsed), transcript);
    const initialIssues = findVoiceQuoteAuditIssues(initialNormalized, transcript);
    const initialRoomCountValid = roomCountIsValid(initialNormalized);
    const auditInstruction = `Act as an independent final estimator audit. Do not trust or merely approve the draft. Compare it word-for-word with the original numbered transcript and return a complete replacement JSON object in the exact same quote shape.

Audit checklist:
1. Account for every separately spoken job, room, and area exactly once.
2. Preserve every explicit count in quote quantity or calculation. "Five exterior doors" means five doors, while "a five-foot exterior door" means one door with a five-foot dimension.
3. Preserve distinguishing materials, dimensions, locations, and qualifiers such as interior versus exterior.
4. Every spokenPhrase must be an exact contiguous excerpt from the original transcript, never a shortened familiar rule or price-list phrase.
5. Keep all correct draft work while repairing omissions, duplicates, room merges, wrong quantities, or weakened descriptions.
6. Return only the complete corrected JSON quote. Do not return an audit report or commentary.

The deterministic pre-check found ${initialIssues.length} possible issue(s) across these categories: ${issueCodes(initialIssues).join(', ') || 'none'}. The transcript has ${roomSections.length} hard-bounded room section(s).`;
    let data = await requestQuoteCompletion(baseMessages.concat([
      { role: 'assistant', content: initialCompletion.content },
      { role: 'user', content: auditInstruction },
    ]), 0);
    data.usage = combineUsage(initialData.usage || {}, data.usage || {});
    let completion = parseCompletion(data);
    let parsed = normalizePaintQuantities(completion.parsed, transcript);
    let remainingCriticalIssues = criticalVoiceQuoteAuditIssues(parsed, transcript);
    let auditRepairUsed = false;

    if (!roomCountIsValid(parsed) || remainingCriticalIssues.length) {
      auditRepairUsed = true;
      const actualCount = Array.isArray(parsed?.rooms) ? parsed.rooms.length : 0;
      const repairInstruction = `The independent audit still failed deterministic safety checks. Return a complete replacement JSON object, not a patch. Preserve all correct work and fix every remaining issue. Required room sections: ${roomSections.length}; returned rooms: ${actualCount}; remaining issue categories: ${issueCodes(remainingCriticalIssues).join(', ') || 'room_count_mismatch'}. Recheck every spoken action and explicit count. Do not shorten spokenPhrase. Return JSON only.`;
      const repairData = await requestQuoteCompletion(baseMessages.concat([
        { role: 'assistant', content: completion.content },
        { role: 'user', content: repairInstruction },
      ]), 0);
      repairData.usage = combineUsage(data.usage || {}, repairData.usage || {});
      data = repairData;
      completion = parseCompletion(data);
      parsed = normalizePaintQuantities(completion.parsed, transcript);
      remainingCriticalIssues = criticalVoiceQuoteAuditIssues(parsed, transcript);
    }
    if (!roomCountIsValid(parsed)) {
      throw new Error('AI could not preserve every spoken room. Please generate again; your transcript is still available.');
    }
    if (remainingCriticalIssues.length) {
      throw new Error('AI could not verify every spoken item and quantity. Please generate again; your transcript is still available.');
    }
    const finalIssues = findVoiceQuoteAuditIssues(parsed, transcript);
    const auditChangedQuote = JSON.stringify(initialNormalized) !== JSON.stringify(parsed);
    const roomRepairUsed = !initialRoomCountValid && roomCountIsValid(parsed);
    const auditClaims = buildVoiceQuoteAuditClaims(transcript);
    parsed._voiceAudit = {
      status: auditChangedQuote || auditRepairUsed ? 'corrected' : 'verified',
      passes: auditRepairUsed ? 3 : 2,
      initialIssueCount: initialIssues.length,
      remainingWarningCount: finalIssues.filter((issue: any) => issue.severity === 'warning').length,
      claims: auditClaims,
    };
    await usageGuard.recordSuccess({
      model,
      usage: data.usage || {},
      metadata: {
        label: usageGuard.policy.label,
        customItemCategories: customItems && typeof customItems === 'object' ? Object.keys(customItems).length : 0,
        learnedMappings: Array.isArray(learnedMappings) ? learnedMappings.length : 0,
        roomSections: roomSections.length,
        roomRepairUsed,
        voiceAuditPasses: parsed._voiceAudit.passes,
        voiceAuditChangedQuote: auditChangedQuote,
        voiceAuditRepairUsed: auditRepairUsed,
        voiceAuditInitialIssues: initialIssues.length,
        voiceAuditRemainingWarnings: parsed._voiceAudit.remainingWarningCount,
        voiceAuditWorkClaims: auditClaims.work.length,
        voiceAuditCountClaims: auditClaims.counts.length,
        voiceAuditQualifierClaims: auditClaims.qualifiers.length,
      },
    });

    return jsonResponse(parsed, 200, corsHeaders);

  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
