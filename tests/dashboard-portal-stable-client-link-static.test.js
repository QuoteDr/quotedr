const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

const shareStart = dashboard.indexOf('async function shareClientPortal');
const shareEnd = dashboard.indexOf('function copyPortalUrl', shareStart);
const shareClientPortal = shareStart > -1 && shareEnd > shareStart
  ? dashboard.slice(shareStart, shareEnd)
  : '';

assert(
  dashboard.includes('portal_share_token') && dashboard.includes('portal_share_anchor_id'),
  'Dashboard should persist a stable portal share token and anchor on portal quote data'
);

assert(
  /function buildPortalRegistry\([\s\S]*secureToken[\s\S]*secureAnchorId/.test(dashboard),
  'Portal registry should carry existing stable share token metadata'
);

assert(
  /function portalUrlForDashboard\([\s\S]*token[\s\S]*portal_anchor/.test(dashboard),
  'Dashboard portal URLs should include a saved token and portal anchor when available'
);

assert(
  shareClientPortal.includes('findPortalStableShare') &&
    shareClientPortal.indexOf('findPortalStableShare') < shareClientPortal.indexOf('createSecureClientShareLink'),
  'shareClientPortal should look for an existing stable portal link before minting a new token'
);

assert(
  /if\s*\([^)]*!stableShare\.token[\s\S]*createSecureClientShareLink/.test(shareClientPortal),
  'shareClientPortal should mint a token only when no stable portal token exists yet'
);

assert(
  shareClientPortal.includes('persistPortalStableShare'),
  'shareClientPortal should save the first generated portal token for future dashboard opens'
);
