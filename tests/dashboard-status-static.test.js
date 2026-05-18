const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = dashboard.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert(match, `${selector} rule should exist`);
  return match[1].replace(/\s+/g, ' ').trim();
}

const inReviewRule = cssRule('.status-in_review');
const invoicedRule = cssRule('.status-invoiced');

assert.strictEqual(
  invoicedRule,
  inReviewRule,
  'Invoiced status should use the same readable orange treatment as In Review'
);
