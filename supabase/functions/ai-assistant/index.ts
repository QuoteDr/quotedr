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
    const { messages, feature } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: 'No messages provided' }, 400, corsHeaders);
    }

    const aiFeature = feature === 'ai_refine' ? 'ai_refine' : 'ai_assistant';
    const inputChars = JSON.stringify(messages).length;
    usageGuard = await startAiUsage(req, { feature: aiFeature, endpoint: 'ai-assistant', inputChars });
    assertWithinAiInputLimit(usageGuard.policy, messages, usageGuard.policy.label);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiKey) {
      return jsonResponse({ error: 'OpenAI key not configured' }, 500, corsHeaders);
    }

    const systemPrompt = `You are QuoteDr Assistant, a helpful AI built into QuoteDr.io — a quoting and invoicing app for renovation contractors. You help contractors with:
- How to use QuoteDr features (adding rooms, line items, sending quotes, saving, dashboard, settings)
- Renovation business advice (pricing strategies, client communication, job scoping)
- Quick answers about the app workflow
- Suggesting what to include in quotes for specific renovation types

QuoteDr App Flow:
- Quote Builder: Add rooms/areas, add line items per room with category/description/qty/rate, set deposit %, add terms
- Send Quote: Saves to cloud, generates shareable link for client
- Dashboard: View all saved quotes, open/edit them
- Settings: Import materials price list, manage clients, business profile
- AI Quote: Tap mic, describe job verbally, AI generates the quote structure
- Invoice: Convert quote to invoice

Keep answers concise and practical. Use bullet points for steps. If asked how to do something in the app, give clear step-by-step instructions. You are friendly, helpful, and speak like a knowledgeable contractor buddy.`;

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
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: usageGuard.policy.maxOutputTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();
    await usageGuard.recordSuccess({
      model,
      usage: data.usage || {},
      metadata: { label: usageGuard.policy.label, messageCount: messages.length },
    });

    return jsonResponse({ reply }, 200, corsHeaders);
  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
