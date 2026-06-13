const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const quoteViewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const clientViewHelperStart = dashboard.indexOf('async function openClientDocumentPreview');
const clientViewHelperEnd = dashboard.indexOf('function previewPortalFromDashboard', clientViewHelperStart);
const clientViewHelper = clientViewHelperStart > -1 && clientViewHelperEnd > clientViewHelperStart
  ? dashboard.slice(clientViewHelperStart, clientViewHelperEnd)
  : '';

assert(
  dashboard.includes('openClientDocumentPreview'),
  'Dashboard should expose a Client View action for portal documents'
);

assert(
  /portalVisible\s*\?\s*`<button[^`]*openClientDocumentPreview/.test(dashboard) &&
    dashboard.includes('Client View'),
  'Portal-visible dashboard cards should render a Client View button'
);

assert(
  dashboard.includes("'/invoice-viewer.html'") &&
    dashboard.includes("'/interactive-quote-viewer.html'") &&
    dashboard.includes("mode: 'document'"),
  'Client View should open the document viewer through the existing secure document share flow'
);

assert(
  dashboard.includes("url.searchParams.set('preview', '1')"),
  'Dashboard Client View links should mark contractor previews so they do not count as client views'
);

assert(
  !clientViewHelper.includes('window.open') &&
    clientViewHelper.includes('window.location.href = url.toString()'),
  'Dashboard Client View should navigate the current tab instead of opening a popup/new window'
);

assert(
  /params\.get\('preview'\)\s*===\s*'1'/.test(quoteViewer) &&
    /if\s*\(.*isPreview.*\)\s*return;/.test(quoteViewer),
  'Interactive quote viewer should skip mark_viewed when opened as a contractor preview'
);
