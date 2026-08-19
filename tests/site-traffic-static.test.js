const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const analyticsSource = read('analytics.js');
const storage = new Map();
const captured = [];
let posthogConfig = null;
const posthog = {
  __SV: 1,
  init(_token, config) { posthogConfig = config; },
  capture(name, properties) { captured.push({ name, properties }); },
  identify() {},
  reset() {},
  set_config() {}
};
const window = {
  location: {
    hostname: 'quotedr.io',
    pathname: '/pricing.html',
    href: 'https://quotedr.io/pricing.html?client=hidden&token=secret#plans'
  },
  navigator: { userAgent: 'Mozilla/5.0', doNotTrack: '0' },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  posthog
};
const document = {
  referrer: 'https://www.google.com/search?q=private+search',
  createElement() { return {}; },
  getElementsByTagName() {
    return [{ parentNode: { insertBefore() {} } }];
  }
};

vm.runInNewContext(analyticsSource, {
  window,
  document,
  URL,
  Object,
  Array,
  JSON,
  String,
  Number,
  Math,
  RegExp,
  parseFloat,
  decodeURIComponent
}, { filename: 'analytics.js' });

const analytics = window.QuoteDrAnalytics;
const helpers = analytics._test;
assert(posthogConfig && typeof posthogConfig.before_send === 'function', 'PostHog should install a before_send privacy filter');
assert(captured.some(event => event.name === 'page_viewed'), 'marketing pages should capture a normalized page visit');
assert(captured.some(event => event.name === 'pricing_opened'), 'pricing should capture a high-intent event');
assert.strictEqual(helpers.safeRoute('/blog/index.html?token=secret#top'), '/blog');
assert.strictEqual(helpers.safeRoute('/client-portal/12345678901234567890?token=secret'), '/client-portal/:id');
assert.strictEqual(helpers.safeReferrerDomain('https://www.google.com/search?q=private'), 'google.com');
assert.strictEqual(helpers.isAnalyticsHostAllowed('localhost'), false, 'localhost must not be tracked');
assert.strictEqual(helpers.isKnownBot('Googlebot/2.1'), true, 'known bots must not be tracked');

const scrubbed = helpers.sanitizePostHogEvent({
  event: 'page_viewed',
  properties: {
    $current_url: 'https://quotedr.io/pricing.html?client=Adam&token=secret#plans',
    $referrer: 'https://example.com/private/path?q=secret',
    client_email: 'client@example.com',
    message: 'private',
    $elements: [{ text: 'private page text' }]
  }
});
assert.strictEqual(scrubbed.properties.$current_url, 'https://quotedr.io/pricing');
assert.strictEqual(scrubbed.properties.$pathname, '/pricing');
assert.strictEqual(scrubbed.properties.route, '/pricing');
assert.strictEqual(scrubbed.properties.site_area, 'marketing');
assert.strictEqual(scrubbed.properties.audience, 'visitor');
assert.strictEqual(scrubbed.properties.$referring_domain, 'google.com');
assert(!('$referrer' in scrubbed.properties), 'full referrer URLs must be removed');
assert(!('client_email' in scrubbed.properties), 'client identifiers must be removed');
assert(!('message' in scrubbed.properties), 'free-form messages must be removed');
assert(!('$elements' in scrubbed.properties), 'marketing autocapture elements must be removed');
assert(!JSON.stringify(scrubbed).includes('secret'), 'query strings, hashes, and tokens must be removed');

window.navigator.doNotTrack = '1';
assert.strictEqual(analytics.isAvailable(), false, 'Do Not Track must disable analytics');
window.navigator.doNotTrack = '0';
window.location.hostname = '127.0.0.1';
assert.strictEqual(analytics.isAvailable(), false, 'local testing must disable analytics');
window.location.hostname = 'quotedr.io';

const rootMarketingPages = [
  'landing.html', 'about.html', 'contact.html', 'pricing.html',
  'tutorials.html', 'whats-new.html', 'terms.html', 'privacy.html'
];
const blogPages = [
  'blog/index.html',
  'blog/how-to-price-upgrades-without-awkward-sales.html',
  'blog/interactive-quotes-vs-pdfs.html',
  'blog/know-what-your-last-job-cost.html',
  'blog/turn-your-excel-quote-into-a-system.html',
  'blog/why-contractors-should-stop-quoting-from-scratch.html'
];
rootMarketingPages.forEach(page => {
  assert(read(page).includes('src="analytics.js?'), page + ' should load root marketing analytics');
});
blogPages.forEach(page => {
  assert(read(page).includes('src="../analytics.js?'), page + ' should load blog marketing analytics');
});

const newsletter = read('newsletter-signup.js');
assert(newsletter.includes("capture('newsletter_signup_completed'"), 'newsletter success should emit a high-intent event');

const settings = read('settings.html');
const trafficFunction = read('supabase/functions/analytics-traffic/index.ts');
const alertFunction = read('supabase/functions/visitor-alert/index.ts');
const migration = read('supabase/migrations/20260802031650_visitor_traffic_alerts.sql');
const config = read('supabase/config.toml');

assert(settings.includes('id="siteTrafficTabLink"') && settings.includes('id="tab-site-traffic"'), 'settings should expose the admin traffic panel');
assert(settings.includes("'site-traffic'") && settings.includes('isQuoteDrAdminUser'), 'Site Traffic should use the shared admin guard');
assert(settings.includes('30000'), 'visible traffic panel should refresh every 30 seconds');
assert(/last (?:5|five) minutes/i.test(settings), 'active visitor copy should define the live window honestly');
assert(trafficFunction.includes('verifyAdmin(req)'), 'traffic function must verify admin access');
assert(trafficFunction.includes('properties.site_area') && trafficFunction.includes('marketingFilter'), 'traffic queries must isolate marketing events');
assert(trafficFunction.includes('properties.audience') && trafficFunction.includes('marketingFilter'), 'traffic queries must exclude product users');
assert(trafficFunction.includes("return 'Visitor '"), 'traffic function should generate anonymous visitor labels');
assert(!trafficFunction.includes('rawIp:'), 'traffic response must not expose raw IP values');
assert(alertFunction.includes('POSTHOG_VISITOR_WEBHOOK_SECRET'), 'visitor webhook must require a secret');
assert(alertFunction.includes("safeText(properties.site_area) !== 'marketing'"), 'webhook must reject non-marketing events');
assert(alertFunction.includes("'event:' + (providerCandidate"), 'provider event identifiers should be hashed before storage');
assert(alertFunction.includes('record_visitor_alert'), 'webhook should use atomic database deduplication');
assert(migration.includes('enable row level security'), 'alert summaries must use RLS');
assert(migration.includes("interval '30 minutes'"), 'alert emails should deduplicate for 30 minutes');
assert(migration.includes("interval '90 days'"), 'alert summaries should be removed after 90 days');
assert(migration.includes('security invoker'), 'the alert RPC should not bypass caller privileges');
assert(config.includes('[functions.analytics-traffic]') && config.includes('[functions.visitor-alert]'), 'both functions should be configured');

console.log('site traffic static test passed');
