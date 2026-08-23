const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8').replace(/\r\n/g, '\n');

function sourceFunction(name) {
  const starts = [
    dashboard.indexOf('        function ' + name + '('),
    dashboard.indexOf('        async function ' + name + '(')
  ].filter((index) => index >= 0);
  assert(starts.length, name + ' should exist in dashboard.html');
  const start = Math.min(...starts);
  const openingBrace = dashboard.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < dashboard.length; index += 1) {
    if (dashboard[index] === '{') depth += 1;
    if (dashboard[index] === '}') depth -= 1;
    if (depth === 0) return dashboard.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

const modalStart = dashboard.indexOf('<div class="modal fade" id="portalShareModal"');
const modalEnd = dashboard.indexOf('<!-- Quote Divider Wording Prompt Modal -->', modalStart);
assert(modalStart >= 0 && modalEnd > modalStart, 'Portal share modal should exist');
const shareModal = dashboard.slice(modalStart, modalEnd);

assert(!shareModal.includes('ADMIN PREVIEW LINK'), 'Admin view should not be presented as a copyable link');
assert(!shareModal.includes('portalAdminUrlDisplay'), 'Admin URL field should be removed');
assert(!dashboard.includes('function copyPortalAdminUrl('), 'Admin view should not have a clipboard handler');
assert(!dashboard.includes('function copyPortalBoth('), 'Ambiguous portal copy handler should be removed');
assert(
  shareModal.includes('onclick="openPortalAdminUrl(event)"') && shareModal.includes('>Admin View</button>'),
  'Admin view should remain available as an open-only button'
);
assert(
  shareModal.includes('onclick="togglePortalShareActivity(event)"') &&
    shareModal.includes('id="portalShareActivityPanel"') &&
    shareModal.includes('>See Activity</button>'),
  'Portal share modal should offer an inline document activity shortcut'
);
assert(
  shareModal.includes('onclick="copyPortalUrl(event)"') &&
    shareModal.includes('onclick="copyPortalUrl(event, true)"') &&
    shareModal.includes('Copy Client Viewer Link'),
  'Both visible copy controls should explicitly use the client viewer copy handler'
);
assert(
  sourceFunction('shareClientPortal').includes('window._currentPortalAdminUrl = adminUrl;'),
  'Portal sharing should retain the admin URL only in memory for the Admin View button'
);

const clipboardWrites = [];
const copyButton = { innerHTML: 'Copy', closest: () => copyButton };
const context = {
  window: {
    _currentPortalAdminUrl: 'https://quotedr.io/client-portal.html?admin=1',
    location: { href: '' }
  },
  document: {
    getElementById(id) {
      assert.strictEqual(id, 'portalUrlDisplay');
      return { value: 'https://myprojectview.ca/p/client-viewer-token' };
    }
  },
  navigator: {
    clipboard: {
      writeText(value) {
        clipboardWrites.push(value);
        return Promise.resolve();
      }
    }
  },
  URL,
  setTimeout(callback) { callback(); },
  console
};
vm.createContext(context);
vm.runInContext(sourceFunction('copyPortalUrl') + '\n' + sourceFunction('openPortalAdminUrl'), context);

function makeEvent() {
  return {
    prevented: false,
    stopped: false,
    target: copyButton,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
}

const iconCopyEvent = makeEvent();
context.copyPortalUrl(iconCopyEvent, false);
const primaryCopyEvent = makeEvent();
context.copyPortalUrl(primaryCopyEvent, true);

assert.deepStrictEqual(
  clipboardWrites,
  ['https://myprojectview.ca/p/client-viewer-token', 'https://myprojectview.ca/p/client-viewer-token'],
  'Every portal share copy control should copy only the client viewer link'
);
assert(iconCopyEvent.prevented && iconCopyEvent.stopped, 'Client copy icon should isolate its click event');
assert(primaryCopyEvent.prevented && primaryCopyEvent.stopped, 'Primary client copy button should isolate its click event');

const previewEvent = makeEvent();
context.openPortalAdminUrl(previewEvent);
assert.strictEqual(
  context.window.location.href,
  'https://quotedr.io/client-portal.html?admin=1',
  'Admin View should still open the private admin URL'
);
assert.strictEqual(clipboardWrites.length, 2, 'Opening Admin View must not copy its URL');
assert(previewEvent.prevented && previewEvent.stopped, 'Admin View should isolate its click event');

assert(sourceFunction('togglePortalShareActivity').includes('loadSecureClientDocumentActivity(quoteId)'), 'See Activity should use the authenticated activity loader inside the dashboard');
assert(sourceFunction('renderPortalShareActivity').includes('Total opens'), 'Inline activity should summarize document opens');
assert(sourceFunction('renderPortalShareActivity').includes('Viewing time'), 'Inline activity should summarize active viewing time');

vm.runInContext(
  sourceFunction('dashboardPortalActivityDuration') + '\n' + sourceFunction('dashboardPortalActivityTimeline'),
  context
);
const activityTimeline = context.dashboardPortalActivityTimeline([
  { id: 'open-1', event_type: 'document_opened', session_id: 'session-1', created_at: '2026-08-20T10:00:00Z' },
  { id: 'beat-1', event_type: 'document_view_duration', session_id: 'session-1', duration_seconds: 45, created_at: '2026-08-20T10:00:45Z' },
  { id: 'beat-2', event_type: 'document_view_duration', session_id: 'session-1', duration_seconds: 30, created_at: '2026-08-20T10:01:15Z' },
  { id: 'pdf-1', event_type: 'pdf_opened', session_id: 'session-1', created_at: '2026-08-20T10:02:00Z' }
]);
const combinedView = activityTimeline.find(event => event.event_type === 'document_view_duration');
assert(combinedView, 'Dashboard activity should retain a combined viewing session');
assert.strictEqual(combinedView.duration_seconds, 75, 'Dashboard activity should combine heartbeat duration for the same viewing session');
assert.strictEqual(context.dashboardPortalActivityDuration(75), '1m 15s', 'Dashboard activity should format combined viewing time clearly');

console.log('dashboard portal client viewer copy static test passed');
