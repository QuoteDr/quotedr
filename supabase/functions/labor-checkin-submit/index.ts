import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function positiveNumber(value: unknown) {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function itemKey(category: string, name: string, unit: string) {
  return [category, name, unit].map((part) => part.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
}

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!anonKey) return json({ error: "Missing SUPABASE_ANON_KEY" }, 500);
    if (!serviceKey) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authedClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const category = cleanText(body.item_category || body.itemCategory);
    const name = cleanText(body.item_name || body.itemName);
    const unit = cleanText(body.item_unit || body.itemUnit || body.unit);
    const quantity = positiveNumber(body.quantity);
    const hours = positiveNumber(body.hours);
    const timezone = cleanText(body.timezone, "America/Toronto");
    const checkinDate = cleanText(body.checkin_date || body.checkinDate, todayInTimezone(timezone));

    if (!name) return json({ error: "Item name is required" }, 400);
    if (!quantity) return json({ error: "Quantity must be greater than 0" }, 400);
    if (!hours) return json({ error: "Hours must be greater than 0" }, 400);

    const unitsPerHour = parseFloat((quantity / hours).toFixed(4));
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const payload = {
      user_id: userData.user.id,
      device_id: body.device_id || body.deviceId || null,
      checkin_date: checkinDate,
      job_site_id: body.job_site_id || body.jobSiteId || null,
      quote_id: body.quote_id || body.quoteId || null,
      item_category: category,
      item_name: name,
      item_unit: unit,
      quantity,
      hours,
      units_per_hour: unitsPerHour,
      notes: cleanText(body.notes),
      source: cleanText(body.source, "mobile_daily_prompt"),
      raw_payload: body.raw_payload || body.rawPayload || body,
      updated_at: new Date().toISOString(),
    };

    const { data: checkin, error: checkinError } = await serviceClient
      .from("labor_daily_checkins")
      .insert(payload)
      .select()
      .single();
    if (checkinError) throw checkinError;

    const key = itemKey(category, name, unit);
    const { data: existingRate, error: rateReadError } = await serviceClient
      .from("labor_item_production_rates")
      .select("*")
      .eq("user_id", userData.user.id)
      .eq("item_key", key)
      .maybeSingle();
    if (rateReadError) throw rateReadError;

    const nextTotalQuantity = (parseFloat(existingRate?.total_quantity || "0") || 0) + quantity;
    const nextTotalHours = (parseFloat(existingRate?.total_hours || "0") || 0) + hours;
    const nextSampleCount = (parseInt(existingRate?.sample_count || "0", 10) || 0) + 1;
    const ratePayload = {
      user_id: userData.user.id,
      item_key: key,
      item_category: category,
      item_name: name,
      item_unit: unit,
      units_per_hour: parseFloat((nextTotalQuantity / nextTotalHours).toFixed(4)),
      sample_count: nextSampleCount,
      total_quantity: parseFloat(nextTotalQuantity.toFixed(2)),
      total_hours: parseFloat(nextTotalHours.toFixed(2)),
      last_checkin_id: checkin.id,
      last_checkin_at: checkin.created_at,
      updated_at: new Date().toISOString(),
    };

    const { data: rate, error: rateError } = await serviceClient
      .from("labor_item_production_rates")
      .upsert(ratePayload, { onConflict: "user_id,item_key" })
      .select()
      .single();
    if (rateError) throw rateError;

    return json({
      checkin,
      productionRate: rate,
      summary: `${quantity} ${unit || "units"} in ${hours} hours = ${unitsPerHour} ${unit || "units"}/hour`,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
