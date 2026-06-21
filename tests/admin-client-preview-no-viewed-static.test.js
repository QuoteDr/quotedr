const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const portal = fs.readFileSync('client-portal.html', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  dashboard.includes("url.searchParams.set('preview', '1')") &&
    dashboard.includes("url.searchParams.set('admin_preview', '1')"),
  'Dashboard Client View should mark direct contractor previews with preview and admin_preview flags'
);

assert(
  portal.includes('portalPreviewQuerySuffix') &&
    portal.includes("requestedAdminView ? '&preview=1&admin_preview=1' : ''"),
  'Admin portal document links should carry contractor preview flags'
);

assert(
  /function isContractorPreviewView\s*\([^)]*\)/.test(viewer) &&
    viewer.includes("params.get('preview') === '1'") &&
    viewer.includes("params.get('admin_preview') === '1'"),
  'Interactive quote viewer should recognize contractor preview flags'
);

assert(
  /async function markQuoteViewed[\s\S]*var isPreview = isContractorPreviewView\(params\);[\s\S]*if\s*\(isPreview\)\s*return;/.test(viewer),
  'Interactive quote viewer should skip mark_viewed for contractor previews'
);

assert(
  viewer.includes('function showContractorPreviewSignBlockedMessage()') &&
    /You cannot sign this for the client/i.test(viewer) &&
    /function handleMainAction\(\)[\s\S]*if\s*\(isContractorPreviewView\(\)\)\s*\{[\s\S]*showContractorPreviewSignBlockedMessage\(\);[\s\S]*return;/.test(viewer),
  'Interactive quote viewer should block contractor previews from signing for the client'
);

assert(
  /function openSignatureModal\(\)[\s\S]*if\s*\(isContractorPreviewView\(\)\)\s*\{[\s\S]*showContractorPreviewSignBlockedMessage\(\);[\s\S]*return;/.test(viewer),
  'Signature modal should also guard against direct contractor-preview calls'
);

console.log('admin client preview no-viewed static test passed');
