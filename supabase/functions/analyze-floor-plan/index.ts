import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FloorPlanRoom = {
  name: string;
  lengthFt?: number | null;
  widthFt?: number | null;
  areaSqft?: number | null;
  perimeterFt?: number | null;
  confidence?: number;
  source?: "label" | "dimension" | "scale" | "inferred" | "manual";
  evidence?: string;
  notes?: string;
};

type FloorPlanAnalysis = {
  rooms: FloorPlanRoom[];
  rawDimensions: string[];
  scaleText: string;
  overallDimensions: {
    widthFt?: number | null;
    depthFt?: number | null;
    evidence?: string;
  };
  warnings: string[];
  confidence: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampConfidence(value: unknown, fallback = 0.35) {
  const n = toNumber(value);
  if (n === null) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeRoom(room: Record<string, unknown>, index: number): FloorPlanRoom {
  const lengthFt = toNumber(room.lengthFt ?? room.length_ft ?? room.length);
  const widthFt = toNumber(room.widthFt ?? room.width_ft ?? room.width);
  let areaSqft = toNumber(room.areaSqft ?? room.area_sqft ?? room.area);
  let perimeterFt = toNumber(room.perimeterFt ?? room.perimeter_ft ?? room.perimeter);

  if ((areaSqft === null || areaSqft <= 0) && lengthFt && widthFt) {
    areaSqft = Math.round(lengthFt * widthFt * 10) / 10;
  }
  if ((perimeterFt === null || perimeterFt <= 0) && lengthFt && widthFt) {
    perimeterFt = Math.round(2 * (lengthFt + widthFt) * 10) / 10;
  }

  const confidence = clampConfidence(room.confidence, lengthFt && widthFt ? 0.55 : 0.25);
  const sourceRaw = String(room.source || "").toLowerCase();
  const source = ["label", "dimension", "scale", "inferred", "manual"].includes(sourceRaw)
    ? sourceRaw as FloorPlanRoom["source"]
    : (lengthFt && widthFt ? "dimension" : "inferred");

  return {
    name: String(room.name || `Room ${index + 1}`).trim().slice(0, 60),
    lengthFt: lengthFt && lengthFt > 0 ? Math.round(lengthFt * 10) / 10 : null,
    widthFt: widthFt && widthFt > 0 ? Math.round(widthFt * 10) / 10 : null,
    areaSqft: areaSqft && areaSqft > 0 ? Math.round(areaSqft * 10) / 10 : null,
    perimeterFt: perimeterFt && perimeterFt > 0 ? Math.round(perimeterFt * 10) / 10 : null,
    confidence,
    source,
    evidence: String(room.evidence || "").trim().slice(0, 180),
    notes: String(room.notes || "").trim().slice(0, 220),
  };
}

function normalizeAnalysis(parsed: Record<string, unknown>): FloorPlanAnalysis {
  const roomsRaw = Array.isArray(parsed.rooms) ? parsed.rooms : [];
  const rooms = roomsRaw
    .filter((room): room is Record<string, unknown> => room && typeof room === "object")
    .map(normalizeRoom)
    .filter((room) => room.name);

  const rawDimensionsRaw = Array.isArray(parsed.rawDimensions)
    ? parsed.rawDimensions
    : Array.isArray(parsed.raw_dimensions)
      ? parsed.raw_dimensions
      : [];

  const warningsRaw = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  const overallRaw = (parsed.overallDimensions || parsed.overall_dimensions || {}) as Record<string, unknown>;

  return {
    rooms,
    rawDimensions: rawDimensionsRaw.map((v) => String(v).trim()).filter(Boolean).slice(0, 30),
    scaleText: String(parsed.scaleText || parsed.scale_text || "").trim().slice(0, 180),
    overallDimensions: {
      widthFt: toNumber(overallRaw.widthFt ?? overallRaw.width_ft ?? overallRaw.width),
      depthFt: toNumber(overallRaw.depthFt ?? overallRaw.depth_ft ?? overallRaw.depth),
      evidence: String(overallRaw.evidence || "").trim().slice(0, 180),
    },
    warnings: warningsRaw.map((v) => String(v).trim()).filter(Boolean).slice(0, 12),
    confidence: clampConfidence(parsed.confidence, rooms.length ? 0.45 : 0.2),
  };
}

function extractResponseText(result: Record<string, unknown>) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text;
  }

  const output = Array.isArray(result.output) ? result.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Record<string, unknown>[]
      : [];
    for (const part of content) {
      if (typeof part.text === "string" && part.text.trim()) return part.text;
      if (typeof part.output_text === "string" && part.output_text.trim()) return part.output_text;
    }
  }

  return "{}";
}

async function callOpenAI(openaiKey: string, imageBase64: string, mimeType: string, prompt: string, maxTokens: number) {
  const model = Deno.env.get("FLOOR_PLAN_OPENAI_MODEL") || "gpt-5.5";
  const reasoningEffort = Deno.env.get("FLOOR_PLAN_REASONING_EFFORT") || "medium";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + openaiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxTokens,
      reasoning: { effort: reasoningEffort },
      text: {
        format: { type: "json_object" },
        verbosity: "low",
      },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: "data:" + (mimeType || "image/jpeg") + ";base64," + imageBase64,
              detail: "high",
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
  return extractResponseText(result);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, imageBase64, mimeType, overallWidthFt, overallDepthFt } = body;

    if (!imageBase64) {
      return jsonResponse({ error: "Missing required field: imageBase64" }, 400);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500);
    }

    if (mode === "rooms_only") {
      const prompt = 'List the room names visible on this floor plan. Return JSON only: {"rooms":["Room Name 1"]}. Include hallways, porches, utility rooms, closets. Max 15 rooms. Do not invent names.';
      const content = await callOpenAI(openaiKey, imageBase64, mimeType, prompt, 300);
      const parsed = extractJsonObject(content);
      const rooms = Array.isArray(parsed.rooms) && parsed.rooms.length
        ? parsed.rooms.map((room: unknown) => String(room).trim()).filter(Boolean).slice(0, 15)
        : ["Living Room", "Kitchen", "Dining", "Bathroom", "Bedroom"];
      return jsonResponse({ rooms });
    }

    if (mode !== "full_analysis") {
      return jsonResponse({ error: "Use mode: rooms_only or full_analysis" }, 400);
    }

    const anchorText = [
      overallWidthFt ? `User-entered overall building width: ${overallWidthFt} ft.` : "",
      overallDepthFt ? `User-entered overall building depth: ${overallDepthFt} ft.` : "",
    ].filter(Boolean).join(" ");

    const prompt = `You are reading a renovation floor plan for estimating. Accuracy matters more than completeness.

Return JSON only with this schema:
{
  "rooms": [
    {
      "name": "Kitchen",
      "lengthFt": 12.0,
      "widthFt": 10.0,
      "areaSqft": 120.0,
      "perimeterFt": 44.0,
      "confidence": 0.0,
      "source": "label|dimension|scale|inferred",
      "evidence": "visible text or calculation clue",
      "notes": "short note"
    }
  ],
  "rawDimensions": ["12'-0 x 10'-0", "overall 28' x 40'"],
  "scaleText": "visible scale text or empty string",
  "overallDimensions": { "widthFt": null, "depthFt": null, "evidence": "" },
  "warnings": ["short warning"],
  "confidence": 0.0
}

Rules:
- Do not invent precise measurements. If a room dimension is not visible or cannot be anchored, set lengthFt and widthFt to null.
- Use user-entered overall dimensions only as an anchor, not as permission to guess every room.
- Include a room when its name is visible even if dimensions are unknown.
- If a room dimension is inferred from scale or adjacent dimensions, set confidence below 0.65 and explain in evidence.
- If exact room dimensions are visible, confidence can be 0.75 to 0.95.
- Use feet as decimal numbers. Convert inches to decimals.
- Keep max 18 rooms.
- Add warnings for blurry images, missing scale, exterior-only dimensions, unreadable labels, or low confidence.

${anchorText}`;

    const content = await callOpenAI(openaiKey, imageBase64, mimeType, prompt, 1800);
    const parsed = extractJsonObject(content);
    const analysis = normalizeAnalysis(parsed);

    if (!analysis.rooms.length) {
      analysis.rooms = ["Living Room", "Kitchen", "Dining", "Bathroom", "Bedroom"].map((name) => ({
        name,
        lengthFt: null,
        widthFt: null,
        areaSqft: null,
        perimeterFt: null,
        confidence: 0.15,
        source: "manual",
        evidence: "",
        notes: "AI could not confidently read this room.",
      }));
      analysis.warnings.push("AI could not confidently read room names or dimensions. Use manual entry.");
      analysis.confidence = 0.15;
    }

    const lowConfidenceCount = analysis.rooms.filter((room) => (room.confidence || 0) < 0.65).length;
    if (lowConfidenceCount > 0) {
      analysis.warnings.push(`${lowConfidenceCount} room(s) need manual review before quoting.`);
    }

    return jsonResponse(analysis);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
