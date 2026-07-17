import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  aiGuardErrorResponse,
  assertWithinAiInputLimit,
  jsonResponse,
  startAiUsage,
} from "../_shared/ai-guard.ts";
import {
  buildQuoteDrAssistantSystemPrompt,
  type QuoteDrAssistantContext,
} from "../_shared/quotedr-knowledge.ts";

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
    const { messages, feature, context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: 'No messages provided' }, 400, corsHeaders);
    }

    const aiFeature = feature === 'ai_refine'
      ? 'ai_refine'
      : feature === 'writing_suggestions'
        ? 'writing_suggestions'
        : 'ai_assistant';
    const inputChars = JSON.stringify({ messages, context }).length;
    usageGuard = await startAiUsage(req, { feature: aiFeature, endpoint: 'ai-assistant', inputChars });
    assertWithinAiInputLimit(usageGuard.policy, messages, usageGuard.policy.label);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiKey) {
      return jsonResponse({ error: 'OpenAI key not configured' }, 500, corsHeaders);
    }

    // Grounded-only product guide: QuoteDr workflow answers come from the shared knowledge module.
    const writingSuggestionsSystemPrompt = [
      'You are QuoteDr spell check, a precise proofreader for contractor quotes.',
      'Return only valid JSON. Do not use markdown.',
      'JSON shape: {"suggestions":[{"fieldId":"exact field id","original":"exact text from that field","replacement":"replacement text","reason":"short reason"}]}',
      'Check spelling, grammar, punctuation, and contractor-context homophones such as boarder/border.',
      'Preserve contractor meaning, product and brand names, measurements, prices, addresses, client names, and legal wording.',
      'Only return high-confidence corrections. Never invent a field id or rewrite a whole passage for style.',
      'Return at most 20 suggestions. If nothing needs changing, return {"suggestions":[]}.',
    ].join('\n');

    const assistantSystemPrompt = aiFeature === 'ai_refine'
      ? `You help QuoteDr users rewrite client-facing descriptions. Keep the user's meaning, make it clear and professional, and return only the refined wording.`
      : aiFeature === 'writing_suggestions'
        ? writingSuggestionsSystemPrompt
        : buildQuoteDrAssistantSystemPrompt(context as QuoteDrAssistantContext | undefined);

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
          { role: 'system', content: assistantSystemPrompt },
          ...messages,
        ],
        temperature: aiFeature === 'writing_suggestions' ? 0.1 : 0.7,
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
      metadata: { label: usageGuard.policy.label, messageCount: messages.length, hasContext: !!context },
    });

    return jsonResponse({ reply }, 200, corsHeaders);
  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
