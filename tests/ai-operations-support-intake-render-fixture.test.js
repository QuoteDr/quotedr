const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, 'ai-operations-support-intake-render-fixture.html'), 'utf8');

assert(source.includes('customer@example.invalid'), 'fixture must use a reserved synthetic address');
assert(!/fetch\(|localStorage|sessionStorage|indexedDB|supabase/i.test(source), 'fixture must not access a network, browser storage, or Supabase');
assert(source.includes('Original customer message') && source.includes('Recommended response') && source.includes('Engineering handoff'), 'fixture must show all three intake boundaries');
assert(source.includes('Customer email included: false') && source.includes('Secure links or tokens included: false'), 'handoff fixture must prove redaction flags');
assert(source.includes('Support Agent unavailable: no response was invented.') && source.includes('no send action'), 'fixture must preserve adapter failure and no-autosend boundaries');
assert(source.includes("get('viewport') === 'mobile'") && source.includes('width: 390px') && source.includes('grid-template-columns: 1fr'), 'fixture must provide an inspectable 390px single-column mode');
assert(!/send email|deploy|grant credit|poll mailbox|launch agent/i.test(source.replace(/no send, deploy, grant-credit, mailbox-poll, or agent-launch control/i, '')), 'fixture must not expose execution controls');
console.log('AI Operations support-intake synthetic render fixture checks passed');
