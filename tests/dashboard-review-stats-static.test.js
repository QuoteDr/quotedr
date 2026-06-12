const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('Viewed / Review'),
  'Dashboard review stat should make it clear viewed quotes are included'
);

assert(
  dashboard.includes("q.status === 'viewed' || q.status === 'in_review'"),
  'Dashboard review stat should count quotes opened by the client as well as manual in-review quotes'
);

assert(
  dashboard.includes('<option value="viewed"') &&
    dashboard.includes('<option value="in_review"'),
  'Viewed and In Review should remain separate selectable statuses'
);
