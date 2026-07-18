const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const helperMatch = dashboard.match(/function dashboardRevenueAmount\(quote\) \{[\s\S]*?\n        \}/);

assert(helperMatch, 'Dashboard should define a paid-revenue helper');

const dashboardRevenueAmount = new Function(`return (${helperMatch[0]});`)();

assert.strictEqual(dashboardRevenueAmount({ status: 'draft', total: 1000 }), 0);
assert.strictEqual(dashboardRevenueAmount({ status: 'sent', total: 2000 }), 0);
assert.strictEqual(dashboardRevenueAmount({ status: 'accepted', total: 3000 }), 0);
assert.strictEqual(dashboardRevenueAmount({ status: 'invoiced', total: 4000 }), 0);
assert.strictEqual(
  dashboardRevenueAmount({ status: 'invoiced', total: 4500, data: { paymentStatus: 'paid' } }),
  0,
  'Revenue should follow the document status shown on the dashboard'
);
assert.strictEqual(dashboardRevenueAmount({ status: 'paid', total: 5000 }), 5000);
assert.strictEqual(dashboardRevenueAmount({ status: 'PAID', total: '6250.75' }), 6250.75);
assert.strictEqual(dashboardRevenueAmount({ data: { status: 'paid', grandTotal: 7000 } }), 7000);
assert.strictEqual(
  dashboardRevenueAmount({ status: 'paid', total: 8000, data: { document_validity: 'voided' } }),
  0,
  'A voided document must never count as paid revenue'
);

assert(
  dashboard.includes('const revenue = quotes.reduce((sum, q) => sum + dashboardRevenueAmount(q), 0);'),
  'Revenue stats should sum only values accepted by the paid-revenue helper'
);

console.log('dashboard paid revenue behavior test passed');
