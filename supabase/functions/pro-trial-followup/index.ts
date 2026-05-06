import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TrialEntry = {
  feature?: string;
  label?: string;
  used?: boolean;
  used_at?: string;
  followup_due_at?: string;
  followup_sent_at?: string | null;
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePlanName(plan: unknown) {
  const value = String(plan || "basic").toLowerCase();
  if (value === "starter") return "basic";
  return value === "pro" ? "pro" : "basic";
}

function subscriptionAllowsAccess(sub: any) {
  return !!sub && ["active", "trialing"].includes(String(sub.status || "").toLowerCase());
}

function isProSubscription(sub: any) {
  return subscriptionAllowsAccess(sub) && normalizePlanName(sub.plan) === "pro";
}

function upgradeUrl(feature: string) {
  return `https://quotedr.io/pricing.html?plan=pro&feature=${encodeURIComponent(feature || "pro")}`;
}

function feedbackSubject(featureLabel: string) {
  return encodeURIComponent(`Feedback on ${featureLabel}`);
}

function emailHtml(name: string, featureLabel: string, featureKey: string) {
  const firstName = name ? name.split(/\s+/)[0] : "there";
  const feedbackUrl = `mailto:support@quotedr.io?subject=${feedbackSubject(featureLabel)}`;
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
        <tr><td style="background:#0f3460;padding:28px 36px;text-align:center;">
          <div style="color:white;font-size:26px;font-weight:800;">QuoteDr Pro</div>
          <div style="color:rgba(255,255,255,.78);font-size:14px;margin-top:4px;">Unlock the tools that save quoting time</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="font-size:17px;font-weight:700;color:#10233d;margin:0 0 16px;">Hey ${escapeHtml(firstName)},</p>
          <p style="color:#444;line-height:1.6;margin:0 0 16px;">You tried <strong>${escapeHtml(featureLabel)}</strong> in QuoteDr. I wanted you to get one real run with it before asking you to upgrade.</p>
          <p style="color:#444;line-height:1.6;margin:0 0 24px;">If it helped, Pro unlocks it permanently along with IKEA quoting, job tracking, AI tools, QuickBooks sync, and more.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${upgradeUrl(featureKey)}" style="display:inline-block;background:#e87e2a;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:800;">Upgrade to Pro</a>
          </div>
          <div style="background:#f0f7ff;border:1px solid #d7e8fb;border-radius:10px;padding:16px 18px;margin:0 0 20px;">
            <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 10px;"><strong>Help us make QuoteDr better.</strong> We are constantly trying to improve QuoteDr, so if there was something you did not like about ${escapeHtml(featureLabel)}, or something we could improve, please let us know.</p>
            <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 12px;">Good feedback submissions may unlock Pro tools for a set time as a thank you.</p>
            <a href="${feedbackUrl}" style="color:#1a56a0;font-weight:700;text-decoration:none;">Send feedback to support@quotedr.io</a>
          </div>
          <p style="color:#777;font-size:13px;line-height:1.5;margin:0;">Not ready yet? No worries. Your regular QuoteDr tools are still there.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://axmoffknvblluibuitrq.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!serviceKey) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!resendKey) return json({ error: "Missing RESEND_API_KEY" }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date();
    const { data: trialRows, error } = await supabase
      .from("user_data")
      .select("user_id,value")
      .eq("key", "pro_trial_usage");
    if (error) throw error;

    let sent = 0;
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const row of trialRows || []) {
      const usage = row.value || {};
      const dueEntries = Object.entries(usage).filter(([, entry]) => {
        const trial = entry as TrialEntry;
        return trial?.used && trial.followup_due_at && !trial.followup_sent_at && new Date(trial.followup_due_at) <= now;
      });
      if (!dueEntries.length) continue;

      const { data: subRow } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", row.user_id)
        .eq("key", "subscription_status")
        .maybeSingle();
      if (isProSubscription(subRow?.value)) {
        skipped.push(`${row.user_id}: upgraded`);
        continue;
      }

      const { data: profileRow } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", row.user_id)
        .eq("key", "business_profile")
        .maybeSingle();

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(row.user_id);
      if (userError || !userData?.user?.email) {
        errors.push(`${row.user_id}: missing email`);
        continue;
      }

      const [featureKey, entry] = dueEntries[0] as [string, TrialEntry];
      const label = entry.label || entry.feature || featureKey;
      const profile = profileRow?.value || {};
      const name = profile.owner_name || profile.ownerName || profile.business_name || profile.businessName || "";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "QuoteDr <welcome@quotedr.io>",
          to: [userData.user.email],
          subject: `Want to keep using ${label}?`,
          html: emailHtml(name, label, featureKey),
        }),
      });

      if (!response.ok) {
        errors.push(`${row.user_id}: ${await response.text()}`);
        continue;
      }

      const updated = { ...usage };
      updated[featureKey] = { ...updated[featureKey], followup_sent_at: now.toISOString() };
      const { error: updateError } = await supabase
        .from("user_data")
        .upsert({ user_id: row.user_id, key: "pro_trial_usage", value: updated, updated_at: now.toISOString() }, { onConflict: "user_id,key" });
      if (updateError) errors.push(`${row.user_id}: ${updateError.message}`);
      else sent++;
    }

    return json({ sent, skipped, errors });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
