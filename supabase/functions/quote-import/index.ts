import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPPORTED_TYPES = new Set(['pdf', 'xlsx', 'csv', 'txt', 'paste']);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type JsonMap = Record<string, unknown>;

const QUOTE_IMPORT_POLICY = Object.freeze({
  feature: 'quote_import',
  label: 'Legacy quote import',
  hourlyLimit: 80,
  dailyLimit: 150,
  maxInputChars: 250000,
  maxOutputTokens: 16000,
});

const MODEL_PRICES_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 5.00, output: 15.00 },
  default: { input: 1.00, output: 3.00 },
};

class AiGuardError extends Error {
  status: number;
  body: JsonMap;

  constructor(message: string, status = 500, body: JsonMap = {}) {
    super(message);
    this.name = "AiGuardError";
    this.status = status;
    this.body = body;
  }
}

function jsonResponse(body: JsonMap, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function aiGuardErrorResponse(error: unknown, headers: HeadersInit) {
  if (error instanceof AiGuardError) {
    return jsonResponse(error.body || { error: error.message }, error.status, headers);
  }
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, 500, headers);
}

function secondsUntilWindowReset(now = new Date(), windowName = 'hour') {
  const reset = new Date(now);
  if (windowName === 'day') {
    reset.setUTCHours(24, 0, 0, 0);
  } else {
    reset.setUTCMinutes(60, 0, 0);
  }
  return Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 1000));
}

function estimateOpenAiCostUsd(model: string, usage: Record<string, number> = {}) {
  const prices = MODEL_PRICES_PER_MILLION_TOKENS[model] || MODEL_PRICES_PER_MILLION_TOKENS.default;
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const cost = ((promptTokens * prices.input) + (completionTokens * prices.output)) / 1000000;
  return Math.round(cost * 1000000) / 1000000;
}

function assertWithinAiInputLimit(policy: typeof QUOTE_IMPORT_POLICY, value: unknown, label = "AI input") {
  const length = typeof value === "string" ? value.length : JSON.stringify(value || "").length;
  if (length > policy.maxInputChars) {
    throw new AiGuardError(`${label} is too large for ${policy.label}.`, 413, {
      error: `${label} is too large for ${policy.label}.`,
      code: "ai_input_too_large",
      feature: policy.feature,
      maxInputChars: policy.maxInputChars,
    });
  }
  return length;
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AiGuardError("Please sign in before using AI tools.", 401, {
      error: "Please sign in before using AI tools.",
      code: "ai_auth_required",
    });
  }

  const token = authHeader.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new AiGuardError("Please sign in again before using AI tools.", 401, {
      error: "Please sign in again before using AI tools.",
      code: "ai_auth_invalid",
    });
  }
  return { user: data.user };
}

function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new AiGuardError("AI usage guard is missing SUPABASE_SERVICE_ROLE_KEY.", 500, {
      error: "AI usage guard is missing SUPABASE_SERVICE_ROLE_KEY.",
      code: "ai_guard_not_configured",
    });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function countUsage(supabaseAdmin: any, userId: string, sinceIso: string) {
  const { count, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", QUOTE_IMPORT_POLICY.feature)
    .gte("created_at", sinceIso);
  if (error) throw new AiGuardError(`AI usage check failed: ${error.message}`, 500, { error: "AI usage check failed" });
  return Number(count || 0);
}

function limitReached(windowName: "hour" | "day", used: number) {
  const limit = windowName === "hour" ? QUOTE_IMPORT_POLICY.hourlyLimit : QUOTE_IMPORT_POLICY.dailyLimit;
  if (used < limit) return null;
  const retryAfterSeconds = secondsUntilWindowReset(new Date(), windowName);
  return new AiGuardError(`${QUOTE_IMPORT_POLICY.label} limit reached. Try again later.`, 429, {
    error: `${QUOTE_IMPORT_POLICY.label} limit reached. Try again later.`,
    code: "ai_limit_reached",
    feature: QUOTE_IMPORT_POLICY.feature,
    window: windowName,
    limit,
    used,
    retryAfterSeconds,
  });
}

async function startAiUsage(req: Request, options: { feature: string; endpoint: string; inputChars?: number }) {
  const { user } = await getAuthenticatedUser(req);
  const supabaseAdmin = adminClient();
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [hourUsed, dayUsed] = await Promise.all([
    countUsage(supabaseAdmin, user.id, hourAgo),
    countUsage(supabaseAdmin, user.id, dayAgo),
  ]);

  const hourError = limitReached("hour", hourUsed);
  if (hourError) throw hourError;
  const dayError = limitReached("day", dayUsed);
  if (dayError) throw dayError;

  const requestId = crypto.randomUUID();
  const { data, error } = await supabaseAdmin
    .from("ai_usage_events")
    .insert({
      user_id: user.id,
      feature: options.feature,
      endpoint: options.endpoint,
      status: "started",
      max_output_tokens: QUOTE_IMPORT_POLICY.maxOutputTokens,
      input_chars: options.inputChars || 0,
      request_id: requestId,
      metadata: { label: QUOTE_IMPORT_POLICY.label },
    })
    .select("id")
    .single();

  if (error) throw new AiGuardError(`AI usage logging failed: ${error.message}`, 500, { error: "AI usage logging failed" });

  async function finish(status: "succeeded" | "failed", update: JsonMap = {}) {
    const usage = (update.usage || {}) as Record<string, number>;
    const model = String(update.model || "");
    const estimatedCostUsd = status === "succeeded" ? estimateOpenAiCostUsd(model, usage) : 0;
    await supabaseAdmin
      .from("ai_usage_events")
      .update({
        status,
        model: model || null,
        prompt_tokens: Number(usage.prompt_tokens || usage.input_tokens || 0),
        completion_tokens: Number(usage.completion_tokens || usage.output_tokens || 0),
        total_tokens: Number(usage.total_tokens || 0),
        estimated_cost_usd: estimatedCostUsd,
        error_message: update.errorMessage ? String(update.errorMessage).slice(0, 1000) : null,
        metadata: update.metadata || { label: QUOTE_IMPORT_POLICY.label },
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }

  return {
    policy: QUOTE_IMPORT_POLICY,
    recordSuccess: (update: JsonMap = {}) => finish("succeeded", update),
    recordFailure: (error: unknown, update: JsonMap = {}) => finish("failed", {
      ...update,
      errorMessage: error instanceof Error ? error.message : String(error),
    }),
  };
}

function cleanText(value: unknown) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

function lineLooksLikeRoomHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 70 || trimmed.length < 3) return false;
  if (/[0-9]+\s+\$/.test(trimmed)) return false;
  if (/^(subtotal|total|hst|gst|tax|description|qty|quantity|unit|rate|amount|page)\b/i.test(trimmed)) return false;
  const hasRoomWord = /\b(floor|basement|bath|bathroom|kitchen|laundry|bedroom|living|dining|utility|workshop|exterior|interior|garage|main|second|2nd|third|3rd|room)\b/i.test(trimmed);
  const mostlyCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  return hasRoomWord && mostlyCaps;
}

function splitOversizedText(text: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.6) cut = remaining.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.6) cut = maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitLegacyQuoteText(sourceText: string) {
  const text = cleanText(sourceText);
  if (text.length <= 9000) return [{ label: 'Full quote', text }];

  const rawPages = text.includes('--- PAGE BREAK ---')
    ? text.split(/--- PAGE BREAK ---/g).map((part) => part.trim()).filter(Boolean)
    : [];

  let baseParts = rawPages.length > 1 ? rawPages : [];
  if (!baseParts.length) {
    const lines = text.split(/\r?\n/);
    let current: string[] = [];
    for (const line of lines) {
      if (lineLooksLikeRoomHeading(line) && current.join('\n').length > 1200) {
        baseParts.push(current.join('\n').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.join('\n').trim()) baseParts.push(current.join('\n').trim());
  }
  if (baseParts.length <= 1) baseParts = splitOversizedText(text, 7000);

  const grouped: string[] = [];
  let current = '';
  for (const part of baseParts) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    if ((current + '\n\n' + cleaned).length > 7000 && current) {
      grouped.push(current.trim());
      current = cleaned;
    } else {
      current = current ? current + '\n\n' + cleaned : cleaned;
    }
  }
  if (current.trim()) grouped.push(current.trim());

  return grouped.flatMap((part) => splitOversizedText(part, 7000))
    .slice(0, 14)
    .map((part, index) => ({ label: `Part ${index + 1}`, text: part }));
}

function mergeImportedQuotePayloads(payloads: any[]) {
  const merged: any = {
    quote: {
      quoteTitle: '',
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      projectAddress: '',
      quoteNumber: '',
      rooms: [],
    },
    sourceTotals: { subtotal: 0, tax: 0, total: 0 },
    savedItemCandidates: [],
    warnings: [],
  };
  const roomMap = new Map<string, any>();
  const candidateKeys = new Set<string>();

  for (const payload of payloads) {
    const quote = payload?.quote || {};
    for (const key of ['quoteTitle', 'clientName', 'clientPhone', 'clientEmail', 'projectAddress', 'quoteNumber']) {
      if (!merged.quote[key] && quote[key]) merged.quote[key] = String(quote[key]);
    }
    for (const room of Array.isArray(quote.rooms) ? quote.rooms : []) {
      const name = String(room?.name || 'Imported Quote').trim() || 'Imported Quote';
      const key = name.toLowerCase();
      if (!roomMap.has(key)) {
        const created = { name, items: [] };
        roomMap.set(key, created);
        merged.quote.rooms.push(created);
      }
      const target = roomMap.get(key);
      for (const item of Array.isArray(room?.items) ? room.items : []) {
        target.items.push(item);
      }
    }
    const totals = payload?.sourceTotals || {};
    merged.sourceTotals.subtotal = Math.max(Number(merged.sourceTotals.subtotal || 0), Number(totals.subtotal || 0));
    merged.sourceTotals.tax = Math.max(Number(merged.sourceTotals.tax || 0), Number(totals.tax || 0));
    merged.sourceTotals.total = Math.max(Number(merged.sourceTotals.total || 0), Number(totals.total || 0));
    for (const candidate of Array.isArray(payload?.savedItemCandidates) ? payload.savedItemCandidates : []) {
      const name = String(candidate?.name || '').trim();
      if (!name) continue;
      const key = `${candidate?.category || ''}::${name}::${candidate?.unitType || candidate?.unit || ''}`.toLowerCase();
      if (candidateKeys.has(key)) continue;
      candidateKeys.add(key);
      merged.savedItemCandidates.push({ ...candidate, defaultSelected: false });
    }
    for (const warning of Array.isArray(payload?.warnings) ? payload.warnings : []) {
      if (warning) merged.warnings.push(String(warning));
    }
  }

  merged.warnings.unshift(`Large quote imported in ${payloads.length} passes so QuoteDr could capture more of the source document.`);
  return merged;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let usageGuard: any = null;
  try {
    const body = await req.json();
    const sourceText = cleanText(body.sourceText);
    const fileName = cleanText(body.fileName).slice(0, 180) || 'Pasted quote';
    const fileType = cleanText(body.fileType || 'paste').toLowerCase();
    const clientChunkIndex = Number(body.clientChunkIndex || 0);
    const clientChunkTotal = Number(body.clientChunkTotal || 0);
    const clientChunkLabel = cleanText(body.clientChunkLabel || '');

    if (!sourceText) {
      return jsonResponse({ error: 'Missing quote text to import.' }, 400, corsHeaders);
    }
    if (!SUPPORTED_TYPES.has(fileType)) {
      return jsonResponse({ error: 'Unsupported quote import file type.' }, 400, corsHeaders);
    }

    usageGuard = await startAiUsage(req, {
      feature: 'quote_import',
      endpoint: 'quote-import',
      inputChars: sourceText.length,
    });
    assertWithinAiInputLimit(usageGuard.policy, sourceText, 'Legacy quote text');

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return jsonResponse({ error: 'OpenAI key not configured' }, 500, corsHeaders);
    }

    const systemPrompt = `You are QuoteDr's legacy quote conversion engine for renovation and service contractors.

Convert old quote text into QuoteDr JSON. You may receive one chunk/page/section from a larger source document. Parse every billable line item visible in the supplied chunk. Return ONLY valid JSON in this exact shape:
{
  "quote": {
    "quoteTitle": "",
    "clientName": "",
    "clientPhone": "",
    "clientEmail": "",
    "projectAddress": "",
    "quoteNumber": "",
    "rooms": [
      {
        "name": "Room or section",
        "items": [
          {
            "category": "Category",
            "description": "Line item name",
            "quantity": 1,
            "unit": "ls",
            "unitType": "ls",
            "rate": 0,
            "total": 0,
            "notes": ""
          }
        ]
      }
    ]
  },
  "sourceTotals": {
    "subtotal": 0,
    "tax": 0,
    "total": 0
  },
  "savedItemCandidates": [
    {
      "category": "Category",
      "name": "Reusable item name",
      "unitType": "sq ft",
      "rate": 0,
      "materialCost": 0,
      "description": "",
      "defaultSelected": false
    }
  ],
  "warnings": []
}

Rules:
- Preserve source pricing. Do not match against saved items, price books, or industry defaults.
- Extract every valid billable item. Do not summarize and do not return only a sample.
- Preserve room or section headings such as 2ND FLOOR, MAIN FLOOR, KITCHEN, BASEMENT BATHROOM, EXTERIOR, etc.
- If an item has quantity, unit, rate, and total, preserve them as numbers.
- If an item only has a total, set quantity to 1, unit and unitType to "ls", rate to that total, and total to that total.
- Preserve long item descriptions in notes. Keep description as the short item/service name.
- Ignore document headers, footers, dates, page numbers, bill-to labels, terms, disclaimers, subtotals, taxes, total rows, balance due rows, payment rows, and repeated table headers as billable items.
- Ignore TBD, to-be-determined, included-only, blank, or zero-price rows as billable line items unless they are clearly a priced line item.
- Detect sourceTotals from subtotal, tax/HST/GST, and final total rows, but do not include those as room items.
- Use unitType values like "sq ft", "lf", "ea", "hr", "ls", "sheet", "box", or "bag".
- Build savedItemCandidates only from clean reusable service items. No totals, taxes, headers, room labels, vague one-off notes, or TBD items. defaultSelected must always be false because the user must opt in manually.
- If the source text order is messy, use room headings and nearby context to group items sensibly.
- If you are unsure about a row, include a warning instead of inventing data.
- Return JSON only.`;

    const model = Deno.env.get('OPENAI_QUOTE_IMPORT_MODEL') || 'gpt-4o-mini';
    const chunks = splitLegacyQuoteText(sourceText);
    const parsedPayloads: any[] = [];
    let combinedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const displayedChunkIndex = clientChunkTotal > 1 ? clientChunkIndex || index + 1 : index + 1;
      const displayedChunkTotal = clientChunkTotal > 1 ? clientChunkTotal : chunks.length;
      const displayedChunkLabel = clientChunkLabel || chunk.label;
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
            {
              role: 'user',
              content: `File name: ${fileName}\nFile type: ${fileType}\nChunk: ${displayedChunkIndex} of ${displayedChunkTotal} (${displayedChunkLabel})\n\nLEGACY QUOTE TEXT CHUNK:\n${chunk.text}`,
            },
          ],
          temperature: 0.1,
          max_tokens: chunks.length > 1 ? 7000 : usageGuard.policy.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI error: ${err}`);
      }

      const data = await response.json();
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        throw new AiGuardError('Legacy quote import was cut off while parsing. Try exporting or pasting fewer pages at a time.', 413, {
          error: 'Legacy quote import was cut off while parsing. Try exporting or pasting fewer pages at a time.',
          code: 'quote_import_truncated',
          feature: QUOTE_IMPORT_POLICY.feature,
        });
      }
      const usage = data.usage || {};
      combinedUsage.prompt_tokens += Number(usage.prompt_tokens || usage.input_tokens || 0);
      combinedUsage.completion_tokens += Number(usage.completion_tokens || usage.output_tokens || 0);
      combinedUsage.total_tokens += Number(usage.total_tokens || 0);
      const content = data.choices?.[0]?.message?.content?.trim() || '{}';
      const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      parsedPayloads.push(JSON.parse(jsonStr));
    }

    const parsed = chunks.length > 1 ? mergeImportedQuotePayloads(parsedPayloads) : parsedPayloads[0];
    parsed.savedItemCandidates = Array.isArray(parsed.savedItemCandidates)
      ? parsed.savedItemCandidates.map((candidate: any) => ({ ...candidate, defaultSelected: false }))
      : [];

    const importedSubtotal = (Array.isArray(parsed?.quote?.rooms) ? parsed.quote.rooms : []).reduce((roomSum: number, room: any) => {
      return roomSum + (Array.isArray(room?.items) ? room.items : []).reduce((itemSum: number, item: any) => itemSum + (Number(item?.total || 0) || 0), 0);
    }, 0);
    const sourceTotal = Number(parsed?.sourceTotals?.total || 0);
    if (sourceTotal > 0 && importedSubtotal > 0 && importedSubtotal < sourceTotal * 0.75) {
      parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
      parsed.warnings.push(`Imported line items total $${importedSubtotal.toFixed(2)}, which is much lower than the detected source total $${sourceTotal.toFixed(2)}. Review the source text and imported rooms before applying.`);
    }

    await usageGuard.recordSuccess({
      model,
      usage: combinedUsage,
      metadata: {
        label: usageGuard.policy.label,
        fileName,
        fileType,
        chunks: chunks.length,
        clientChunkIndex: clientChunkIndex || null,
        clientChunkTotal: clientChunkTotal || null,
        roomCount: Array.isArray(parsed?.quote?.rooms) ? parsed.quote.rooms.length : 0,
        candidateCount: Array.isArray(parsed?.savedItemCandidates) ? parsed.savedItemCandidates.length : 0,
      },
    });

    return jsonResponse(parsed, 200, corsHeaders);
  } catch (err) {
    if (usageGuard) await usageGuard.recordFailure(err);
    return aiGuardErrorResponse(err, corsHeaders);
  }
});
