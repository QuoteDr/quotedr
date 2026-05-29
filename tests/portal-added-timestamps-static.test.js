const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const portal = fs.readFileSync('client-portal.html', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');

assert(
  dashboard.includes('function stampPortalAddedAt(') &&
    dashboard.match(/stampPortalAddedAt\(data\)/g).length >= 4,
  'Dashboard portal add/update flows should stamp portal_added_at'
);

assert(
  builder.includes('quoteData.portal_added_at = quoteData.portal_added_at || new Date().toISOString();'),
  'Quote builder portal publishing should keep stamping portal_added_at'
);

assert(
  supabase.includes('portal_added_at: quoteData.portal_added_at || null'),
  'Quote saves should preserve portal_added_at in cloud data'
);

assert(
  portal.includes('function portalAddedDateLabel(') &&
    portal.includes('Added to portal:') &&
    portal.includes('portal_added_at'),
  'Client portal should render the portal-added timestamp for documents'
);

assert(
  portal.includes('portalAddedDateLabel(row)'),
  'Client portal change order cards should include the portal-added timestamp'
);

assert(
  portal.includes('Manage in Dashboard') &&
    !portal.includes('Edit in Builder'),
  'Admin portal preview should send users back to dashboard instead of editing portal documents directly'
);
