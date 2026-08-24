import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPromotionDays,
  buildPromotionState,
  normalizePromotionPlan,
  paidSubscriptionAllowsPromotion,
  promotionAudienceAllows,
  promotionIsActive,
  validPromotionDuration,
} from '../supabase/functions/_shared/promotion-rewards-core.mjs';

test('promotion duration is bounded and deterministic', () => {
  assert.equal(validPromotionDuration(1), true);
  assert.equal(validPromotionDuration(7), true);
  assert.equal(validPromotionDuration(90), true);
  assert.equal(validPromotionDuration(0), false);
  assert.equal(validPromotionDuration(91), false);
  assert.equal(validPromotionDuration(2.5), false);
  assert.equal(addPromotionDays(new Date('2026-08-24T12:00:00.000Z'), 7).toISOString(), '2026-08-31T12:00:00.000Z');
});

test('audiences distinguish Standard and Pro paid plans', () => {
  assert.equal(normalizePromotionPlan('starter'), 'standard');
  assert.equal(normalizePromotionPlan('basic'), 'standard');
  assert.equal(normalizePromotionPlan('PRO'), 'pro');
  assert.equal(paidSubscriptionAllowsPromotion('active'), true);
  assert.equal(paidSubscriptionAllowsPromotion('trialing'), true);
  assert.equal(paidSubscriptionAllowsPromotion('cancelled'), false);
  assert.equal(promotionAudienceAllows('standard', 'basic', true), true);
  assert.equal(promotionAudienceAllows('standard', 'pro', true), false);
  assert.equal(promotionAudienceAllows('pro', 'pro', true), true);
  assert.equal(promotionAudienceAllows('pro', 'pro', false), false);
  assert.equal(promotionAudienceAllows('all', 'basic', false), true);
});

test('campaign timing honours start and end boundaries', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  assert.equal(promotionIsActive({ status: 'active' }, now), true);
  assert.equal(promotionIsActive({ status: 'draft' }, now), false);
  assert.equal(promotionIsActive({ status: 'active', starts_at: '2026-08-24T13:00:00.000Z' }, now), false);
  assert.equal(promotionIsActive({ status: 'active', ends_at: '2026-08-24T11:59:59.000Z' }, now), false);
  assert.equal(promotionIsActive({
    status: 'active',
    starts_at: '2026-08-24T11:00:00.000Z',
    ends_at: '2026-08-24T13:00:00.000Z',
  }, now), true);
});

test('a live free-Pro campaign is claimable only by eligible Standard accounts', () => {
  const campaign = {
    id: 'promotion-1',
    status: 'active',
    target_audience: 'standard',
    promotion_reward_type: 'pro_access_days',
    promotion_duration_days: 7,
    promotion_max_claims: 100,
  };
  const now = new Date('2026-08-24T12:00:00.000Z');
  const standard = buildPromotionState(campaign, null, 2, { status: 'active', plan: 'basic' }, now);
  assert.equal(standard.visible, true);
  assert.equal(standard.claimable, true);
  assert.equal(standard.durationDays, 7);

  const pro = buildPromotionState(campaign, null, 2, { status: 'active', plan: 'pro' }, now);
  assert.equal(pro.visible, false);
  assert.equal(pro.claimable, false);

  const inactive = buildPromotionState(campaign, null, 2, { status: 'cancelled', plan: 'basic' }, now);
  assert.equal(inactive.visible, false);
  assert.equal(inactive.claimable, false);
});

test('claim caps stop new claims but never hide an existing activation', () => {
  const campaign = {
    id: 'promotion-2',
    status: 'active',
    target_audience: 'standard',
    promotion_reward_type: 'pro_access_days',
    promotion_duration_days: 3,
    promotion_max_claims: 2,
  };
  const subscription = { status: 'active', plan: 'basic' };
  const capped = buildPromotionState(campaign, null, 2, subscription);
  assert.equal(capped.visible, false);
  assert.equal(capped.claimable, false);
  assert.equal(capped.claimLimitReached, true);

  const existing = buildPromotionState(campaign, {
    benefit_starts_at: '2026-08-24T12:00:00.000Z',
    benefit_ends_at: '2026-08-31T12:00:00.000Z',
  }, 2, subscription);
  assert.equal(existing.visible, true);
  assert.equal(existing.claimed, true);
  assert.equal(existing.claimable, false);
});
