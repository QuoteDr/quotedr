const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migration = read('supabase/migrations/20260824150000_birthday_rewards.sql');
const edge = read('supabase/functions/birthday-rewards/index.ts');
const core = read('supabase/functions/_shared/birthday-rewards-core.ts');
const browser = read('birthday-rewards.js');
const supabase = read('supabase-v2.js');
const team = read('supabase/functions/team-account/index.ts');
const onboarding = read('onboarding.html');
const settings = read('settings.html');
const dashboard = read('dashboard.html');
const privacy = read('privacy.html');
const config = read('supabase/config.toml');

['birthday_profiles', 'birthday_reward_claims', 'birthday_reward_events'].forEach((table) => {
  assert(migration.includes(`create table if not exists public.${table}`), `${table} should exist`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table} should enable RLS`);
  assert(migration.includes(`revoke all on table public.${table} from anon, authenticated`), `${table} should deny direct browser access`);
});
assert(migration.includes("set search_path = ''"), 'claim RPC should use an empty search path');
assert(migration.includes('pg_advisory_xact_lock'), 'claims should serialize per account');
assert(migration.includes("claimed_at > pg_catalog.now() - interval '365 days'"), 'database should enforce the rolling claim cooldown');
assert(migration.includes('grant select, insert on table public.birthday_reward_events to service_role'), 'event audit should be append-only');
assert(!migration.includes('grant all on table public.birthday_reward_events'), 'event audit must not grant updates or deletes');
assert(migration.includes('quotedr_subscription_status_insert_server_only'), 'browser must not forge an active subscription');
assert(migration.includes("with check (key <> 'subscription_status')"), 'subscription status writes should stay server-only');

assert(edge.includes('requireAccountPermissionWithDefault') && edge.includes('ACCOUNT_PERMISSION.BILLING_MANAGE'), 'mutations should require billing management');
assert(edge.includes('auth.user.id !== auth.ownerUserId'), 'team members must not manage owner birthday rewards');
assert(edge.includes('paidSubscriptionIsEligible'), 'claim should require an active paid plan');
assert(edge.includes('quotedr_claim_birthday_reward'), 'claim should use the serialized database function');
assert(edge.includes('proration_behavior') && edge.includes('none'), 'Pro credit must not change billing dates or prorate');
assert(edge.includes('subscriptionHasAnotherDiscount'), 'Pro credit should detect an existing discount');
assert(edge.includes('status: "queued"'), 'existing promotions should queue rather than be overwritten');
assert(edge.includes('Idempotency-Key'), 'Stripe mutations should be idempotent');
assert(edge.includes('credit_retry_failed') && edge.includes('retryableCredit'), 'a failed Pro attachment should remain safely retryable');
assert(core.includes('PRO_RENEWAL_CREDIT_CENTS = 5000'), 'Pro reward should be a flat $50 CAD');
assert(core.includes('STANDARD_PRO_PASS_DAYS = 7'), 'Standard reward should be seven days of Pro');
assert(/\[functions\.birthday-rewards\][\s\S]*verify_jwt\s*=\s*true/.test(config), 'birthday rewards function should require JWT verification');

assert(onboarding.includes('Month and day only') && !onboarding.includes('birthdayYear'), 'onboarding should not request birth year');
assert(onboarding.includes('birthdayMonth') && onboarding.includes('birthdayDay'), 'onboarding should offer optional birthday fields');
assert(settings.includes('Birthday &amp; Annual Gift') && settings.includes('birthdayRewardsSettings'), 'settings should manage birthday and gift status');
assert(dashboard.includes('birthdayRewardDashboard'), 'dashboard should provide an eligible gift surface');
assert(browser.includes('Activate my birthday gift') && browser.includes('It starts only when you activate it'), 'gift activation should be explicit');
assert(browser.includes("state.plan === 'pro'") && browser.includes('$50 CAD'), 'browser copy should distinguish Pro reward');
assert(browser.includes('seven consecutive days of Pro'), 'browser copy should describe the Standard reward');
assert(supabase.includes('qdBirthdayProPassIsActive'), 'browser entitlements should recognize the temporary pass');
assert(team.includes("reward_type', 'standard_pro_week'") && team.includes('benefit_ends_at'), 'team entitlements should inherit the owner account pass');
assert(privacy.includes('optional birthday month and day') && privacy.includes('one-gift-per-365-days'), 'privacy notice should disclose birthday reward processing');

console.log('birthday rewards static test passed');
