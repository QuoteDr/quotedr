export const MIN_PROMOTION_DAYS = 1;
export const MAX_PROMOTION_DAYS = 90;

export function normalizePromotionPlan(plan) {
  return String(plan || "").trim().toLowerCase() === "pro" ? "pro" : "standard";
}

export function paidSubscriptionAllowsPromotion(status) {
  return ["active", "trialing"].includes(String(status || "").trim().toLowerCase());
}

export function validPromotionDuration(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= MIN_PROMOTION_DAYS && days <= MAX_PROMOTION_DAYS;
}

export function promotionAudienceAllows(audience, plan, hasPaidSubscription) {
  const target = String(audience || "all");
  if (target === "all") return true;
  if (!hasPaidSubscription) return false;
  return target === normalizePromotionPlan(plan);
}

export function promotionIsActive(campaign, now = new Date()) {
  if (!campaign || String(campaign.status || "") !== "active") return false;
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at) : null;
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at) : null;
  if (startsAt && (!Number.isFinite(startsAt.getTime()) || startsAt > now)) return false;
  if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt < now)) return false;
  return true;
}

export function addPromotionDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildPromotionState(campaign, claim, claimCount, subscription, now = new Date()) {
  const paid = paidSubscriptionAllowsPromotion(subscription && subscription.status);
  const plan = normalizePromotionPlan(subscription && subscription.plan);
  const active = promotionIsActive(campaign, now);
  const audienceVisible = active && promotionAudienceAllows(campaign && campaign.target_audience, plan, paid);
  const rewardType = String(campaign && campaign.promotion_reward_type || "none");
  const maxClaims = campaign && campaign.promotion_max_claims == null ? null : Number(campaign.promotion_max_claims);
  const claimLimitReached = maxClaims != null && Number(claimCount || 0) >= maxClaims;
  const rewardEligible = rewardType !== "pro_access_days" || (paid && plan === "standard");
  return {
    promotionId: campaign && campaign.id,
    visible: audienceVisible && rewardEligible && (!claimLimitReached || !!claim),
    claimable: audienceVisible && rewardType === "pro_access_days" && rewardEligible && !claim && !claimLimitReached,
    rewardType,
    durationDays: Number(campaign && campaign.promotion_duration_days || 0),
    claimed: !!claim,
    benefitStartsAt: claim && claim.benefit_starts_at || null,
    benefitEndsAt: claim && claim.benefit_ends_at || null,
    claimLimitReached,
  };
}
