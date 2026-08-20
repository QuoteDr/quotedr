const fs = require('fs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(dashboard.includes('input-group dashboard-quote-search'), 'quote search should use its emphasized dashboard treatment');
assert(dashboard.includes('.dashboard-quote-search:focus-within'), 'quote search should have a clear keyboard and pointer focus state');
assert(dashboard.includes('border-color: #9bb9da'), 'quote search should have a stronger resting border');
assert(dashboard.includes('aria-label="Search quotes"'), 'quote search should keep an explicit accessible label');
assert(dashboard.includes('Search by file name, client name, or quote number...'), 'quote search guidance should remain intact');

console.log('dashboard search visibility static test passed');
