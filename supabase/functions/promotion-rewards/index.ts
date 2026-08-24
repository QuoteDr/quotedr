import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  authenticatedClient,
  requireAccountPermissionWithDefault,
  serviceClient,
} from "../_shared/account-authorization.ts";
import {
  addPromotionDays,
  buildPromotionState,
  validPromotionDuration,
} from "../_shared/promotion-rewards-core.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = new Set([
  "admin@quotedr.io",
  "info@alddirect.ca",
  "ald.direct.contracting@gmail.com",
  ...(Deno.env.get("QUOTEDR_ADMIN_EMAILS") || "").split(","),
].map((value) => value.trim().toLowerCase()).filter(Boolean));

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function promotionIds(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item || "").trim()).filter((item) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)
  )))].slice(0, 20);
}

async function loadSubscription(admin: any, userId: string) {
  const result = await admin
    .from("user_data")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "subscription_status")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.value || null;
}

async function loadActiveEntitlement(admin: any, userId: string, nowIso: string) {
  const result = await admin
    .from("promotion_claims")
    .select("id,promotion_id,benefit_starts_at,benefit_ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("benefit_starts_at", nowIso)
    .gt("benefit_ends_at", nowIso)
    .order("benefit_ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function campaignStates(admin: any, userId: string, ids: string[], now: Date) {
  if (!ids.length) return [];
  const [campaignResult, claimResult, subscription] = await Promise.all([
    admin.from("app_broadcast_messages")
      .select("id,status,starts_at,ends_at,target_audience,promotion_reward_type,promotion_duration_days,promotion_max_claims")
      .in("id", ids),
    admin.from("promotion_claims")
      .select("id,promotion_id,status,benefit_starts_at,benefit_ends_at,claimed_at")
      .eq("user_id", userId)
      .in("promotion_id", ids),
    loadSubscription(admin, userId),
  ]);
  if (campaignResult.error) throw campaignResult.error;
  if (claimResult.error) throw claimResult.error;
  const campaigns = campaignResult.data || [];
  const claims = new Map((claimResult.data || []).map((claim: any) => [claim.promotion_id, claim]));
  const cappedIds = campaigns.filter((row: any) => row.promotion_max_claims != null).map((row: any) => row.id);
  const counts = new Map<string, number>();
  const countResults = await Promise.all(cappedIds.map(async (id: string) => {
    const result = await admin.from("promotion_claims").select("id", { count: "exact", head: true }).eq("promotion_id", id);
    if (result.error) throw result.error;
    return { id, count: Number(result.count || 0) };
  }));
  for (const result of countResults) counts.set(result.id, result.count);
  return campaigns.map((campaign: any) => buildPromotionState(
    campaign,
    claims.get(campaign.id) || null,
    counts.get(campaign.id) || 0,
    subscription,
    now,
  ));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const admin = serviceClient();
    const now = new Date();

    if (action === "admin_stats") {
      const actor = await authenticatedClient(req);
      if (!ADMIN_EMAILS.has(String(actor.user.email || "").trim().toLowerCase())) {
        return json({ error: "Administrator access required", code: "admin_required" }, 403);
      }
      const ids = promotionIds(body.promotionIds);
      if (!ids.length) return json({ data: [] });
      const result = await admin.from("promotion_claims").select("promotion_id,status,benefit_ends_at").in("promotion_id", ids);
      if (result.error) throw result.error;
      const stats = new Map<string, { promotionId: string; claimed: number; active: number }>();
      for (const id of ids) stats.set(id, { promotionId: id, claimed: 0, active: 0 });
      for (const claim of result.data || []) {
        const state = stats.get(claim.promotion_id);
        if (!state) continue;
        state.claimed += 1;
        if (claim.status === "active" && new Date(claim.benefit_ends_at) > now) state.active += 1;
      }
      return json({ data: [...stats.values()] });
    }

    const permission = action === "claim" ? ACCOUNT_PERMISSION.BILLING_MANAGE : ACCOUNT_PERMISSION.BILLING_READ;
    const auth = await requireAccountPermissionWithDefault(req, body.accountId, permission);
    if (auth.user.id !== auth.ownerUserId) {
      return json({ error: "Only the account owner can activate promotions", code: "owner_required" }, 403);
    }

    if (action === "active_entitlement") {
      const claim = await loadActiveEntitlement(admin, auth.ownerUserId, now.toISOString());
      return json({ data: { active: !!claim, benefitEndsAt: claim?.benefit_ends_at || null } });
    }

    if (action === "status") {
      const states = await campaignStates(admin, auth.ownerUserId, promotionIds(body.promotionIds), now);
      return json({ data: states });
    }

    if (action === "claim") {
      const ids = promotionIds(body.promotionId);
      if (ids.length !== 1) return json({ error: "Choose a promotion", code: "promotion_required" }, 400);
      const states = await campaignStates(admin, auth.ownerUserId, ids, now);
      const state: any = states[0];
      if (!state || !state.visible) return json({ error: "This promotion is not available for this account", code: "promotion_unavailable" }, 409);
      if (state.claimed) return json({ data: state });
      if (!state.claimable || !validPromotionDuration(state.durationDays)) {
        return json({ error: "This promotion cannot be activated", code: "promotion_not_claimable" }, 409);
      }
      const benefitEndsAt = addPromotionDays(now, state.durationDays);
      const inserted = await admin.rpc("quotedr_claim_promotion", {
        p_user_id: auth.ownerUserId,
        p_promotion_id: ids[0],
        p_benefit_starts_at: now.toISOString(),
        p_benefit_ends_at: benefitEndsAt.toISOString(),
      });
      if (inserted.error) {
        const code = String(inserted.error.message || "");
        if (code.includes("promotion_claim_limit_reached")) {
          return json({ error: "This promotion has reached its activation limit", code: "promotion_claim_limit_reached" }, 409);
        }
        throw inserted.error;
      }
      const claim = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
      return json({
        data: {
          promotionId: ids[0],
          claimed: true,
          claimable: false,
          rewardType: "pro_access_days",
          benefitStartsAt: claim?.benefit_starts_at || now.toISOString(),
          benefitEndsAt: claim?.benefit_ends_at || benefitEndsAt.toISOString(),
        },
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
    console.error("promotion-rewards failed", error);
    return json({ error: "Promotions are temporarily unavailable", code: "promotions_unavailable" }, 500);
  }
});
