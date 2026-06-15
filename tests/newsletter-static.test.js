const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const updatesPath = path.join(__dirname, '..', 'data', 'whats-new.json');
assert(fs.existsSync(updatesPath), 'curated whats-new data file should exist');

const updates = JSON.parse(read('data/whats-new.json'));
assert(updates.app === 'QuoteDr', 'updates data should identify QuoteDr');
assert(Array.isArray(updates.entries), 'updates data should expose entries array');
assert(updates.entries.length >= 8, 'updates data should seed at least 8 update topics');
assert(updates.entries.every((entry) => entry.newsletterEligible === true), 'seed updates should be newsletter eligible');
assert(updates.entries.every((entry) => entry.date && entry.title && entry.category && entry.summary && entry.newsletterBlurb), 'each update needs newsletter-ready fields');

const whatsNew = read('whats-new.html');
assert(whatsNew.includes('What&rsquo;s New'), 'whats-new page should have a clear title');
assert(whatsNew.includes('data/whats-new.json'), 'whats-new page should load the curated update source');
assert(whatsNew.includes('newsletterSignupForm'), 'whats-new page should include newsletter signup');
assert(whatsNew.includes('newsletter-signup.js'), 'whats-new page should include newsletter signup script');

const blogIndex = read('blog/index.html');
assert(blogIndex.includes('../whats-new.html') || blogIndex.includes('whats-new.html'), 'blog index should link to whats-new page');
assert(blogIndex.includes('newsletterSignupForm'), 'blog index should include newsletter signup');

const signupScript = read('newsletter-signup.js');
assert(signupScript.includes('newsletter-signup'), 'newsletter signup script should call newsletter-signup function');
assert(signupScript.includes('consentSource'), 'newsletter signup should send source/consent context');

const migration = fs.readdirSync(path.join(__dirname, '..', 'supabase', 'migrations'))
  .filter((name) => name.includes('newsletter_subscribers'))
  .map((name) => read(path.join('supabase', 'migrations', name)))
  .join('\n');
assert(migration.includes('create table if not exists public.newsletter_subscribers'), 'migration should create newsletter_subscribers');
assert(migration.includes('alter table public.newsletter_subscribers enable row level security'), 'newsletter table should have RLS enabled');
assert(migration.includes('unsubscribe_token'), 'newsletter subscribers should have unsubscribe token');

const functionSource = read('supabase/functions/newsletter-signup/index.ts');
assert(functionSource.includes('newsletter_subscribers'), 'signup function should write newsletter_subscribers');
assert(functionSource.includes('crypto.randomUUID'), 'signup function should create unsubscribe tokens');
assert(functionSource.includes('subscribed'), 'signup function should store subscribed status');

const draftScript = read('scripts/generate-newsletter-draft.js');
assert(draftScript.includes('whats-new.json'), 'draft generator should read curated updates');
assert(draftScript.includes('unsubscribe'), 'draft generator should include unsubscribe footer copy');
assert(draftScript.includes('newsletter-drafts'), 'draft generator should write newsletter draft artifacts');

console.log('newsletter static test passed');
