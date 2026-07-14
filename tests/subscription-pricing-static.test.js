const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const landing = read('landing.html');
const pricing = read('pricing.html');
const help = read('help.html');
const checkout = read('supabase/functions/stripe-checkout/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const config = read('supabase/config.toml');

['$39', '$390', '$99', '$990'].forEach((amount) => {
  assert(landing.includes(amount), `landing should advertise ${amount}`);
  assert(pricing.includes(amount), `pricing page should include ${amount}`);
});
assert(landing.includes('QuoteDr Basic'), 'landing should consistently call the lower plan Basic');
assert(help.includes('Basic ($39 CAD/month or $390 CAD/year)'), 'help pricing should match the new Basic prices');
assert(help.includes('Pro ($99 CAD/month or $990 CAD/year)'), 'help pricing should match the new Pro prices');
assert(!/\$29|\$55|\$290|\$550/.test(landing + pricing + help), 'public pricing surfaces should not retain the old prices');

assert(pricing.includes('data-billing-interval="month"'), 'pricing should include a monthly billing control');
assert(pricing.includes('data-billing-interval="year"'), 'pricing should include an annual billing control');
assert(pricing.includes("billingInterval: selectedBillingInterval"), 'pricing should send the selected interval to checkout');
assert(pricing.includes('_supabase.auth.getSession()'), 'pricing should require a real Supabase session');
assert(pricing.includes("'Authorization': 'Bearer ' + session.access_token"), 'pricing should authenticate checkout with the user access token');
assert(!pricing.includes('JSON.stringify({ email: email, userId: userId'), 'pricing should not send browser-trusted identity fields');

[
  'STRIPE_PRICE_ID_BASIC_MONTHLY',
  'STRIPE_PRICE_ID_BASIC_ANNUAL',
  'STRIPE_PRICE_ID_PRO_MONTHLY',
  'STRIPE_PRICE_ID_PRO_ANNUAL'
].forEach((secret) => assert(checkout.includes(secret) || checkout.includes('priceSecretName'), `checkout should support ${secret}`));

assert(checkout.includes('supabase.auth.getUser()'), 'checkout should resolve identity from the authenticated Supabase request');
assert(checkout.includes('normalizePlan') && checkout.includes('normalizeBillingInterval'), 'checkout should validate plan and billing interval');
assert(checkout.includes('metadata[billing_interval]'), 'checkout should persist billing interval in Stripe metadata');
assert(checkout.includes('subscription_data[trial_period_days]') && checkout.includes('"14"'), 'checkout should preserve the 14-day trial');
assert(!checkout.includes('const { email, userId'), 'checkout should not trust email or user ID from the request body');
assert(/\[functions\.stripe-checkout\][\s\S]*verify_jwt\s*=\s*true/.test(config), 'Stripe checkout should require JWT verification');
assert(webhook.includes('subscriptionBillingInterval'), 'Stripe webhook should normalize subscription billing intervals');
assert(webhook.includes('billing_interval: subscriptionBillingInterval'), 'Stripe webhook should store billing interval in subscription status');

console.log('subscription pricing static test passed');
