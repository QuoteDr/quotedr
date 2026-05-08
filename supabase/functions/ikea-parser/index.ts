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

const SYSTEM_PROMPT = `You are an expert at parsing IKEA kitchen order receipts. Use these EXACT abbreviation rules to classify each line:

== CABINET BOXES (SE = SEKTION line) ==
- "SE bas cab" = baseCabinet
- "SE wall cab" = wallCabinet
- "SE hi cab", "SE tall", "SE hs" = tallCabinet
- "SE cor" or any "corner" = cornerCabinet
- "SE susp rl", "SE N leg", "SE rnfrcd", "SE vent", "SE rail" = skip

== DOORS ==
- "AXSTAD dr" (any variant: gls dr, dr, drwfr) = door
- VEDHAMN, KUNGSBACKA, KALLARP, LERHYTTAN = door

== DRAWERS ==
- "MA drw" or "MAXIMERA" = drawer

== FORBATTRA line ==
- "FORBATTRA Toe kick" or "FORBATTRA toe" = toeKick
- "FORBATTRA N cvr pnl" or "FORBATTRA cvr" = coverPanel
- "FORBATTRA rnd deco strip" or "FORBATTRA deco" or "FORBATTRA strip" = crownMoulding

== UTRUSTA line ==
- "UTRUSTA shlf" or "UTRUSTA shelf" = shelf
- "UTRUSTA rotating shelf" or "UTRUSTA carousel" = lazySusan
- All other UTRUSTA = skip

== COUNTERTOPS ==
- BADELUNDA, EKBACKEN, KASKER, NUMERAR = countertop

== DISHWASHER PANEL ==
- TUTEMO = dishwasherPanel

== ALWAYS SKIP ==
- Lines starting with: 15% Kitchen, PROMOTION, Page, delivery
- EDSVIK, LILLVIKEN, HAVSEN, VRESJON (faucets/sinks)
- VARIERA (accessories)
- Anything with: hinge, dmpr, screw, handle, knob, rail, bracket, clip, leg, sink, faucet, lid, strainer, stopper

For each recognized line return:
- type: baseCabinet, wallCabinet, tallCabinet, cornerCabinet, drawer, door, coverPanel, toeKick, crownMoulding, countertop, dishwasherPanel, lazySusan, islandBase, or shelf
- qty: integer quantity (e.g. "2.00" becomes 2)
- label: short readable description with dimensions

IMPORTANT: Return a JSON array even if there is only one item. Always use array format: [{"type":"...","qty":1,"label":"..."}]`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let usageGuard: any = null;
  try {
    const body = await req.json();
    const text = body.text;
    if (!text || text.trim().length < 5) {
      return jsonResponse({ error: 'No order text provided' }, 400, corsHeaders);
    }

    usageGuard = await startAiUsage(req, {
      feature: 'ikea_parser',
      endpoint: 'ikea-parser',
      inputChars: String(text).length,
    });
    assertWithinAiInputLimit(usageGuard.policy, text, 'IKEA order text');

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'OpenAI API key not configured' }, 500, corsHeaders);
    }

    const model = 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.substring(0, 8000) },
        ],
        temperature: 0,
        max_tokens: usageGuard.policy.maxOutputTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('OpenAI error: ' + err);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch(e) {
      throw new Error('Could not parse AI response: ' + content.substring(0, 300));
    }

    if (!Array.isArray(parsed)) {
      if (parsed && typeof parsed === 'object') {
        if (parsed.type) {
          parsed = [parsed];
        } else {
          const keys = Object.keys(parsed);
          for (const key of keys) {
            if (Array.isArray(parsed[key])) {
              parsed = parsed[key];
              break;
            }
          }
        }
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error('AI did not return an array: ' + content.substring(0, 200));
    }

    const items = parsed.filter((item: any) => item.type !== 'skip' && item.qty > 0);
    await usageGuard.recordSuccess({
      model,
      usage: data.usage || {},
      metadata: { label: usageGuard.policy.label, itemCount: items.length },
    });

    return jsonResponse({ items }, 200, corsHeaders);

  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
