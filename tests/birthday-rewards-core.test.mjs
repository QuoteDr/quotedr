import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BIRTHDAY_CLAIM_WINDOW_DAYS,
  PRO_RENEWAL_CREDIT_CENTS,
  STANDARD_PRO_PASS_DAYS,
  addDays,
  birthdayWindowState,
  normalizeBirthdayPlan,
  paidSubscriptionIsEligible,
  rewardForPlan,
  rollingCooldownState,
  validBirthday,
  validTimeZone,
} from '../supabase/functions/_shared/birthday-rewards-core.ts';

test('birthday validation stores month and day without requiring a year', () => {
  assert.equal(validBirthday(2, 29), true);
  assert.equal(validBirthday(2, 30), false);
  assert.equal(validBirthday(4, 31), false);
  assert.equal(validBirthday(12, 31), true);
  assert.equal(validTimeZone('America/Toronto'), true);
  assert.equal(validTimeZone('Not/A_Timezone'), false);
});

test('birthday claim window opens on the local birthday for 30 days', () => {
  const birthday = birthdayWindowState(new Date('2026-08-24T12:00:00Z'), 'America/Toronto', 8, 24);
  assert.equal(birthday.eligibleNow, true);
  assert.equal(birthday.daysRemaining, BIRTHDAY_CLAIM_WINDOW_DAYS);

  const finalDay = birthdayWindowState(new Date('2026-09-22T12:00:00Z'), 'America/Toronto', 8, 24);
  assert.equal(finalDay.eligibleNow, true);
  assert.equal(finalDay.daysRemaining, 1);

  const expired = birthdayWindowState(new Date('2026-09-23T12:00:00Z'), 'America/Toronto', 8, 24);
  assert.equal(expired.eligibleNow, false);
});

test('February 29 birthdays use February 28 in non-leap years', () => {
  const state = birthdayWindowState(new Date('2027-02-28T17:00:00Z'), 'America/Toronto', 2, 29);
  assert.equal(state.eligibleNow, true);
  assert.equal(state.birthdayYear, 2027);
});

test('one reward is enforced for a rolling 365 days regardless of birthday edits', () => {
  const claimed = '2026-08-24T12:00:00.000Z';
  assert.equal(rollingCooldownState(new Date('2027-08-23T12:00:00.000Z'), claimed).blocked, true);
  assert.equal(rollingCooldownState(new Date('2027-08-24T12:00:00.000Z'), claimed).blocked, false);
});

test('Standard gets seven Pro days and Pro gets a flat $50 CAD renewal credit', () => {
  assert.equal(normalizeBirthdayPlan('starter'), 'basic');
  assert.deepEqual(rewardForPlan('basic'), { rewardType: 'standard_pro_week', passDays: STANDARD_PRO_PASS_DAYS });
  assert.deepEqual(rewardForPlan('pro'), { rewardType: 'pro_renewal_credit', amountOffCents: PRO_RENEWAL_CREDIT_CENTS, currency: 'cad' });
  assert.equal(PRO_RENEWAL_CREDIT_CENTS, 5000);
});

test('only active paid subscriptions can claim', () => {
  assert.equal(paidSubscriptionIsEligible('active'), true);
  assert.equal(paidSubscriptionIsEligible('trialing'), false);
  assert.equal(paidSubscriptionIsEligible('past_due'), false);
  assert.equal(paidSubscriptionIsEligible('cancelled'), false);
});

test('Standard Pro pass duration is exactly seven consecutive days', () => {
  const start = new Date('2026-08-24T15:30:00.000Z');
  assert.equal(addDays(start, STANDARD_PRO_PASS_DAYS).toISOString(), '2026-08-31T15:30:00.000Z');
});
