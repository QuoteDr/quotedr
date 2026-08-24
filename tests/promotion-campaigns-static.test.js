const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const settings = read('settings.html');
const broadcasts = read('app-broadcasts.js');
const migration = read('supabase/migrations/20260824135618_promotion_campaigns.sql');
const edge = read('supabase/functions/promotion-rewards/index.ts');
const core = read('supabase/functions/_shared/promotion-rewards-core.mjs');
const browserEntitlements = read('supabase-v2.js');
const team = read('supabase/functions/team-account/index.ts');
const aiGuard = read('supabase/functions/_shared/ai-guard.ts');
const config = read('supabase/config.toml');
const privacy = read('privacy.html');

assert(settings.includes('broadcastPromotionReward'), 'admin messages should choose a promotion reward');
assert(settings.includes('broadcastTargetAudience'), 'admin messages should target an audience');
assert(settings.includes('broadcastPromotionDays'), 'admin messages should configure Pro access days');
assert(settings.includes('broadcastPromotionMaxClaims'), 'admin messages should configure an optional activation limit');
assert(settings.includes('toggleBroadcastPromotionFields'), 'promotion controls should respond to message type and reward');
assert(settings.includes("action: 'admin_stats'"), 'settings should show claim and active counts');
assert(settings.includes("payload.target_audience = 'standard'"), 'free Pro should be restricted to Standard accounts');
assert(settings.includes("payload.cta_url = ''"), 'claimable rewards must not use an arbitrary activation URL');

['target_audience', 'promotion_reward_type', 'promotion_duration_days', 'promotion_max_claims'].forEach((column) => {
  assert(migration.includes(`add column if not exists ${column}`), `${column} should extend broadcasts`);
});
assert(migration.includes('create table if not exists public.promotion_claims'), 'promotion claims should be persisted');
assert(migration.includes('unique (promotion_id, user_id)'), 'each account should claim a campaign only once');
assert(migration.includes('alter table public.promotion_claims enable row level security'), 'claims should enable RLS');
assert(migration.includes('revoke all on table public.promotion_claims from public, anon, authenticated'), 'claims must not be browser writable');
assert(migration.includes('quotedr_claim_promotion'), 'claims should use a serialized database function');
assert(migration.includes("set search_path = ''"), 'claim function should have an empty search path');
assert(migration.includes('pg_advisory_xact_lock'), 'claim limits should serialize');
assert(migration.includes('promotion_claim_limit_reached'), 'database should enforce total activation limits');
assert(!migration.includes('grant execute on function public.quotedr_claim_promotion(\n  uuid, uuid, timestamptz, timestamptz\n) to authenticated'), 'claim RPC must not be exposed to browsers');

assert(edge.includes('requireAccountPermissionWithDefault'), 'promotion operations should use account authorization');
assert(edge.includes('ACCOUNT_PERMISSION.BILLING_MANAGE'), 'activation should require billing management');
assert(edge.includes('auth.user.id !== auth.ownerUserId'), 'only account owners should activate promotions');
assert(edge.includes('buildPromotionState'), 'edge eligibility should use the tested promotion contract');
assert(core.includes('paidSubscriptionAllowsPromotion'), 'reward activation should require a paid subscription');
assert(core.includes('paid && plan === "standard"'), 'free Pro rewards should be limited to Standard subscribers');
assert(edge.includes('quotedr_claim_promotion'), 'edge function should use the serialized claim function');
assert(edge.includes('ADMIN_EMAILS') && edge.includes('admin_stats'), 'activation stats should be administrator-only');
assert(/\[functions\.promotion-rewards\][\s\S]*verify_jwt\s*=\s*true/.test(config), 'promotion function should require JWT verification');

assert(broadcasts.includes("promotionCall('status'"), 'broadcast loader should resolve server-side eligibility');
assert(broadcasts.includes("promotionCall('claim'"), 'broadcast activation should call the authenticated function');
assert(broadcasts.includes('quotedr-entitlements-changed'), 'successful activation should refresh feature gates');
assert(broadcasts.includes('Preview only — no Pro access was activated.'), 'preview must never activate a reward');

assert(browserEntitlements.includes('qdTemporaryProAccessIsActive'), 'browser feature gates should include promotion access');
assert(team.includes("from('promotion_claims')"), 'team entitlements should inherit account-owner promotion access');
assert(aiGuard.includes('temporaryProAccessIsActive'), 'server AI gates should accept temporary Pro access');
assert(privacy.includes('Promotion activations:'), 'privacy notice should disclose promotion activation retention');

console.log('promotion campaigns static test passed');
