const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const files = [
  'client-portal.html',
  'dashboard.html',
  'home-depot-price-sync.html',
  'home-depot-tracker.html',
  'interactive-quote-viewer.html',
  'invoice-viewer.html',
  'labor-tracker.html',
  'login.html',
  'onboarding.html',
  'portal-theme-studio.html',
  'quote-builder.html',
  'settings.html',
];

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = Array.from(source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
  let parsed = 0;
  scripts.forEach((match, index) => {
    const attrs = match[1] || '';
    if (/\bsrc\s*=|type\s*=\s*["'](?:application\/ld\+json|application\/json|module)/i.test(attrs)) return;
    try {
      new Function(match[2]);
      parsed++;
    } catch (error) {
      assert.fail(`${file} inline script ${index + 1} has invalid JavaScript: ${error.message}`);
    }
  });
  assert(parsed > 0, `${file} should contain at least one parsed inline script`);
}

console.log('modified HTML inline script syntax checks passed');
