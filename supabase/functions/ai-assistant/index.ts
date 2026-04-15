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
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), {
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
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});