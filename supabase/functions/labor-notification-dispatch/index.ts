import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType = "morning" | "evening";

type LaborNotificationSetting = {
  user_id: string;
  enabled: boolean;
  morning_enabled: boolean;
  evening_enabled: boolean;
  timezone: string;
  morning_time: string;
  evening_time: string;
};

type LaborDevice = {
  id: string;
  user_id: string;
  push_token: string | null;
  platform: string;
  tracking_enabled: boolean;
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(serviceAccount: any) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function getFcmAccessToken(serviceAccount: any) {
  const assertion = await signJwt(serviceAccount);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Could not get FCM access token");
  }
  return data.access_token as string;
}

function parseLocalParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: (parseInt(parts.hour || "0", 10) * 60) + parseInt(parts.minute || "0", 10),
  };
}

function timeToMinute(value: string) {
  const match = String(value || "00:00").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.max(0, Math.min(1439, parseInt(match[1], 10) * 60 + parseInt(match[2], 10)));
}

function dueTypes(setting: LaborNotificationSetting, now: Date, windowMinutes: number) {
  const local = parseLocalParts(now, setting.timezone);
  const due: Array<{ type: NotificationType; localDate: string }> = [];
  const checks: Array<{ type: NotificationType; enabled: boolean; minute: number }> = [
    { type: "morning", enabled: setting.morning_enabled, minute: timeToMinute(setting.morning_time) },
    { type: "evening", enabled: setting.evening_enabled, minute: timeToMinute(setting.evening_time) },
  ];
  checks.forEach((check) => {
    if (!check.enabled) return;
    const delta = local.minuteOfDay - check.minute;
    if (delta >= 0 && delta < windowMinutes) due.push({ type: check.type, localDate: local.localDate });
  });
  return due;
}

function notificationCopy(type: NotificationType) {
  if (type === "morning") {
    return {
      title: "Build your labour hours tracking",
      body: "Keep note of what you do today and how long it took. I will ask later for you to fill me in.",
      dataType: "labor_morning_reminder",
    };
  }
  return {
    title: "What did you work on today?",
    body: "Add the item, how much you did, and how long it took. QuoteDr will learn your real production rate.",
    dataType: "labor_evening_checkin",
  };
}

async function sendFcm(serviceAccount: any, accessToken: string, device: LaborDevice, type: NotificationType, localDate: string) {
  const copy = notificationCopy(type);
  const projectId = serviceAccount.project_id;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: device.push_token,
        notification: {
          title: copy.title,
          body: copy.body,
        },
        data: {
          type: copy.dataType,
          notificationType: type,
          localDate,
          action: "open_labor_checkin",
        },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "labor_tracking",
            click_action: "OPEN_LABOR_CHECKIN",
          },
        },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "FCM send failed");
  return data.name || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const now = body.now ? new Date(body.now) : new Date();
    const dryRun = body.dryRun === true;
    const windowMinutes = Math.max(1, Math.min(60, parseInt(body.windowMinutes || "15", 10) || 15));
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountRaw && !dryRun) return json({ error: "Missing FCM_SERVICE_ACCOUNT_JSON" }, 500);
    const serviceAccount = serviceAccountRaw ? JSON.parse(serviceAccountRaw) : null;
    const accessToken = serviceAccount && !dryRun ? await getFcmAccessToken(serviceAccount) : "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings, error: settingsError } = await supabase
      .from("labor_notification_settings")
      .select("*")
      .eq("enabled", true);
    if (settingsError) throw settingsError;

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const considered: object[] = [];

    for (const setting of (settings || []) as LaborNotificationSetting[]) {
      const due = dueTypes(setting, now, windowMinutes);
      if (!due.length) continue;

      const { data: devices, error: deviceError } = await supabase
        .from("labor_devices")
        .select("id,user_id,push_token,platform,tracking_enabled")
        .eq("user_id", setting.user_id)
        .not("push_token", "is", null);
      if (deviceError) {
        errors.push(`${setting.user_id}: ${deviceError.message}`);
        continue;
      }
      const targetDevices = ((devices || []) as LaborDevice[]).filter((device) => !!device.push_token);
      if (!targetDevices.length) {
        skipped++;
        continue;
      }

      for (const item of due) {
        const { data: existingLog } = await supabase
          .from("labor_notification_logs")
          .select("id,status")
          .eq("user_id", setting.user_id)
          .eq("notification_type", item.type)
          .eq("local_date", item.localDate)
          .maybeSingle();
        if (existingLog) {
          skipped++;
          continue;
        }

        const device = targetDevices[0];
        considered.push({ user_id: setting.user_id, type: item.type, localDate: item.localDate, dryRun });
        if (dryRun) continue;

        try {
          const providerMessageId = await sendFcm(serviceAccount, accessToken, device, item.type, item.localDate);
          const { error: logError } = await supabase.from("labor_notification_logs").insert({
            user_id: setting.user_id,
            device_id: device.id,
            notification_type: item.type,
            local_date: item.localDate,
            scheduled_for: now.toISOString(),
            sent_at: new Date().toISOString(),
            status: "sent",
            provider_message_id: providerMessageId,
          });
          if (logError) throw logError;
          sent++;
        } catch (error) {
          errors.push(`${setting.user_id}: ${(error as Error).message}`);
          await supabase.from("labor_notification_logs").insert({
            user_id: setting.user_id,
            device_id: device.id,
            notification_type: item.type,
            local_date: item.localDate,
            scheduled_for: now.toISOString(),
            status: "failed",
            error: (error as Error).message,
          });
        }
      }
    }

    return json({ sent, skipped, errors, considered });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
