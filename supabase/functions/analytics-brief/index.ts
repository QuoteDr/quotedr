import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const POSTHOG_PERSONAL_API_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "";
const POSTHOG_PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID") ?? "411455";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://us.posthog.com";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trackedEvents = [
  "quote_started",
  "quote_completed",
  "quote_sent",
  "quote_signed",
  "quick_add_room_opened",
  "quick_add_room_calculated",
  "quick_add_room_added",
  "manage_items_opened",
  "ikea_quoter_opened",
  "ikea_quoter_added_to_quote",
  "job_tracker_opened",
  "hd_import_completed",
  "quickbooks_connected",
  "pro_upgrade_clicked",
  "pro_trial_used",
  "settings_opened",
  "invoice_created",
  "invoice_sent",
  "$rageclick",
  "$exception",
];

type JsonMap = Record<string, unknown>;

function jsonResponse(body: JsonMap, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampDays(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, Math.round(n)));
}

function hogqlString(value: string) {
  return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

async function verifyUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authorization");
  }

  const token = authHeader.substring(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid authorization");
  return data.user;
}

async function posthogQuery(query: string, name: string) {
  if (!POSTHOG_PERSONAL_API_KEY) {
    throw new Error("PostHog API key is not configured");
  }

  const response = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
      name,
    }),
  });

  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `PostHog query failed (${response.status})`);
  }
  return data;
}

function rowsFrom(result: any) {
  return Array.isArray(result?.results) ? result.results : [];
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function eventCount(eventCounts: Record<string, number>, event: string) {
  return Number(eventCounts[event] || 0);
}

function buildBrief(metrics: any) {
  const counts = metrics.eventCounts || {};
  const started = eventCount(counts, "quote_started");
  const completed = eventCount(counts, "quote_completed");
  const sent = eventCount(counts, "quote_sent");
  const signed = eventCount(counts, "quote_signed");
  const quickAddOpened = eventCount(counts, "quick_add_room_opened");
  const quickAddAdded = eventCount(counts, "quick_add_room_added");
  const invoiceCreated = eventCount(counts, "invoice_created");
  const invoiceSent = eventCount(counts, "invoice_sent");
  const proClicks = eventCount(counts, "pro_upgrade_clicked");
  const rageClicks = eventCount(counts, "$rageclick");
  const exceptions = eventCount(counts, "$exception");

  const highlights: string[] = [];
  const risks: string[] = [];
  const recommendations: string[] = [];

  highlights.push(`${started} quotes started, ${completed} completed, ${sent} sent, ${signed} signed.`);
  highlights.push(`Quick Add Room opened ${quickAddOpened} times and added items ${quickAddAdded} times.`);
  highlights.push(`${invoiceCreated} invoices created and ${invoiceSent} invoice-send actions recorded.`);

  if (started > 0 && sent === 0) {
    risks.push("Quotes are being started but not sent yet. Watch the quote builder and send-link flow.");
  } else if (started > 0 && percent(sent, started) < 35) {
    risks.push(`Quote send-through is ${percent(sent, started)}%, which is the biggest funnel checkpoint to inspect.`);
  }
  if (quickAddOpened > 0 && percent(quickAddAdded, quickAddOpened) < 40) {
    risks.push(`Quick Add Room add-through is ${percent(quickAddAdded, quickAddOpened)}%; users may need clearer pricing setup or result confirmation.`);
  }
  if (rageClicks > 0) risks.push(`${rageClicks} rage clicks were recorded. Filter session replays by rage clicks first.`);
  if (exceptions > 0) risks.push(`${exceptions} frontend exceptions were recorded. Check PostHog error/session context.`);
  if (proClicks > 0) highlights.push(`${proClicks} Pro upgrade clicks recorded. Good early monetization signal.`);

  recommendations.push("Review sessions where `quote_started` happened without `quote_sent`.");
  recommendations.push("Review sessions where `quick_add_room_opened` happened without `quick_add_room_added`.");
  if (rageClicks > 0 || exceptions > 0) recommendations.push("Prioritize rage-click and exception sessions before cosmetic changes.");
  if (signed === 0 && sent > 0) recommendations.push("Inspect client-view sessions after `quote_sent`; the signing step may need stronger guidance.");

  return {
    highlights,
    risks,
    recommendations,
    funnel: {
      started,
      completed,
      sent,
      signed,
      completed_from_started: percent(completed, started),
      sent_from_started: percent(sent, started),
      signed_from_sent: percent(signed, sent),
    },
  };
}

async function generateAiNarrative(metrics: any, deterministicBrief: any) {
  if (!OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: "You are QuoteDr's product analytics analyst. Write concise, practical summaries for a founder/contractor. Focus on what changed, where users drop off, and what to improve next. Do not mention private API details.",
        },
        {
          role: "user",
          content: JSON.stringify({ metrics, deterministicBrief }),
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    await verifyUser(req);
    const body = await req.json().catch(() => ({}));
    const days = clampDays(body.days);
    const eventList = trackedEvents.map(hogqlString).join(", ");

    const countsQuery = `
      select event, count() as count, count(distinct distinct_id) as users
      from events
      where timestamp >= now() - interval ${days} day
        and event in (${eventList})
      group by event
      order by count desc
    `;

    const dailyQuery = `
      select toDate(timestamp) as day, event, count() as count
      from events
      where timestamp >= now() - interval ${days} day
        and event in (${eventList})
      group by day, event
      order by day asc, event asc
    `;

    const pageQuery = `
      select properties.page as page, count() as count
      from events
      where timestamp >= now() - interval ${days} day
        and event = 'page_viewed'
      group by page
      order by count desc
      limit 10
    `;

    const [countsResult, dailyResult, pageResult] = await Promise.all([
      posthogQuery(countsQuery, `QuoteDr analytics event counts ${days}d`),
      posthogQuery(dailyQuery, `QuoteDr analytics daily counts ${days}d`),
      posthogQuery(pageQuery, `QuoteDr analytics top pages ${days}d`),
    ]);

    const eventCounts: Record<string, number> = {};
    const eventUsers: Record<string, number> = {};
    rowsFrom(countsResult).forEach((row: any[]) => {
      eventCounts[String(row[0])] = Number(row[1] || 0);
      eventUsers[String(row[0])] = Number(row[2] || 0);
    });

    const metrics = {
      days,
      generated_at: new Date().toISOString(),
      eventCounts,
      eventUsers,
      dailyCounts: rowsFrom(dailyResult).map((row: any[]) => ({ day: row[0], event: row[1], count: Number(row[2] || 0) })),
      topPages: rowsFrom(pageResult).map((row: any[]) => ({ page: row[0] || "unknown", count: Number(row[1] || 0) })),
    };

    const deterministicBrief = buildBrief(metrics);
    const aiSummary = body.ai === false ? null : await generateAiNarrative(metrics, deterministicBrief);

    return jsonResponse({
      success: true,
      summary: aiSummary || null,
      brief: deterministicBrief,
      metrics,
      source: aiSummary ? "openai_and_posthog" : "posthog",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /authorization/i.test(message) ? 401 : /configured/i.test(message) ? 500 : 500;
    return jsonResponse({ error: message }, status);
  }
});
