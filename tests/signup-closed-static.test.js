const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const login = read('login.html');
const gate = read('signup-gate.js');
const gateStyles = read('signup-gate.css');
const supabaseClient = read('supabase-v2.js');
const legacySupabaseClient = read('supabase.js');
const supabaseConfig = read('supabase/config.toml');

assert(login.includes('Existing Member Sign In'), 'login should be clearly limited to existing members');
assert(login.includes('signup-gate.js'), 'login should support closed-signup direct links');
assert(!login.includes('id="signupForm"'), 'login should not render a signup form');
assert(!login.includes('handleSignUp'), 'login should not expose a signup handler');
assert(!login.includes('.auth.signUp'), 'login should not call Supabase signup');
assert(!supabaseClient.includes('.auth.signUp'), 'shared Supabase client should not expose public account creation');
assert(!legacySupabaseClient.includes('.auth.signUp'), 'legacy Supabase client should not expose public account creation');

assert(gate.includes('window.QuoteDrSignupGate'), 'shared gate should expose a reusable browser interface');
assert(gate.includes('Public signup is temporarily closed'), 'gate should explain that public signup is closed');
assert(gate.includes('15-day early-adopter offer'), 'gate should explain the limited launch window');
assert(gate.includes('$49 CAD/month'), 'gate should state the early-adopter Pro price');
assert(gate.includes('subscription remains continuously active'), 'gate should state the continuous-subscription condition');
assert(gate.includes('https://www.instagram.com/quotedr.io/'), 'gate should point to the planned QuoteDr Instagram account');
assert(gate.includes('Existing Member Sign In'), 'gate should keep existing-member login available');
assert(gate.includes("event.key === 'Escape'") && gate.includes("event.key !== 'Tab'"), 'gate should support Escape and keyboard focus trapping');
assert(gateStyles.includes('.qd-signup-gate__dialog'), 'gate should include shared responsive styling');

const rootMarketingPages = ['landing.html', 'about.html', 'contact.html', 'tutorials.html', 'whats-new.html'];
const blogPages = [
  'blog/index.html',
  'blog/how-to-price-upgrades-without-awkward-sales.html',
  'blog/interactive-quotes-vs-pdfs.html',
  'blog/know-what-your-last-job-cost.html',
  'blog/turn-your-excel-quote-into-a-system.html',
  'blog/why-contractors-should-stop-quoting-from-scratch.html'
];

rootMarketingPages.forEach((page) => {
  const source = read(page);
  assert(source.includes('signup-gate.css'), `${page} should load signup gate styles`);
  assert(source.includes('signup-gate.js'), `${page} should load the signup gate behavior`);
});

blogPages.forEach((page) => {
  const source = read(page);
  assert(source.includes('../signup-gate.css'), `${page} should load signup gate styles from the site root`);
  assert(source.includes('../signup-gate.js'), `${page} should load signup gate behavior from the site root`);
});

assert(/\[auth\][\s\S]*enable_signup\s*=\s*false/.test(supabaseConfig), 'local Supabase auth should disable account creation');
assert(/\[auth\.email\][\s\S]*enable_signup\s*=\s*false/.test(supabaseConfig), 'local email signup should be disabled');

console.log('closed signup static test passed');
