const fs = require('fs');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(items.includes('laborTime'), 'Manage Items should store laborTime on saved items');
assert(items.includes('item-labor-mode'), 'Manage Items rows should expose a labor time mode control');
assert(items.includes('item-units-per-hour'), 'Manage Items rows should expose units-per-hour input');
assert(items.includes('item-fixed-hours'), 'Manage Items rows should expose fixed-hours input');
assert(items.includes('renderManageLaborPill'), 'Manage Items should summarize labor time on each row');

assert(builder.includes('normalizeLaborTime'), 'Quote Builder should normalize saved labor time');
assert(builder.includes('estimateItemLaborHours'), 'Quote Builder should calculate estimated hours per line item');
assert(builder.includes('openTimelineReport'), 'Quote Builder should expose a Timeline Report modal');
assert(builder.includes('timelineReportModal'), 'Quote Builder should include the Timeline Report modal markup');
assert(builder.includes('View Timeline'), 'Quote total should include a View Timeline action');
assert(builder.includes('laborTime: normalizeLaborTime'), 'Line items should carry labor time from saved items into the quote');
assert(builder.includes('_voiceReviewDisplayRate'), 'AI Voice review should display matched saved item rates instead of parser zeroes');

console.log('timeline report static test passed');
