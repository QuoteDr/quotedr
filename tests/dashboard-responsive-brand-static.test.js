const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('.dashboard-brand.dashboard-brand-colliding') &&
    dashboard.includes('visibility: hidden;'),
  'The dashboard brand should become invisible when it collides with navigation controls'
);

assert(
  dashboard.includes('function updateDashboardBrandVisibility()') &&
    dashboard.includes("brand.classList.toggle('dashboard-brand-colliding', isColliding);") &&
    dashboard.includes("window.addEventListener('resize', updateDashboardBrandVisibility"),
  'The dashboard should recalculate brand visibility when the header width changes'
);

assert(
  dashboard.includes('new ResizeObserver(updateDashboardBrandVisibility)') &&
    dashboard.includes('observer.observe(actions);'),
  'The dashboard should react when conditional action buttons change the header width'
);

assert(
  dashboard.includes('class="d-none d-md-flex align-items-center gap-1"') &&
    dashboard.includes('class="dropdown d-md-none"'),
  'The existing desktop-button and mobile-dropdown breakpoints should remain unchanged'
);

console.log('dashboard responsive brand static test passed');
