const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const portal = fs.readFileSync('client-portal.html', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const quoteStyle = fs.readFileSync('quote-style.js', 'utf8');

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
  /function previewInteractiveQuote\(\)[\s\S]*previewUrl\.searchParams\.set\('preview', '1'\)[\s\S]*previewUrl\.searchParams\.set\('admin_preview', '1'\)[\s\S]*window\.location\.href = previewUrl\.toString\(\)/.test(quoteStyle),
  'Quote builder Preview Quote should open with contractor preview flags so it does not trigger client-view alerts'
);

assert(
  /function isContractorPreviewView\s*\([^)]*\)/.test(viewer) &&
    viewer.includes("params.get('preview') === '1'") &&
    viewer.includes("params.get('admin_preview') === '1'") &&
    viewer.includes("params.get('admin') === '1'"),
  'Interactive quote viewer should recognize contractor preview flags'
);

assert(
  /async function markQuoteViewed[\s\S]*var isPreview = isContractorPreviewView\(params\);[\s\S]*if\s*\(isPreview\)\s*return;/.test(viewer),
  'Interactive quote viewer should skip mark_viewed for contractor previews'
);

assert(
  /function logPortalDocumentActivity[\s\S]*if\s*\(isContractorPreviewView\(new URLSearchParams\(window\.location\.search\)\)\)\s*return;/.test(viewer),
  'Interactive quote viewer should skip activity alerts for contractor previews'
);

assert(
  viewer.includes('function showContractorPreviewSignBlockedMessage()') &&
    /You cannot sign this for the client/i.test(viewer) &&
    /function handleMainAction\([^)]*\)[\s\S]*if\s*\(isContractorPreviewView\(\)\)\s*\{[\s\S]*showContractorPreviewSignBlockedMessage\(\);[\s\S]*return;/.test(viewer),
  'Interactive quote viewer should block contractor previews from signing for the client'
);

assert(
  /function openSignatureModal\(\)[\s\S]*if\s*\(isContractorPreviewView\(\)\)\s*\{[\s\S]*showContractorPreviewSignBlockedMessage\(\);[\s\S]*return;/.test(viewer),
  'Signature modal should also guard against direct contractor-preview calls'
);

console.log('admin client preview no-viewed static test passed');
