import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJsonObject(text: string) {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.trim().replace(new RegExp("^" + fence + "(?:json)?", "i"), "").replace(new RegExp(fence + "$", "i"), "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

async function callOpenAI(openaiKey: string, imageBase64: string, mimeType: string, prompt: string) {
  const model = Deno.env.get("FLOOR_PLAN_OPENAI_MODEL") || "gpt-4o";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + openaiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: "data:" + (mimeType || "image/jpeg") + ";base64," + imageBase64,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let message = "OpenAI API error";
    try {
      const err = await response.json();
      message = err.error?.message || message;
    } catch (_e) {
      message = await response.text();
    }
    throw new Error(message);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "{}";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, imageBase64, mimeType } = body;

    if (!imageBase64) {
      return jsonResponse({ error: "Missing required field: imageBase64" }, 400);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500);
    }

    if (mode !== "rooms_only") {
      return jsonResponse({ error: "Use mode: rooms_only" }, 400);
    }

    const prompt = [
      "List only the room or area names visibly labeled on this floor plan.",
      "Return JSON only with this schema: {\"rooms\":[\"Room Name 1\"]}.",
      "Include hallways, porches, utility rooms, closets, bathrooms, bedrooms, kitchens, dining, living, garage, laundry, stairs, and offices when labeled.",
      "Do not estimate measurements. Do not infer dimensions. Do not invent names that are not visible.",
      "Use title case. Max 20 rooms."
    ].join(" ");

    const content = await callOpenAI(openaiKey, imageBase64, mimeType, prompt);
    const parsed = extractJsonObject(content);
    const rooms = Array.isArray(parsed.rooms) && parsed.rooms.length
      ? parsed.rooms.map((room: unknown) => String(room).trim()).filter(Boolean).slice(0, 20)
      : ["Living Room", "Kitchen", "Dining", "Bathroom", "Bedroom"];

    return jsonResponse({ rooms });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});