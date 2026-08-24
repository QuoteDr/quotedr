import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  requireAccountPermissionWithDefault,
  serviceClient,
} from "../_shared/account-authorization.ts";
import {
  BIRTHDAY_CHANGE_COOLDOWN_DAYS,
  PRO_RENEWAL_CREDIT_CENTS,
  PRO_RENEWAL_CREDIT_CURRENCY,
  STANDARD_PRO_PASS_DAYS,
  addDays,
  birthdayWindowState,
  normalizeBirthdayPlan,
  paidSubscriptionIsEligible,
  rewardForPlan,
  rollingCooldownState,
  validBirthday,
  validTimeZone,
} from "../_shared/birthday-rewards-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeProfile(row: any) {
  if (!row) return null;
  return {
    birthMonth: Number(row.birth_month),
    birthDay: Number(row.birth_day),
    timezone: String(row.timezone || "UTC"),
    birthdaySetAt: row.birthday_set_at,
    birthdayChangedAt: row.birthday_changed_at,
    selfServiceChangeAvailableAt: row.self_service_change_available_at,
  };
}

function safeClaim(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    rewardType: row.reward_type,
    eligiblePlan: row.eligible_plan,
    status: row.status,
    claimedAt: row.claimed_at,
    benefitStartsAt: row.benefit_starts_at,
    benefitEndsAt: row.benefit_ends_at,
    amountOffCents: row.amount_off_cents,
    currency: row.currency,
  };
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

async function loadRewardState(admin: any, userId: string, now: Date) {
  const [profileResult, claimResult, subscription] = await Promise.all([
    admin.from("birthday_profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("birthday_reward_claims").select("*").eq("user_id", userId).order("claimed_at", { ascending: false }).limit(1).maybeSingle(),
    loadSubscription(admin, userId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (claimResult.error) throw claimResult.error;
  const profile = profileResult.data;
  const latestClaim = claimResult.data;
  const activeSubscription = paidSubscriptionIsEligible(subscription?.status);
  const plan = normalizeBirthdayPlan(subscription?.plan);
  const window = profile
    ? birthdayWindowState(now, String(profile.timezone || "UTC"), Number(profile.birth_month), Number(profile.birth_day))
    : null;
  const cooldown = rollingCooldownState(now, latestClaim?.claimed_at);
  const activeProPass = latestClaim?.reward_type === "standard_pro_week"
    && latestClaim?.status === "active"
    && latestClaim?.benefit_starts_at
    && latestClaim?.benefit_ends_at
    && now >= new Date(latestClaim.benefit_starts_at)
    && now < new Date(latestClaim.benefit_ends_at);
  return {
    profile,
    latestClaim,
    subscription,
    activeSubscription,
    plan,
    window,
    cooldown,
    activeProPass,
  };
}

async function recordEvent(admin: any, userId: string, actorUserId: string, eventType: string, beforeState: any, afterState: any) {
  const result = await admin.from("birthday_reward_events").insert({
    user_id: userId,
    actor_user_id: actorUserId,
    event_type: eventType,
    before_state: beforeState || {},
    after_state: afterState || {},
  });
  if (result.error) throw result.error;
}

async function stripeRequest(path: string, options: { method?: string; params?: URLSearchParams; idempotencyKey?: string } = {}) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey) throw new Error("stripe_not_configured");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      ...(options.params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.params?.toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Birthday Stripe request failed", response.status, body?.error?.code || "unknown");
    const error = new Error("stripe_request_failed");
    (error as any).code = body?.error?.code || "stripe_request_failed";
    throw error;
  }
  return body;
}

function subscriptionHasAnotherDiscount(subscription: any) {
  if (Array.isArray(subscription?.discounts) && subscription.discounts.length > 0) return true;
  if (subscription?.discount) return true;
  const customer = subscription?.customer;
  return !!(customer && typeof customer === "object" && customer.discount);
}

async function applyProRenewalCredit(admin: any, userId: string, claim: any) {
  const subscriptionId = String(claim.stripe_subscription_id || "");
  if (!subscriptionId) throw new Error("subscription_missing");
  const subscription = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=discounts&expand[]=customer.discount`);
  if (subscriptionHasAnotherDiscount(subscription)) {
    await admin.from("birthday_reward_claims").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", claim.id);
    await recordEvent(admin, userId, userId, "reward_queued", {}, { claimId: claim.id, reason: "existing_discount" });
    return { status: "queued", couponId: null };
  }

  const couponId = `qd_bday_${String(claim.id).replace(/-/g, "")}`;
  const couponParams = new URLSearchParams({
    id: couponId,
    amount_off: String(PRO_RENEWAL_CREDIT_CENTS),
    currency: PRO_RENEWAL_CREDIT_CURRENCY,
    duration: "once",
    max_redemptions: "1",
    name: "QuoteDr birthday gift",
    "metadata[claim_id]": String(claim.id),
    "metadata[user_id]": userId,
  });
  try {
    await stripeRequest("/v1/coupons", { method: "POST", params: couponParams, idempotencyKey: `birthday-coupon-${claim.id}` });
  } catch (error) {
    if ((error as any).code !== "resource_already_exists") throw error;
  }
  const updateParams = new URLSearchParams({
    "discounts[0][coupon]": couponId,
    proration_behavior: "none",
    "metadata[birthday_reward_claim_id]": String(claim.id),
  });
  const updated = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    params: updateParams,
    idempotencyKey: `birthday-subscription-${claim.id}`,
  });
  const discounts = Array.isArray(updated?.discounts) ? updated.discounts : [];
  const discountId = discounts.length ? String(discounts[discounts.length - 1]?.id || discounts[discounts.length - 1] || "") : null;
  const result = await admin.from("birthday_reward_claims").update({
    status: "applied",
    stripe_coupon_id: couponId,
    stripe_discount_id: discountId,
    failure_code: null,
    updated_at: new Date().toISOString(),
  }).eq("id", claim.id).select().single();
  if (result.error) throw result.error;
  await recordEvent(admin, userId, userId, "reward_applied", {}, { claimId: claim.id, couponId });
  return { status: "applied", couponId };
}

function stateResponse(state: any, now: Date) {
  const profile = safeProfile(state.profile);
  const latestClaim = safeClaim(state.latestClaim);
  const retryableCredit = state.latestClaim?.reward_type === "pro_renewal_credit" && state.latestClaim?.status === "failed";
  const claimable = !!profile
    && !!state.window?.eligibleNow
    && (!state.cooldown.blocked || retryableCredit)
    && state.activeSubscription;
  return {
    profile,
    latestClaim,
    activeProPass: !!state.activeProPass,
    activeProPassEndsAt: state.activeProPass ? state.latestClaim?.benefit_ends_at : null,
    plan: state.plan,
    planLabel: state.plan === "pro" ? "Pro" : "Standard",
    subscriptionStatus: state.subscription?.status || "not_started",
    birthdayWindow: state.window,
    claimCooldown: state.cooldown,
    claimable,
    rewardPreview: rewardForPlan(state.plan),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const permission = action === "status" ? ACCOUNT_PERMISSION.BILLING_READ : ACCOUNT_PERMISSION.BILLING_MANAGE;
    const auth = await requireAccountPermissionWithDefault(req, body.accountId, permission);
    if (auth.user.id !== auth.ownerUserId) {
      return json({ error: "Only the account owner can manage birthday rewards", code: "owner_required" }, 403);
    }
    const admin = serviceClient();
    const now = new Date();

    if (action === "status") {
      let state = await loadRewardState(admin, auth.ownerUserId, now);
      // A Pro gift that was deliberately queued behind an existing promotion
      // is retried when the owner next checks rewards. Stripe idempotency keys
      // make this safe, and the already-authorized claim remains the authority.
      if (state.latestClaim?.reward_type === "pro_renewal_credit" && state.latestClaim?.status === "queued") {
        try {
          await applyProRenewalCredit(admin, auth.ownerUserId, state.latestClaim);
          state = await loadRewardState(admin, auth.ownerUserId, now);
        } catch (error) {
          console.warn("Queued birthday credit is not ready to apply", (error as Error)?.message || error);
        }
      }
      return json({ data: stateResponse(state, now) });
    }

    if (action === "set_birthday") {
      const month = Number(body.birthMonth);
      const day = Number(body.birthDay);
      const timezone = validTimeZone(body.timezone) ? String(body.timezone) : "UTC";
      if (!validBirthday(month, day)) return json({ error: "Choose a valid birthday month and day", code: "invalid_birthday" }, 400);
      const existing = await admin.from("birthday_profiles").select("*").eq("user_id", auth.ownerUserId).maybeSingle();
      if (existing.error) throw existing.error;
      const unchanged = existing.data && Number(existing.data.birth_month) === month && Number(existing.data.birth_day) === day;
      if (existing.data && !unchanged && now < new Date(existing.data.self_service_change_available_at)) {
        return json({
          error: "Your birthday can be changed once every 365 days. Contact customer service if this was entered incorrectly.",
          code: "birthday_change_cooldown",
          changeAvailableAt: existing.data.self_service_change_available_at,
        }, 409);
      }
      const row = {
        user_id: auth.ownerUserId,
        birth_month: month,
        birth_day: day,
        timezone,
        birthday_set_at: existing.data?.birthday_set_at || now.toISOString(),
        birthday_changed_at: existing.data && !unchanged ? now.toISOString() : existing.data?.birthday_changed_at || null,
        self_service_change_available_at: existing.data && unchanged
          ? existing.data.self_service_change_available_at
          : addDays(now, BIRTHDAY_CHANGE_COOLDOWN_DAYS).toISOString(),
        updated_at: now.toISOString(),
      };
      const saved = await admin.from("birthday_profiles").upsert(row, { onConflict: "user_id" }).select().single();
      if (saved.error) throw saved.error;
      if (!existing.data || !unchanged) {
        await recordEvent(
          admin,
          auth.ownerUserId,
          auth.user.id,
          existing.data ? "birthday_changed" : "birthday_set",
          existing.data ? { birthMonth: existing.data.birth_month, birthDay: existing.data.birth_day } : {},
          { birthMonth: month, birthDay: day },
        );
      }
      const state = await loadRewardState(admin, auth.ownerUserId, now);
      return json({ data: stateResponse(state, now) });
    }

    if (action === "claim") {
      const state = await loadRewardState(admin, auth.ownerUserId, now);
      if (!state.profile) return json({ error: "Add your birthday before claiming a gift", code: "birthday_required" }, 400);
      if (!state.window?.eligibleNow) return json({ error: "Your birthday gift becomes available on your birthday for 30 days", code: "outside_claim_window" }, 409);
      if (state.cooldown.blocked) {
        if (state.latestClaim?.reward_type === "pro_renewal_credit" && state.latestClaim?.status === "failed") {
          try {
            await applyProRenewalCredit(admin, auth.ownerUserId, state.latestClaim);
            const retriedState = await loadRewardState(admin, auth.ownerUserId, now);
            return json({ data: stateResponse(retriedState, now) });
          } catch (error) {
            return json({ error: "Your $50 birthday credit is reserved, but Stripe is not ready to attach it yet. You can retry without losing the gift.", code: "credit_retry_failed" }, 502);
          }
        }
        return json({
          error: "This account has already claimed its birthday gift within the last 365 days",
          code: "gift_already_claimed",
          nextEligibleAt: state.cooldown.nextEligibleAt,
        }, 409);
      }
      if (!state.activeSubscription) {
        return json({ error: "An active paid QuoteDr subscription is required to claim this gift", code: "active_subscription_required" }, 409);
      }
      const reward = rewardForPlan(state.plan);
      const isPass = reward.rewardType === "standard_pro_week";
      const inserted = await admin.rpc("quotedr_claim_birthday_reward", {
        p_user_id: auth.ownerUserId,
        p_reward_type: reward.rewardType,
        p_eligible_plan: state.plan,
        p_status: isPass ? "active" : "queued",
        p_benefit_starts_at: isPass ? now.toISOString() : null,
        p_benefit_ends_at: isPass ? addDays(now, STANDARD_PRO_PASS_DAYS).toISOString() : null,
        p_amount_off_cents: isPass ? null : PRO_RENEWAL_CREDIT_CENTS,
        p_currency: isPass ? null : PRO_RENEWAL_CREDIT_CURRENCY,
        p_stripe_subscription_id: isPass ? null : state.subscription?.stripe_subscription_id || null,
      });
      if (inserted.error) throw inserted.error;
      const claim = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
      if (!claim || new Date(claim.claimed_at).getTime() < now.getTime() - 60_000) {
        return json({ error: "This account has already claimed its birthday gift", code: "gift_already_claimed" }, 409);
      }
      await recordEvent(admin, auth.ownerUserId, auth.user.id, "reward_claimed", {}, { claimId: claim.id, rewardType: reward.rewardType });
      if (!isPass) {
        try {
          await applyProRenewalCredit(admin, auth.ownerUserId, claim);
        } catch (error) {
          const failureCode = String((error as any)?.code || (error as Error)?.message || "reward_apply_failed").slice(0, 120);
          await admin.from("birthday_reward_claims").update({ status: "failed", failure_code: failureCode, updated_at: new Date().toISOString() }).eq("id", claim.id);
          await recordEvent(admin, auth.ownerUserId, auth.user.id, "reward_failed", {}, { claimId: claim.id, failureCode });
          return json({ error: "Your gift was reserved, but the billing credit could not be attached. Customer service can safely retry it.", code: "credit_reserved_apply_failed" }, 502);
        }
      }
      const nextState = await loadRewardState(admin, auth.ownerUserId, now);
      return json({ data: stateResponse(nextState, now) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
    console.error("birthday-rewards failed", error);
    return json({ error: "Birthday rewards are temporarily unavailable", code: "birthday_rewards_unavailable" }, 500);
  }
});
