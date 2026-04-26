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
    const body = await req.json();
    const { mode, imageBase64, mimeType } = body;

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

    // rooms_only mode: cheap low-res call just to identify room names
    if (mode === 'rooms_only') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + openaiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 300,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'List the room names visible on this floor plan. Return JSON only with no markdown: {"rooms": ["Room Name 1", "Room Name 2"]}. Include hallways, porches, utility rooms, closets. Max 15 rooms.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: 'data:' + (mimeType || 'image/jpeg') + ';base64,' + imageBase64,
                    detail: 'low'
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

      let rooms = ['Living Room', 'Kitchen', 'Dining', 'Bathroom', 'Bedroom'];
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
        if (parsed.rooms && Array.isArray(parsed.rooms) && parsed.rooms.length > 0) {
          rooms = parsed.rooms;
        }
      } catch (_e) {
        // fall back to defaults
      }

      return new Response(JSON.stringify({ rooms }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Any other mode is unsupported
    return new Response(JSON.stringify({ error: 'Use mode: rooms_only' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
