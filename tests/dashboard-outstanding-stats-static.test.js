const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('row row-cols-2 row-cols-lg-5 mb-4 g-3'),
  'Dashboard stats row should support five cards without awkward desktop wrapping'
);

assert(
  dashboard.includes('<h5 class="card-title">Outstanding</h5>') &&
    dashboard.includes('id="outstandingRevenue"'),
  'Dashboard should render an Outstanding stat card'
);

assert(
  dashboard.includes('const outstanding = quotes.reduce((sum, q) => sum + dashboardOutstandingAmount(q), 0)') &&
    dashboard.includes("document.getElementById('outstandingRevenue').textContent"),
  'Dashboard stats should calculate and render outstanding receivables'
);

assert(
  dashboard.includes('function dashboardOutstandingAmount(quote)') &&
    dashboard.includes("status !== 'invoiced'") &&
    dashboard.includes("paymentStatus === 'paid'") &&
    dashboard.includes('Math.max(total - dashboardPaidAmount(quote), 0)'),
  'Outstanding amount should count only invoiced, unpaid documents minus recorded payments'
);

assert(
  dashboard.includes('function dashboardPaidAmount(quote)') &&
    dashboard.includes('payment.amount_cents') &&
    dashboard.includes('payment.paid_at'),
  'Outstanding amount should subtract recorded paid payment amounts'
);
