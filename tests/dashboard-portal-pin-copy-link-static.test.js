const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  !dashboard.includes('Copy Link + PIN'),
  'Portal PIN copy buttons should be labeled Copy Link, not Copy Link + PIN'
);

assert(
  !/clipboard\.writeText\([^)]*PIN:/s.test(dashboard),
  'Portal copy actions should not copy the client PIN with the portal URL'
);

assert(
  dashboard.includes('function copyPortalPinBundle('),
  'Manage Portals PIN reveal row should still have a copy handler'
);

assert(
  /function copyPortalPinBundle\([\s\S]*?clipboard\.writeText\(url\)/.test(dashboard),
  'Manage Portals PIN reveal copy handler should copy only the portal URL'
);
